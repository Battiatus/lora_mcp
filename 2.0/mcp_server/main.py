#!/usr/bin/env python
import os
import sys
import logging
import json
import uuid
import asyncio
import traceback
import time
import random
import re
import math
import httpx
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s [%(name)s] - %(message)s",
)

logger = logging.getLogger(__name__)


# Pydantic models for API
class ToolRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    session_id: Optional[str] = None

class ToolResponse(BaseModel):
    success: bool
    result: Any
    error: Optional[str] = None

class ListToolsResponse(BaseModel):
    tools: List[Dict[str, Any]]

# Global context storage
contexts: Dict[str, Any] = {}

# Import dependencies
try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    import nest_asyncio
    nest_asyncio.apply()
    logger.info("Dependencies imported successfully")
except ImportError as e:
    logger.error(f"Failed to import dependencies: {e}")
    sys.exit(1)

# User agents pour anti-détection
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
]

# Simplified context management
class SimpleAppContext:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.session_id = None

async def get_or_create_context(session_id: str) -> SimpleAppContext:
    """Get or create a context for the session"""
    if session_id not in contexts:
        logger.info(f"Creating new context for session: {session_id}")
        
        context = SimpleAppContext()
        context.session_id = session_id
        
        # Initialize Playwright
        context.playwright = await async_playwright().start()
        
        # Launch browser avec configuration anti-détection
        context.browser = await context.playwright.chromium.launch(
            headless=False,  # Peut être changé en False pour debug
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--window-size=1920,1080',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',  # Pour accélérer le chargement
                '--hide-scrollbars',
                '--mute-audio'
            ]
        )
        
        # Create browser context avec user agent aléatoire
        user_agent = random.choice(USER_AGENTS)
        context.context = await context.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent=user_agent,
            locale='fr-FR',
            timezone_id='Europe/Paris'
        )
        
        # Ajouter script anti-détection
        await context.context.add_init_script("""
        // Masquer les signes de WebDriver
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        
        // Masquer les traces d'automatisation
        delete window.playwright;
        delete window.__playwright;
        delete window.__pw_manual;
        
        // Simuler des plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', description: 'Portable Document Format' },
                { name: 'Chrome PDF Viewer', description: '' },
                { name: 'Native Client', description: '' }
            ]
        });
        """)
        
        # Create page
        context.page = await context.context.new_page()
        
        # Store context
        contexts[session_id] = context
        
        logger.info(f"Context created successfully for session: {session_id}")
        
    return contexts[session_id]

async def cleanup_context(session_id: str):
    """Cleanup a specific context"""
    if session_id in contexts:
        context = contexts[session_id]
        try:
            if context.page:
                await context.page.close()
            if context.context:
                await context.context.close()
            if context.browser:
                await context.browser.close()
            if context.playwright:
                await context.playwright.stop()
        except Exception as e:
            logger.error(f"Error cleaning up context {session_id}: {e}")
        finally:
            del contexts[session_id]
            logger.info(f"Context {session_id} cleaned up")

# Mock context class for tool functions
class MockContext:
    def __init__(self, app_context: SimpleAppContext):
        self.app_context = app_context
        
    def info(self, message: str):
        logger.info(f"[{self.app_context.session_id}] {message}")
        
    def error(self, message: str):
        logger.error(f"[{self.app_context.session_id}] {message}")
        
    def warning(self, message: str):
        logger.warning(f"[{self.app_context.session_id}] {message}")

# === FONCTIONS UTILITAIRES TIKTOK ===

def is_valid_tiktok_url(url: str) -> bool:
    """Vérifier si l'URL est une URL TikTok valide"""
    tiktok_patterns = [
        r'https?://(?:www\.)?tiktok\.com/@[\w.-]+/video/\d+',
        r'https?://(?:www\.)?tiktok\.com/t/[\w-]+',
        r'https?://vm\.tiktok\.com/[\w-]+',
        r'https?://(?:www\.)?tiktok\.com/embed/v2/\d+',
    ]
    return any(re.match(pattern, url) for pattern in tiktok_patterns)

def clean_tiktok_url(url: str) -> str:
    """Nettoyer et normaliser l'URL TikTok"""
    parsed = urlparse(url)
    clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    
    if 'vm.tiktok.com' in url or '/t/' in url:
        return url
    
    return clean_url

def generate_tiktok_filename(metadata: Dict[str, Any], url: str) -> str:
    """Générer un nom de fichier pour la vidéo TikTok"""
    video_id_match = re.search(r'/video/(\d+)', url)
    video_id = video_id_match.group(1) if video_id_match else str(uuid.uuid4())[:8]
    
    title = metadata.get('title', '')
    if title:
        title = re.sub(r'[^\w\s-]', '', title)[:50]
        title = re.sub(r'\s+', '_', title)
        return f"tiktok_{video_id}_{title}.mp4"
    
    return f"tiktok_{video_id}_{int(time.time())}.mp4"

def format_file_size(size_bytes: int) -> str:
    """Formater la taille de fichier en format lisible"""
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.2f} {size_names[i]}"

async def simulate_human_behavior(page: Page):
    """Simuler un comportement humain"""
    try:
        # Mouvements de souris aléatoires
        for _ in range(random.randint(2, 5)):
            x = random.randint(100, 1800)
            y = random.randint(100, 900)
            await page.mouse.move(x, y)
            await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # Scroll aléatoire
        scroll_amount = random.randint(100, 300)
        await page.mouse.wheel(0, scroll_amount)
        await asyncio.sleep(random.uniform(0.5, 1.0))
        
    except Exception:
        pass
async def analyze_tiktok_url_tool(url: str, ctx: MockContext) -> Dict[str, Any]:
    """Analyser une URL TikTok et extraire toutes les informations disponibles"""
    try:
        page = ctx.app_context.page
        
        ctx.info(f"Analyse de l'URL TikTok: {url}")
        
        # Navigation intelligente
        nav_result = await smart_tiktok_navigation(page, url, ctx)
        if not nav_result["success"]:
            return {"success": False, "error": f"Échec de navigation: {nav_result['error']}"}
        
        # Extraction complète des données
        tiktok_data = await extract_comprehensive_tiktok_data(page, ctx)
        
        # Analyse de l'URL
        url_info = extract_tiktok_info_from_url(nav_result['url'])
        
        return {
            "success": True,
            "url_analysis": url_info,
            "video_data": tiktok_data.get('video', {}),
            "user_data": tiktok_data.get('user', {}),
            "engagement_data": tiktok_data.get('engagement', {}),
            "technical_data": tiktok_data.get('technical', {}),
            "video_urls_found": len(tiktok_data.get('urls', [])),
            "downloadable": len(tiktok_data.get('urls', [])) > 0,
            "navigation_info": nav_result
        }
        
    except Exception as e:
        ctx.error(f"Erreur lors de l'analyse: {str(e)}")
        return {"success": False, "error": str(e)}


async def detect_tiktok_captcha(page: Page) -> bool:
    """Détecter la présence d'un CAPTCHA TikTok"""
    try:
        captcha_selectors = [
            'iframe[src*="captcha"]',
            'div[class*="captcha"]',
            'div[class*="verify"]',
            '.captcha_verify_container',
            '.secsdk-captcha-wrapper'
        ]
        
        for selector in captcha_selectors:
            element = await page.query_selector(selector)
            if element and await element.is_visible():
                return True
        
        return False
    except Exception:
        return False

async def solve_tiktok_puzzle_captcha(page: Page, ctx: MockContext) -> bool:
    """Résoudre le CAPTCHA puzzle TikTok"""
    try:
        ctx.info("Tentative de résolution du CAPTCHA puzzle TikTok")
        
        # Chercher le curseur à faire glisser
        selectors = [
            '.captcha_verify_slide_bar', 
            '.slider', 
            '[role="slider"]',
            'div[class*="slider"]', 
            'div[class*="drag"]'
        ]
        
        slider = None
        for selector in selectors:
            slider = await page.query_selector(selector)
            if slider:
                break
        
        if not slider:
            return False
        
        # Obtenir la position du curseur
        slider_box = await slider.bounding_box()
        if not slider_box:
            return False
        
        slider_x = slider_box['x'] + slider_box['width'] / 2
        slider_y = slider_box['y'] + slider_box['height'] / 2
        
        # Glissement avec mouvement humain
        slide_distance = random.randint(200, 300)
        
        await page.mouse.move(slider_x, slider_y)
        await asyncio.sleep(random.uniform(0.2, 0.5))
        
        await page.mouse.down()
        await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # Mouvement progressif
        steps = random.randint(15, 25)
        for i in range(1, steps + 1):
            progress = i / steps
            ease = 0.5 - 0.5 * math.cos(math.pi * progress)
            
            current_distance = slide_distance * ease
            y_offset = random.randint(-2, 2)
            
            await page.mouse.move(
                slider_x + current_distance,
                slider_y + y_offset
            )
            await asyncio.sleep(random.uniform(0.01, 0.03))
        
        await page.mouse.up()
        await asyncio.sleep(2)
        
        # Vérifier si résolu
        captcha_still_present = await detect_tiktok_captcha(page)
        return not captcha_still_present
        
    except Exception as e:
        ctx.error(f"Erreur lors de la résolution du CAPTCHA: {str(e)}")
        return False

# === OUTILS TIKTOK ===

def extract_tiktok_info_from_url(url: str) -> Dict[str, str]:
    """Extraire les informations d'une URL TikTok"""
    patterns = {
        'standard': r'https?://(?:www\.)?tiktok\.com/@([^/]+)/video/(\d+)',
        'short': r'https?://vm\.tiktok\.com/([^/]+)',
        'mobile': r'https?://(?:www\.)?tiktok\.com/t/([^/]+)',
        'embed': r'https?://(?:www\.)?tiktok\.com/embed/v2/(\d+)'
    }
    
    for pattern_type, pattern in patterns.items():
        match = re.search(pattern, url)
        if match:
            if pattern_type == 'standard':
                return {
                    'type': 'standard',
                    'username': match.group(1),
                    'video_id': match.group(2),
                    'clean_url': url
                }
            else:
                return {
                    'type': pattern_type,
                    'short_code': match.group(1),
                    'clean_url': url
                }
    
    return {'type': 'unknown', 'clean_url': url}

async def resolve_tiktok_short_url(page: Page, short_url: str, ctx: MockContext) -> str:
    """Résoudre une URL courte TikTok pour obtenir l'URL complète"""
    try:
        ctx.info(f"Résolution de l'URL courte: {short_url}")
        
        # Naviguer vers l'URL courte et capturer la redirection
        response = await page.goto(short_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_load_state("networkidle", timeout=15000)
        
        # Obtenir l'URL finale après redirection
        final_url = page.url
        ctx.info(f"URL résolue: {final_url}")
        
        return final_url
    except Exception as e:
        ctx.error(f"Erreur lors de la résolution de l'URL: {str(e)}")
        return short_url

async def smart_tiktok_navigation(page: Page, url: str, ctx: MockContext) -> Dict[str, Any]:
    """Navigation TikTok intelligente avec gestion des différents types d'URLs"""
    try:
        # Analyser l'URL
        url_info = extract_tiktok_info_from_url(url)
        ctx.info(f"Type d'URL TikTok détecté: {url_info['type']}")
        
        # Si c'est une URL courte, la résoudre d'abord
        if url_info['type'] in ['short', 'mobile']:
            url = await resolve_tiktok_short_url(page, url, ctx)
            url_info = extract_tiktok_info_from_url(url)
        
        # Configuration anti-détection renforcée
        await page.set_extra_http_headers({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Chromium";v="120", "Google Chrome";v="120", "Not:A-Brand";v="99"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': random.choice(USER_AGENTS)
        })
        
        # Simuler un comportement humain avant navigation
        await simulate_human_behavior(page)
        
        ctx.info(f"Navigation vers: {url}")
        
        # Tentatives multiples avec stratégies différentes
        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                ctx.info(f"Tentative {attempt + 1}/{max_attempts}")
                
                # Navigation
                response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                
                # Attendre le chargement
                await page.wait_for_load_state("networkidle", timeout=30000)
                
                # Vérifier si on est sur une page d'erreur
                page_title = await page.title()
                if "error" in page_title.lower() or "not found" in page_title.lower():
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(3)
                        continue
                    else:
                        return {"success": False, "error": "Page d'erreur détectée"}
                
                # Vérifier la présence de CAPTCHA
                captcha_detected = await detect_tiktok_captcha(page)
                if captcha_detected:
                    ctx.info("CAPTCHA détecté")
                    captcha_solved = await solve_tiktok_puzzle_captcha(page, ctx)
                    if captcha_solved:
                        ctx.info("CAPTCHA résolu avec succès")
                        await asyncio.sleep(2)
                        await page.wait_for_load_state("networkidle")
                    else:
                        ctx.warning("Échec de la résolution du CAPTCHA")
                        if attempt < max_attempts - 1:
                            await asyncio.sleep(5)
                            continue
                
                # Simuler l'activité utilisateur
                await simulate_user_activity_advanced(page, ctx)
                
                # Vérifier que la vidéo est présente
                video_present = await page.query_selector('video')
                if not video_present:
                    ctx.warning("Aucune vidéo détectée sur la page")
                    if attempt < max_attempts - 1:
                        await asyncio.sleep(3)
                        continue
                
                # Succès
                final_url = page.url
                final_title = await page.title()
                
                return {
                    "success": True,
                    "url": final_url,
                    "title": final_title,
                    "url_info": url_info,
                    "attempts": attempt + 1
                }
                
            except Exception as e:
                ctx.warning(f"Tentative {attempt + 1} échouée: {str(e)}")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(5)
                    continue
                else:
                    return {"success": False, "error": f"Navigation échouée après {max_attempts} tentatives: {str(e)}"}
        
    except Exception as e:
        return {"success": False, "error": f"Erreur de navigation: {str(e)}"}

async def simulate_user_activity_advanced(page: Page, ctx: MockContext):
    """Simulation d'activité utilisateur avancée pour TikTok"""
    try:
        ctx.info("Simulation d'activité utilisateur...")
        
        # Mouvements de souris réalistes
        for _ in range(random.randint(3, 8)):
            x = random.randint(200, 1700)
            y = random.randint(200, 800)
            
            # Mouvement progressif vers la cible
            current_x, current_y = 500, 400  # Position de départ
            steps = random.randint(10, 20)
            
            for step in range(steps):
                progress = step / steps
                ease = 0.5 - 0.5 * math.cos(math.pi * progress)
                
                move_x = current_x + (x - current_x) * ease
                move_y = current_y + (y - current_y) * ease
                
                # Ajouter du bruit naturel
                move_x += random.randint(-3, 3)
                move_y += random.randint(-3, 3)
                
                await page.mouse.move(move_x, move_y)
                await asyncio.sleep(random.uniform(0.01, 0.03))
            
            await asyncio.sleep(random.uniform(0.2, 0.8))
        
        # Scrolls réalistes
        for _ in range(random.randint(1, 4)):
            scroll_amount = random.randint(100, 400)
            direction = random.choice([1, -1])
            
            await page.mouse.wheel(0, scroll_amount * direction)
            await asyncio.sleep(random.uniform(0.8, 2.0))
        
        # Pause pour "regarder" la vidéo
        watch_time = random.uniform(2, 6)
        ctx.info(f"Simulation de visionnage pendant {watch_time:.1f} secondes")
        await asyncio.sleep(watch_time)
        
    except Exception as e:
        ctx.warning(f"Erreur lors de la simulation d'activité: {str(e)}")
async def extract_comprehensive_tiktok_data(page: Page, ctx: MockContext) -> Dict[str, Any]:
    """Extraction complète des données TikTok"""
    try:
        ctx.info("Extraction des données TikTok...")
        
        # Attendre que les éléments soient chargés
        await asyncio.sleep(2)
        
        # Utiliser r""" pour une chaîne brute (raw string)
        data = await page.evaluate(r"""
        () => {
            const result = {
                video: {},
                user: {},
                engagement: {},
                technical: {},
                urls: []
            };
            
            // === INFORMATIONS VIDÉO ===
            const videoElement = document.querySelector('video');
            if (videoElement) {
                result.video = {
                    src: videoElement.src || videoElement.currentSrc,
                    duration: videoElement.duration,
                    width: videoElement.videoWidth,
                    height: videoElement.videoHeight,
                    poster: videoElement.poster
                };
            }
            
            // === INFORMATIONS UTILISATEUR ===
            // Username
            const usernameSelectors = [
                '[data-e2e="browse-username"]',
                '[data-e2e="video-author-uniqueid"]',
                'h2[data-e2e="browse-username"]',
                '.author-uniqueid'
            ];
            
            for (const selector of usernameSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    result.user.username = element.textContent.trim();
                    break;
                }
            }
            
            // Display name
            const displayNameSelectors = [
                '[data-e2e="browse-username-text"]',
                '[data-e2e="video-author-nickname"]',
                '.author-nickname'
            ];
            
            for (const selector of displayNameSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    result.user.displayName = element.textContent.trim();
                    break;
                }
            }
            
            // === DESCRIPTION VIDÉO ===
            const descSelectors = [
                '[data-e2e="browse-video-desc"]',
                '[data-e2e="video-desc"]',
                '.video-meta-caption'
            ];
            
            for (const selector of descSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    result.video.description = element.textContent.trim();
                    break;
                }
            }
            
            // === MÉTRIQUES D'ENGAGEMENT ===
            // Likes
            const likeSelectors = [
                '[data-e2e="like-count"]',
                '[data-e2e="browse-like-count"]',
                '.like-count'
            ];
            
            for (const selector of likeSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    result.engagement.likes = element.textContent.trim();
                    break;
                }
            }
            
            // Comments
            const commentSelectors = [
                '[data-e2e="comment-count"]',
                '[data-e2e="browse-comment-count"]',
                '.comment-count'
            ];
            
            for (const selector of commentSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    result.engagement.comments = element.textContent.trim();
                    break;
                }
            }
            
            // Shares
            const shareSelectors = [
                '[data-e2e="share-count"]',
                '[data-e2e="browse-share-count"]',
                '.share-count'
            ];
            
            for (const selector of shareSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                    result.engagement.shares = element.textContent.trim();
                    break;
                }
            }
            
            // === EXTRACTION D'URLS VIDÉO ===
            // Sources vidéo directes
            const videos = document.querySelectorAll('video');
            videos.forEach((video, index) => {
                if (video.src) {
                    result.urls.push({
                        url: video.src,
                        type: 'video_src',
                        quality: 'unknown',
                        source: `video_${index}`
                    });
                }
                
                const sources = video.querySelectorAll('source');
                sources.forEach((source, sourceIndex) => {
                    if (source.src) {
                        result.urls.push({
                            url: source.src,
                            type: 'video_source',
                            quality: source.getAttribute('data-quality') || 'unknown',
                            source: `source_${index}_${sourceIndex}`
                        });
                    }
                });
            });
            
            // Scripts contenant des URLs
            const scripts = document.querySelectorAll('script');
            scripts.forEach((script, index) => {
                const content = script.textContent || '';
                
                // Patterns pour extraire les URLs vidéo
                const patterns = [
                    /["']playAddr["']:\s*["']([^"']+)["']/g,
                    /["']downloadAddr["']:\s*["']([^"']+)["']/g,
                    /["']url["']:\s*["']([^"']+\.mp4[^"']*)["']/g,
                    /https:\/\/[^"'\s]*\.mp4[^"'\s]*/g
                ];
                
                patterns.forEach((pattern, patternIndex) => {
                    const matches = content.matchAll(pattern);
                    for (const match of matches) {
                        let url = match[1] || match[0];
                        if (url && url.includes('.mp4')) {
                            // Nettoyer l'URL
                            url = url.replace(/\\\\u002F/g, '/').replace(/\\\\/g, '');
                            result.urls.push({
                                url: url,
                                type: 'script_extracted',
                                quality: 'unknown',
                                source: `script_${index}_pattern_${patternIndex}`
                            });
                        }
                    }
                });
            });
            
            // === INFORMATIONS TECHNIQUES ===
            result.technical = {
                url: window.location.href,
                title: document.title,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent
            };
            
            // Dédupliquer les URLs
            const uniqueUrls = [];
            const seenUrls = new Set();
            
            result.urls.forEach(item => {
                if (!seenUrls.has(item.url)) {
                    seenUrls.add(item.url);
                    uniqueUrls.push(item);
                }
            });
            
            result.urls = uniqueUrls;
            
            return result;
        }
        """)
        
        ctx.info(f"Données extraites: {len(data.get('urls', []))} URLs vidéo trouvées")
        return data
        
    except Exception as e:
        ctx.error(f"Erreur lors de l'extraction des données: {str(e)}")
        return {}
    
async def download_tiktok_video_tool(url: str, ctx: MockContext, quality: str = "best", include_audio: bool = True) -> Dict[str, Any]:
    """Télécharger une vidéo TikTok avec navigation intelligente"""
    try:
        page = ctx.app_context.page
        session_id = ctx.app_context.session_id
        
        ctx.info(f"Démarrage du téléchargement TikTok: {url}")
        
        # Valider l'URL
        if not is_valid_tiktok_url(url):
            return {"success": False, "error": "URL TikTok invalide"}
        
        # Créer les dossiers nécessaires
        download_dir = f"videos/{session_id}"
        os.makedirs(download_dir, exist_ok=True)
        
        # Navigation intelligente
        nav_result = await smart_tiktok_navigation(page, url, ctx)
        if not nav_result["success"]:
            return {"success": False, "error": f"Échec de navigation: {nav_result['error']}"}
        
        # Extraction complète des données
        tiktok_data = await extract_comprehensive_tiktok_data(page, ctx)
        
        if not tiktok_data.get('urls'):
            return {"success": False, "error": "Aucune URL vidéo trouvée"}
        
        # Sélectionner la meilleure URL
        video_urls = tiktok_data['urls']
        
        # Priorité par type de source
        priority_order = ['video_src', 'video_source', 'script_extracted']
        best_url = None
        
        for priority_type in priority_order:
            for url_data in video_urls:
                if url_data['type'] == priority_type:
                    best_url = url_data['url']
                    break
            if best_url:
                break
        
        if not best_url:
            best_url = video_urls[0]['url']
        
        ctx.info(f"URL sélectionnée pour téléchargement: {best_url[:100]}...")
        
        # Générer nom de fichier intelligent
        metadata = {
            'title': tiktok_data.get('video', {}).get('description', ''),
            'author': tiktok_data.get('user', {}).get('username', ''),
            'duration': tiktok_data.get('video', {}).get('duration')
        }
        
        filename = generate_tiktok_filename(metadata, nav_result['url'])
        file_path = os.path.join(download_dir, filename)
        
        # Téléchargement avec en-têtes appropriés
        headers = {
            'User-Agent': random.choice(USER_AGENTS),
            'Referer': 'https://www.tiktok.com/',
            'Accept': '*/*',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Origin': 'https://www.tiktok.com'
        }
        
        ctx.info("Démarrage du téléchargement...")
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=300) as client:
            response = await client.get(best_url, headers=headers)
            
            if response.status_code in [200, 206]:
                with open(file_path, 'wb') as f:
                    f.write(response.content)
                
                file_size = len(response.content)
                
                return {
                    "success": True,
                    "file_path": file_path,
                    "filename": filename,
                    "metadata": {
                        **metadata,
                        "engagement": tiktok_data.get('engagement', {}),
                        "technical": tiktok_data.get('technical', {})
                    },
                    "file_size": file_size,
                    "file_size_human": format_file_size(file_size),
                    "video_urls_found": len(video_urls),
                    "selected_url_type": next((u['type'] for u in video_urls if u['url'] == best_url), 'unknown'),
                    "navigation_attempts": nav_result.get('attempts', 1)
                }
            else:
                return {"success": False, "error": f"Échec du téléchargement: HTTP {response.status_code}"}
                
    except Exception as e:
        ctx.error(f"Erreur lors du téléchargement TikTok: {str(e)}")
        return {"success": False, "error": str(e)}
    
async def get_tiktok_profile_videos_tool(username: str, ctx: MockContext, limit: int = 10) -> Dict[str, Any]:
    """Récupérer les vidéos d'un profil TikTok"""
    try:
        page = ctx.app_context.page
        
        ctx.info(f"Récupération des vidéos du profil @{username}")
        
        profile_url = f"https://www.tiktok.com/@{username}"
        
        # Navigation
        await simulate_human_behavior(page)
        await page.goto(profile_url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_load_state("networkidle", timeout=30000)
        
        # Vérifier CAPTCHA
        if await detect_tiktok_captcha(page):
            ctx.info("CAPTCHA détecté sur le profil...")
            captcha_solved = await solve_tiktok_puzzle_captcha(page, ctx)
            if not captcha_solved:
                return {"success": False, "error": "CAPTCHA non résolu"}
        
        # Attendre les vidéos
        try:
            await page.wait_for_selector('[data-e2e="user-post-item"]', timeout=30000)
        except:
            return {"success": False, "error": "Aucune vidéo trouvée sur le profil"}
        
        # Extraire les vidéos
        videos_data = await page.evaluate(f"""
        (limit) => {{
            const videos = [];
            const videoElements = document.querySelectorAll('[data-e2e="user-post-item"]');
            
            for (let i = 0; i < Math.min(videoElements.length, limit); i++) {{
                const element = videoElements[i];
                const linkElement = element.querySelector('a');
                
                if (linkElement) {{
                    const href = linkElement.href;
                    const img = element.querySelector('img');
                    const playCount = element.querySelector('[data-e2e="video-views"]');
                    
                    videos.push({{
                        url: href,
                        thumbnail: img ? img.src : null,
                        views: playCount ? playCount.textContent : null,
                        index: i
                    }});
                }}
            }}
            
            return videos;
        }}
        """, limit)
        
        return {
            "success": True,
            "username": username,
            "profile_url": profile_url,
            "videos": videos_data,
            "count": len(videos_data)
        }
        
    except Exception as e:
        ctx.error(f"Erreur lors de la récupération du profil: {str(e)}")
        return {"success": False, "error": str(e)}

# === OUTILS EXISTANTS (inchangés) ===

async def navigate_tool(url: str, ctx: MockContext) -> Dict[str, Any]:
    """Navigate to a specified URL"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Navigating to: {url}")
        
        response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_load_state("networkidle", timeout=30000)
        
        title = await page.title()
        current_url = page.url
        
        return {
            "title": title,
            "url": current_url,
            "status_code": response.status if response else None
        }
    except Exception as e:
        ctx.error(f"Error navigating to {url}: {str(e)}")
        return {"error": f"Failed to navigate to {url}: {str(e)}"}

async def screenshot_tool(ctx: MockContext) -> Dict[str, Any]:
    """Take a screenshot of the current page"""
    try:
        page = ctx.app_context.page
        session_id = ctx.app_context.session_id
        
        os.makedirs(f"screenshot/{session_id}", exist_ok=True)
        
        filename = f"screenshot/{session_id}/screenshot_{uuid.uuid4()}.png"
        await page.screenshot(path=filename, full_page=True)
        
        ctx.info(f"Screenshot saved: {filename}")
        return {"filename": filename, "path": filename}
    except Exception as e:
        ctx.error(f"Error taking screenshot: {str(e)}")
        return {"error": f"Failed to take screenshot: {str(e)}"}

async def click_tool(x: int, y: int, ctx: MockContext) -> Dict[str, Any]:
    """Click at specific coordinates"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Clicking at coordinates: ({x}, {y})")
        
        await page.mouse.click(x, y)
        await asyncio.sleep(1)
        
        return {"clicked_at": {"x": x, "y": y}}
    except Exception as e:
        ctx.error(f"Error clicking at ({x}, {y}): {str(e)}")
        return {"error": f"Failed to click at ({x}, {y}): {str(e)}"}

async def scroll_tool(direction: str, amount: int, ctx: MockContext) -> Dict[str, Any]:
    """Scroll the page"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Scrolling {direction} by {amount} pixels")
        
        if direction.lower() == "down":
            await page.evaluate(f"window.scrollBy(0, {amount})")
        elif direction.lower() == "up":
            await page.evaluate(f"window.scrollBy(0, -{amount})")
        else:
            return {"error": f"Invalid direction: {direction}"}
        
        await asyncio.sleep(1)
        
        return {"scrolled": True, "direction": direction, "amount": amount}
    except Exception as e:
        ctx.error(f"Error scrolling {direction}: {str(e)}")
        return {"error": f"Failed to scroll {direction}: {str(e)}"}

async def type_tool(text: str, ctx: MockContext, submit: bool = False) -> Dict[str, Any]:
    """Type text"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Typing text: '{text}'")
        
        await page.keyboard.type(text)
        
        if submit:
            ctx.info("Pressing Enter to submit")
            await page.keyboard.press('Enter')
            await asyncio.sleep(2)
            
        return {"typed": True, "text": text, "submitted": submit}
    except Exception as e:
        ctx.error(f"Error typing text: {str(e)}")
        return {"error": f"Failed to type text: {str(e)}"}

async def get_page_info_tool(ctx: MockContext) -> str:
    """Get current page information"""
    try:
        page = ctx.app_context.page
        title = await page.title()
        return f"Current page: Title='{title}', URL='{page.url}'"
    except Exception as e:
        ctx.error(f"Error getting page info: {str(e)}")
        return f"Error getting page info: {str(e)}"

def write_file_tool(filename: str, content: str, ctx: MockContext) -> Dict[str, Any]:
    """Write content to a file"""
    try:
        session_id = ctx.app_context.session_id
        os.makedirs(f"artefacts/{session_id}", exist_ok=True)
        
        full_path = f"artefacts/{session_id}/{filename}"
        ctx.info(f"Writing to file: {full_path}")
        
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        return {"filename": filename, "path": full_path, "written": True}
    except Exception as e:
        ctx.error(f"Error writing file: {str(e)}")
        return {"error": f"Failed to write file: {str(e)}"}

# === FASTAPI APP ===

app = FastAPI(
    title="MCP Server HTTP API",
    description="HTTP API for MCP Server with Playwright automation and TikTok downloader",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mcp-server"}

@app.get("/tools", response_model=ListToolsResponse)
async def list_tools():
    """List all available tools"""
    tools = [
        {
            "name": "navigate",
            "description": "Navigate to a specified URL",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The URL to navigate to"}
                },
                "required": ["url"]
            }
        },
                {
            "name": "analyze_tiktok_url",
            "description": "Analyze a TikTok URL and extract comprehensive information",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "TikTok URL to analyze"}
                },
                "required": ["url"]
            }
        },
        {
            "name": "screenshot", 
            "description": "Take a screenshot of the current page",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "click",
            "description": "Click at specific coordinates on the page",
            "input_schema": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"}
                },
                "required": ["x", "y"]
            }
        },
        {
            "name": "scroll",
            "description": "Scroll the page up or down",
            "input_schema": {
                "type": "object", 
                "properties": {
                    "direction": {"type": "string", "enum": ["up", "down"]},
                    "amount": {"type": "integer", "description": "Amount to scroll in pixels"}
                },
                "required": ["direction", "amount"]
            }
        },
        {
            "name": "type",
            "description": "Type text",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to type"},
                    "submit": {"type": "boolean", "description": "Whether to press Enter", "default": False}
                },
                "required": ["text"]
            }
        },
        {
            "name": "get_page_info",
            "description": "Get information about the current page",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "write_file", 
            "description": "Write content to a file",
            "input_schema": {
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "Name of the file"},
                    "content": {"type": "string", "description": "Content to write"}
                },
                "required": ["filename", "content"]
            }
        },
        # === NOUVEAUX OUTILS TIKTOK ===
        {
            "name": "download_tiktok_video",
            "description": "Download TikTok videos with anti-detection",
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "TikTok video URL"},
                    "quality": {"type": "string", "enum": ["best", "medium", "worst"], "default": "best"},
                    "include_audio": {"type": "boolean", "description": "Include audio", "default": True}
                },
                "required": ["url"]
            }
        },
        {
            "name": "get_tiktok_profile_videos",
            "description": "Get videos from a TikTok profile",
            "input_schema": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "TikTok username (without @)"},
                    "limit": {"type": "integer", "description": "Max videos to retrieve", "default": 10, "minimum": 1, "maximum": 50}
                },
                "required": ["username"]
            }
        }
    ]
    
    return ListToolsResponse(tools=tools)

@app.post("/tools/execute", response_model=ToolResponse)
async def execute_tool(request: ToolRequest):
    """Execute a tool"""
    try:
        session_id = request.session_id or str(uuid.uuid4())
        logger.info(f"Executing tool '{request.tool_name}' for session {session_id}")
        
        # Get or create context
        context = await get_or_create_context(session_id)
        ctx = MockContext(context)
        
        # Route to appropriate tool function
        tool_name = request.tool_name
        arguments = request.arguments
        
        if tool_name == "navigate":
            result = await navigate_tool(arguments["url"], ctx)
        elif tool_name == "screenshot":
            result = await screenshot_tool(ctx)
        elif tool_name == "click":
            result = await click_tool(arguments["x"], arguments["y"], ctx)
        elif tool_name == "scroll":
            result = await scroll_tool(arguments["direction"], arguments["amount"], ctx)
        elif tool_name == "type":
            result = await type_tool(arguments["text"], ctx, arguments.get("submit", False))
        elif tool_name == "get_page_info":
            result = await get_page_info_tool(ctx)
        elif tool_name == "write_file":
            result = write_file_tool(arguments["filename"], arguments["content"], ctx)
        # === NOUVEAUX OUTILS TIKTOK ===
        elif tool_name == "download_tiktok_video":
            result = await download_tiktok_video_tool(
                arguments["url"], 
                ctx, 
                arguments.get("quality", "best"),
                arguments.get("include_audio", True)
            )
        elif tool_name == "get_tiktok_profile_videos":
            result = await get_tiktok_profile_videos_tool(
                arguments["username"],
                ctx,
                arguments.get("limit", 10)
            )
        elif tool_name == "analyze_tiktok_url":
            # Correction: ajouter 'result =' pour capturer la valeur de retour
            result = await analyze_tiktok_url_tool(arguments["url"], ctx)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")
            
        logger.info(f"Tool '{tool_name}' executed successfully for session {session_id}")
        return ToolResponse(success=True, result=result)
        
    except Exception as e:
        logger.error(f"Error executing tool {request.tool_name}: {e}")
        traceback.print_exc()
        return ToolResponse(success=False, error=str(e))

@app.get("/resources/{session_id}/{filename}")
async def get_resource(session_id: str, filename: str):
    """Get a resource file"""
    try:
        path = f"artefacts/{session_id}/{filename}"
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Resource not found")
            
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        return {"uri": f"artifact://{session_id}/{filename}", "content": content}
        
    except Exception as e:
        logger.error(f"Error getting resource: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """Cleanup a session"""
    try:
        await cleanup_context(session_id)
        return {"message": f"Session {session_id} cleaned up successfully"}
    except Exception as e:
        logger.error(f"Error cleaning up session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)