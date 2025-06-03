#!/usr/bin/env python
import asyncio
import uuid
import os
import sys
import logging
import json
import time
import random
import re
import httpx
import subprocess
import math
from urllib.parse import urlparse, unquote

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, List, Dict, Any, Optional, Tuple, Union

from dotenv import load_dotenv
load_dotenv()

import subprocess
import requests
from pathlib import Path

import nest_asyncio
nest_asyncio.apply()

# --- Playwright (Puppeteer for Python) ---
from playwright.async_api import async_playwright, Playwright, Browser, BrowserContext, Page

# --- Google GenAI & Traduction ---
from google import genai
from google.api_core import exceptions as google_exceptions
import google.auth
from google.cloud import translate_v3 as translate
from google.genai import types as genai_types

# --- FastMCP ---
from mcp.server.fastmcp import FastMCP, Context
from mcp.server.fastmcp.utilities.types import Image
from mcp.types import ResourceContents, TextResourceContents, EmbeddedResource

# Configure logging - Set default level to INFO
logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s - %(levelname)s [%(name)s] - %(message)s",
)

# --- Suppress Verbose Google API Logs ---
for name in (
    "google.api_core",
    "google.auth",
    "google.generativeai",
    "google.cloud",
    "urllib3",
    "httpcore",
    "httpx",
):
    logging.getLogger(name).setLevel(logging.WARNING)

# --- Configuration (unchanged) ---
GOOGLE_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_LOCATION   = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

if not GOOGLE_PROJECT_ID or not GOOGLE_LOCATION:
    logging.error(
        "Environment variables"
        " `GOOGLE_CLOUD_PROJECT` and "
        "`GOOGLE_CLOUD_LOCATION` must be set."
    )
    sys.exit(1)

# --- Initialize Gemini Client (unchanged) ---
try:
    GENAI_CLIENT = genai.Client(
        vertexai=True, project=GOOGLE_PROJECT_ID, location=GOOGLE_LOCATION
    )
    logging.info(
        "Gemini Client initialized for "
        f"project `{GOOGLE_PROJECT_ID}` in "
        f"location `{GOOGLE_LOCATION}`"
    )
except google.auth.exceptions.DefaultCredentialsError as e:
    logging.error(
        "Failed to initialize Gemini Client " f"due to authentication issues: {e}"
    )
    GENAI_CLIENT = None
except google_exceptions.PermissionDenied as e:
    logging.error(
        "Failed to initialize Gemini Client" f" due to permission issues: {e}"
    )
    GENAI_CLIENT = None
except google_exceptions.GoogleAPIError as e:
    logging.error(
        "Failed to initialize Gemini Client " f"due to a Google API error: {e}"
    )
    GENAI_CLIENT = None
except RuntimeError as e:
    logging.error(f"Failed to initialize Gemini Client " f"due to a runtime error: {e}")
    GENAI_CLIENT = None

if GENAI_CLIENT:
    logging.info("GENAI_CLIENT is ready.")
else:
    logging.warning(
        "GENAI_CLIENT could not be initialized. "
        "Further operations depending on it may fail."
    )

# --- Playwright Lifespan & Context ---
SESSION_ID = str(uuid.uuid4())
os.makedirs(f"screenshot/{SESSION_ID}", exist_ok=True)
os.makedirs(f"artefacts/{SESSION_ID}", exist_ok=True)
os.makedirs(f"videos/{SESSION_ID}", exist_ok=True)

# --- Configuration pour les services de résolution de CAPTCHA ---
# Pour utiliser un service de résolution de CAPTCHA, définissez votre clé API dans .env
CAPTCHA_SERVICE_API_KEY = os.environ.get("CAPTCHA_SERVICE_API_KEY", "")
CAPTCHA_SERVICE_URL = os.environ.get("CAPTCHA_SERVICE_URL", "https://api.capsolver.com/createTask")

# Liste des user agents pour randomisation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
]

@dataclass
class AppContext:
    playwright: Playwright
    browser: Browser
    context: BrowserContext
    page: Page
    captcha_service_available: bool = False

# Fonction pour émuler le comportement humain
async def emulate_human_behavior(page: Page):
    """Émule le comportement humain sur la page pour éviter la détection"""
    # Simuler des mouvements de souris aléatoires avec accélération/décélération naturelle
    width, height = 1920, 1080  # Dimensions par défaut
    
    # Obtenir les dimensions réelles de la page si possible
    dimensions = await page.evaluate("""
        () => {
            return {
                width: window.innerWidth,
                height: window.innerHeight
            }
        }
    """)
    if dimensions:
        width, height = dimensions.get('width', width), dimensions.get('height', height)
    
    # Points de départ et d'arrivée pour la souris
    start_x, start_y = random.randint(0, width), random.randint(0, height)
    await page.mouse.move(start_x, start_y)
    
    # Effectuer plusieurs mouvements de souris aléatoires
    for _ in range(random.randint(3, 7)):
        # Destination aléatoire
        end_x, end_y = random.randint(0, width), random.randint(0, height)
        
        # Calculer la distance
        distance = ((end_x - start_x) ** 2 + (end_y - start_y) ** 2) ** 0.5
        
        # Nombre d'étapes basé sur la distance (plus fluide pour les longues distances)
        steps = max(10, int(distance / 10))
        
        # Créer une courbe de mouvement naturelle avec accélération/décélération
        for step in range(1, steps + 1):
            # Fonction d'accélération/décélération (fonction d'easing)
            progress = step / steps
            ease = 0.5 - 0.5 * math.cos(math.pi * progress)
            
            # Calculer la position actuelle
            current_x = start_x + (end_x - start_x) * ease
            current_y = start_y + (end_y - start_y) * ease
            
            # Ajouter une petite variation aléatoire (tremblement naturel de la main)
            current_x += random.randint(-2, 2)
            current_y += random.randint(-2, 2)
            
            # Déplacer la souris
            await page.mouse.move(current_x, current_y)
            
            # Pause aléatoire pour simuler mouvement naturel
            await asyncio.sleep(random.uniform(0.005, 0.015))
        
        # Pause entre les mouvements
        await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # Mise à jour du point de départ pour le prochain mouvement
        start_x, start_y = end_x, end_y
    
    # Faire défiler la page de manière aléatoire
    scroll_amount = random.randint(100, 300)
    await page.mouse.wheel(0, scroll_amount)
    await asyncio.sleep(random.uniform(0.3, 0.8))
    
    # Parfois, remonter un peu
    if random.random() > 0.7:
        await page.mouse.wheel(0, -random.randint(50, 150))
        await asyncio.sleep(random.uniform(0.3, 0.5))

@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """Initialize and clean up Playwright browser resources with advanced anti-detection"""
    print(f"Initializing browser resources (session {SESSION_ID})")
    pw = await async_playwright().start()
    
    # Configuration avancée spécifique pour TikTok et autres sites avec protection anti-bot
    user_agent = random.choice(USER_AGENTS)
    
    # Démarrer avec un navigateur non-headless pour TikTok
    browser = await pw.chromium.launch(
        headless=False,  # False pour éviter la détection sur les sites comme TikTok
        args=[
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process,SitePerProcess',
            '--flag-switches-begin --disable-site-isolation-trials --flag-switches-end',
            '--disable-extensions',
            '--disable-blink-features',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-size=1920,1080',
            '--start-maximized',
            '--hide-scrollbars',
            '--mute-audio',
            '--disable-gpu'
        ]
    )
    
    # Créer un contexte avec des empreintes numériques aléatoires
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        screen={'width': 1920, 'height': 1080},
        user_agent=user_agent,
        locale='fr-FR',
        timezone_id='Europe/Paris',
        color_scheme='dark',
        device_scale_factor=random.choice([1, 1.25, 1.5, 1.75, 2]),
        is_mobile=False,
        has_touch=random.choice([True, False]),
        java_script_enabled=True,
        bypass_csp=True,
    )
    
    # Script avancé pour camoufler Playwright/Puppeteer
    await context.add_init_script("""
    // Masquer les signes de WebDriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Maquillage supplémentaire pour WebDriver
    if (navigator.webdriver === true) {
        navigator.__defineGetter__('webdriver', function() { return false; });
    }
    
    // Créer des empreintes de navigateur humain
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => {
        if (parameters.name === 'notifications' || parameters.name === 'clipboard-read' || parameters.name === 'clipboard-write') {
            return Promise.resolve({state: Notification.permission});
        }
        return originalQuery(parameters);
    };
    
    // Masquer les signes de l'automatisation
    if (window.navigator.plugins) {
        // Ajouter des plugins aléatoires pour paraître plus humain
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = [];
                for (let i = 0; i < 3; i++) {
                    plugins.push({
                        name: `plugin ${i}`,
                        description: `Plugin aléatoire ${i}`,
                        filename: `plugin${i}.dll`
                    });
                }
                return plugins;
            }
        });
    }
    
    // Cacher les attributs d'automatisation de Chrome
    if (window.chrome) {
        window.chrome.runtime = window.chrome.runtime || {};
        window.chrome.runtime.sendMessage = function() { 
            return Promise.resolve({ success: true }); 
        };
    }
    
    // Ajouter un "undetectable mode" pour Puppeteer/Playwright
    const newProto = navigator.__proto__;
    delete newProto.webdriver;
    navigator.__proto__ = newProto;
    
    // Bloquer les moyens de détection basés sur le canvas fingerprinting
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
        if (type === 'image/png' && this.width === 220 && this.height === 30) {
            // Cette taille de canvas est souvent utilisée pour le fingerprinting
            return originalToDataURL.apply(this, [type]);
        }
        // Légères perturbations aléatoires pour l'empreinte de canvas
        const context = this.getContext('2d');
        const imageData = context.getImageData(0, 0, this.width, this.height);
        for(let i = 0; i < imageData.data.length; i += 4) {
            // Ajouter une légère variation aux couleurs
            imageData.data[i] = imageData.data[i] + Math.floor(Math.random() * 10 - 5);
            imageData.data[i+1] = imageData.data[i+1] + Math.floor(Math.random() * 10 - 5);
            imageData.data[i+2] = imageData.data[i+2] + Math.floor(Math.random() * 10 - 5);
        }
        context.putImageData(imageData, 0, 0);
        return originalToDataURL.apply(this, arguments);
    };
    
    // Simuler le comportement humain avec des mouvements de souris aléatoires
    function simulateHumanBehavior() {
        // Créer des mouvements de souris qui semblent humains
        function randomMouseMove() {
            const event = new MouseEvent('mousemove', {
                'view': window,
                'bubbles': true,
                'cancelable': true,
                'clientX': Math.floor(Math.random() * window.innerWidth),
                'clientY': Math.floor(Math.random() * window.innerHeight),
                'movementX': Math.floor(Math.random() * 20 - 10),
                'movementY': Math.floor(Math.random() * 20 - 10)
            });
            document.dispatchEvent(event);
        }
        
        // Simuler des micro-mouvements de souris aléatoires
        setInterval(randomMouseMove, 1000 + Math.floor(Math.random() * 2000));
        
        // Simuler des micro-scroll occasionnels
        function randomScroll() {
            window.scrollBy({
                top: Math.floor(Math.random() * 100 - 50),
                behavior: 'smooth'
            });
        }
        setInterval(randomScroll, 5000 + Math.floor(Math.random() * 5000));
    }
    simulateHumanBehavior();
    
    // Patch pour TikTok spécifiquement
    if (window.location.href.includes('tiktok.com')) {
        // TikTok utilise ces propriétés pour la détection des bots
        Object.defineProperty(window, 'byted_acrawler', {
            get: function() { return { init: function() { return true; } } }
        });
        
        // Intercepter les détecteurs de fingerprinting connus
        const tiktokDetectionFns = ['TTFingerprint', '_signature', 'RENDER_DATA', 'msToken', 'xttparams'];
        tiktokDetectionFns.forEach(fn => {
            if (window[fn]) {
                console.log(`Intercepting TikTok detection: ${fn}`);
                // Sauvegarder la fonction originale mais modifier légèrement son comportement
                const original = window[fn];
                window[fn] = function() {
                    // Ajouter un délai aléatoire pour simuler un comportement humain
                    return new Promise(resolve => {
                        setTimeout(() => {
                            resolve(original.apply(this, arguments));
                        }, Math.random() * 200);
                    });
                };
            }
        });
    }
    """)
    
    # Ajouter des cookies courants pour les sites populaires
    await context.add_cookies([
        {
            'name': 'cookie_consent',
            'value': 'accepted',
            'domain': '.tiktok.com',
            'path': '/'
        },
        {
            'name': 'msToken',
            'value': 'ms_' + str(uuid.uuid4()),
            'domain': '.tiktok.com',
            'path': '/'
        }
    ])
    
    # Créer une page dans ce contexte
    page = await context.new_page()
    
    # Vérifier si le service de CAPTCHA est disponible
    captcha_service_available = bool(CAPTCHA_SERVICE_API_KEY and CAPTCHA_SERVICE_URL)
    
    # Emulation avancée du comportement humain avant de commencer
    await emulate_human_behavior(page)
    
    # Naviguer vers une page de base (non TikTok) pour initialiser
    await page.goto("https://example.com", wait_until="networkidle")
    
    print(f"*** Playwright ready (session {SESSION_ID}) ***")
    print(f"*** CAPTCHA service {'available' if captcha_service_available else 'not available'} ***")
    
    try:
        yield AppContext(
            playwright=pw, 
            browser=browser, 
            context=context,
            page=page, 
            captcha_service_available=captcha_service_available
        )
    finally:
        await context.close()
        await browser.close()
        await pw.stop()
        print("*** Playwright stopped ***")

# --- Instantiate High-Level MCP Server (with lifespan) ---
try:
    mcp_host = FastMCP(
        "gemini-complexity-server",
        lifespan=app_lifespan,
        description="GenAI + Traduction + Playwright Automation"
    )
except NameError:
    logging.error("MCPHost class not available. Cannot create MCP server.")
    sys.exit(1)

# --- Resource endpoints for artifacts ---
@mcp_host.resource("artifact://{session_id}/{filename}")
async def get_artifact(session_id: str, filename: str) -> List[ResourceContents]:
    """Retrieve an artifact file by session ID and filename
    
    Args:
        session_id: The session ID
        filename: The filename of the artifact
        
    Returns:
        The content of the artifact as ResourceContents
    """
    try:
        path = f"artefacts/{session_id}/{filename}"
        if not os.path.exists(path):
            return [TextResourceContents(
                uri=f"artifact://{session_id}/{filename}",
                text=f"Error: Artifact not found: {filename}",
                mimeType="text/plain"
            )]
        
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        mime = "text/plain"
        if filename.endswith(".md"):   mime = "text/markdown"
        if filename.endswith(".html"): mime = "text/html"
        if filename.endswith(".json"): mime = "application/json"
        
        return [TextResourceContents(
            uri=f"artifact://{session_id}/{filename}",
            text=content,
            mimeType=mime
        )]
    except Exception as e:
        logging.error(f"Error retrieving artifact {filename}: {e}")
        return [TextResourceContents(
            uri=f"artifact://{session_id}/{filename}",
            text=f"Error retrieving artifact: {str(e)}",
            mimeType="text/plain"
        )]

@mcp_host.resource("artifact://list")
async def list_artifacts() -> List[ResourceContents]:
    """List all artifacts for the current session
    
    Returns:
        A list of available artifacts as ResourceContents
    """
    try:
        dirpath = f"artefacts/{SESSION_ID}"
        if not os.path.isdir(dirpath):
            return [TextResourceContents(
                uri="artifact://list",
                text="No artifacts found for this session",
                mimeType="text/plain"
            )]
            
        files = os.listdir(dirpath)
        lines = ["Available artifacts:"]
        for fn in files:
            lines.append(f"- {fn}: artifact://{SESSION_ID}/{fn}")
            
        return [TextResourceContents(
            uri="artifact://list",
            text="\n".join(lines),
            mimeType="text/plain"
        )]
    except Exception as e:
        logging.error(f"Error listing artifacts: {e}")
        return [TextResourceContents(
            uri="artifact://list",
            text=f"Error listing artifacts: {str(e)}",
            mimeType="text/plain"
        )]

# --- Common Gemini API Call Function (unchanged) ---
async def call_gemini_model(model_name: str, prompt: str) -> str:
    if not GENAI_CLIENT:
        raise RuntimeError("Gemini client not initialized.")
    logging.debug(f"Calling model '{model_name}' for prompt: {prompt[:70]}...")
    contents = [genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)])]
    generate_content_config = genai_types.GenerateContentConfig(
        temperature=0.2,
        top_p=0.8,
        max_output_tokens=1024,
        response_modalities=["TEXT"],
        safety_settings=[
            genai_types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            genai_types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            genai_types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            genai_types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
        ],
    )
    try:
        response = GENAI_CLIENT.models.generate_content(
            model=model_name, contents=contents, config=generate_content_config
        )
        if response:
            return response.text
        logging.warning(f"Model '{model_name}' response candidate has no text parts.")
        return "Error: Model returned a response structure without text content."
    except google_exceptions.GoogleAPIError as e:
        logging.error(f"Google API error calling model {model_name}: {e}")
        raise RuntimeError(f"Gemini API Error ({e.message or type(e).__name__})") from e

# --- Translation function (unchanged) ---
def translate_text(
    project_id: str,
    location: str,
    source_language_code: str,
    target_language_code: str,
    source_text: str,
) -> str | None:
    try:
        client = translate.TranslationServiceClient()
        parent = f"projects/{project_id}/locations/{location}"
        response = client.translate_text(
            request={
                "parent": parent,
                "contents": [source_text],
                "mime_type": "text/plain",
                "source_language_code": source_language_code,
                "target_language_code": target_language_code,
            }
        )
        if response.translations:
            return response.translations[0].translated_text
        logging.warning("Warning: No translations found in the response.")
        return None
    except google.auth.exceptions.DefaultCredentialsError as e:
        logging.error(f"Authentication failed: {e}")
        return None
    except google_exceptions.GoogleAPIError as e:
        logging.error(f"Translation API error: {e}")
        return None

# --- Fonction de détection et résolution de CAPTCHA ---
async def detect_and_solve_captcha(page: Page, ctx: Context) -> Dict[str, Any]:
    """Détecte et tente de résoudre automatiquement les CAPTCHA rencontrés
    
    Args:
        page: La page Playwright 
        ctx: Le contexte MCP
    
    Returns:
        Informations sur la tentative de résolution du CAPTCHA
    """
    try:
        # Vérifier plusieurs types de CAPTCHA
        ctx.info("Recherche de CAPTCHA sur la page...")
        
        # Détection de Google reCAPTCHA v2
        recaptcha_found = await page.query_selector('iframe[src*="recaptcha/api2/anchor"]')
        if recaptcha_found:
            ctx.info("Google reCAPTCHA v2 détecté")
            return await solve_recaptcha_v2(page, ctx)
        
        # Détection de hCaptcha
        hcaptcha_found = await page.query_selector('iframe[src*="hcaptcha.com"]')
        if hcaptcha_found:
            ctx.info("hCaptcha détecté")
            return await solve_hcaptcha(page, ctx)
        
        # Détection de puzzle CAPTCHA type TikTok
        tiktok_puzzle = await page.query_selector('.captcha-verify-slide-bar, div[class*="captcha"], iframe[title*="captcha"]')
        if tiktok_puzzle:
            ctx.info("CAPTCHA puzzle type TikTok détecté")
            return await solve_tiktok_puzzle_captcha(page, ctx)
        
        # Détection de CAPTCHA texte simple
        text_captcha = await page.query_selector('input[name*="captcha"], input[id*="captcha"]')
        if text_captcha:
            ctx.info("CAPTCHA textuel détecté")
            return await solve_text_captcha(page, ctx)
        
        # Détection de CAPTCHA image simple
        image_captcha = await page.query_selector('img[src*="captcha"], img[alt*="captcha"]')
        if image_captcha:
            ctx.info("CAPTCHA image détecté")
            return await solve_image_captcha(page, ctx)
        
        ctx.info("Aucun CAPTCHA détecté sur la page")
        return {"detected": False, "message": "Aucun CAPTCHA détecté"}
    except Exception as e:
        ctx.error(f"Erreur lors de la détection du CAPTCHA: {str(e)}")
        return {"detected": False, "error": str(e)}

async def solve_recaptcha_v2(page: Page, ctx: Context) -> Dict[str, Any]:
    """Tente de résoudre un reCAPTCHA v2 de Google
    
    Args:
        page: La page Playwright
        ctx: Le contexte MCP
    
    Returns:
        Résultat de la tentative de résolution
    """
    captcha_service_available = ctx.request_context.lifespan_context.captcha_service_available
    
    if not captcha_service_available:
        ctx.warning("Résolution automatique de reCAPTCHA non disponible sans clé API de service")
        
        # Tentative manuelle : cliquer sur la case à cocher
        try:
            # Trouver l'iframe du reCAPTCHA et y accéder
            recaptcha_frame = await page.query_selector('iframe[src*="recaptcha/api2/anchor"]')
            if recaptcha_frame:
                frame = await recaptcha_frame.content_frame()
                if frame:
                    # Cliquer sur la case à cocher dans l'iframe
                    checkbox = await frame.query_selector('.recaptcha-checkbox-border')
                    if checkbox:
                        await checkbox.click()
                        await asyncio.sleep(2)
                        
                        # Vérifier si résolu (pas très fiable)
                        is_checked = await frame.query_selector('.recaptcha-checkbox-checked')
                        if is_checked:
                            return {"solved": True, "method": "checkbox_click"}
        except Exception as e:
            ctx.error(f"Erreur lors de la tentative de résolution manuelle: {str(e)}")
        
        return {
            "detected": True, 
            "solved": False,
            "message": "La résolution de reCAPTCHA nécessite un service externe"
        }
    
    # Utiliser le service externe
    try:
        # Extraire le sitekey
        site_key = await page.evaluate("""() => {
            const element = document.querySelector('.g-recaptcha');
            return element ? element.getAttribute('data-sitekey') : null;
        }""")
        
        if not site_key:
            ctx.error("Impossible de trouver la clé du site reCAPTCHA")
            return {"detected": True, "solved": False, "error": "Sitekey introuvable"}
        
        # Appeler le service de résolution de CAPTCHA
        async with httpx.AsyncClient() as client:
            response = await client.post(
                CAPTCHA_SERVICE_URL,
                json={
                    "clientKey": CAPTCHA_SERVICE_API_KEY,
                    "task": {
                        "type": "ReCaptchaV2TaskProxyless",
                        "websiteURL": page.url,
                        "websiteKey": site_key
                    }
                },
                timeout=300  # 5 minutes
            )
            
            if response.status_code != 200:
                ctx.error(f"Erreur de service CAPTCHA: {response.text}")
                return {"detected": True, "solved": False, "error": response.text}
                
            result = response.json()
            if "errorId" in result and result["errorId"] > 0:
                ctx.error(f"Erreur de service CAPTCHA: {result.get('errorDescription')}")
                return {"detected": True, "solved": False, "error": result.get("errorDescription")}
            
            # Vérifier le statut de la tâche périodiquement
            task_id = result.get("taskId")
            if not task_id:
                return {"detected": True, "solved": False, "error": "Pas d'ID de tâche retourné"}
            
            # Attendre la résolution
            for _ in range(30):  # Attendre max 5 minutes
                await asyncio.sleep(10)  # Vérifier toutes les 10 secondes
                
                status_response = await client.post(
                    CAPTCHA_SERVICE_URL.replace("createTask", "getTaskResult"),
                    json={
                        "clientKey": CAPTCHA_SERVICE_API_KEY,
                        "taskId": task_id
                    }
                )
                
                status = status_response.json()
                if status.get("status") == "ready":
                    g_recaptcha_response = status.get("solution", {}).get("gRecaptchaResponse")
                    if g_recaptcha_response:
                        # Injecter la réponse dans la page
                        await page.evaluate(f"""(response) => {{
                            document.querySelector('[name="g-recaptcha-response"]').innerHTML = response;
                            document.querySelector('[name="g-recaptcha-response"]').value = response;
                            // Déclencher des événements pour informer le site web
                            const event = new Event('captchaCallback');
                            document.dispatchEvent(event);
                        }}""", g_recaptcha_response)
                        
                        return {"detected": True, "solved": True, "method": "external_service"}
                    
                    return {"detected": True, "solved": False, "error": "Réponse non valide reçue"}
            
            return {"detected": True, "solved": False, "error": "Délai d'attente expiré"}
    except Exception as e:
        ctx.error(f"Erreur lors de la résolution du reCAPTCHA: {str(e)}")
        return {"detected": True, "solved": False, "error": str(e)}

async def solve_hcaptcha(page: Page, ctx: Context) -> Dict[str, Any]:
    """Tente de résoudre un hCaptcha
    
    Args:
        page: La page Playwright
        ctx: Le contexte MCP
    
    Returns:
        Résultat de la tentative de résolution
    """
    # Implémentation similaire à reCAPTCHA, adaptée pour hCaptcha
    ctx.warning("La résolution automatique de hCaptcha n'est pas encore complètement implémentée")
    return {"detected": True, "solved": False, "message": "hCaptcha non supporté automatiquement"}

async def solve_text_captcha(page: Page, ctx: Context) -> Dict[str, Any]:
    """Tente de résoudre un CAPTCHA textuel simple
    
    Args:
        page: La page Playwright
        ctx: Le contexte MCP
    
    Returns:
        Résultat de la tentative de résolution
    """
    try:
        # Trouver l'image du CAPTCHA
        captcha_img = await page.query_selector('img[src*="captcha"], img[alt*="captcha"]')
        if not captcha_img:
            return {"detected": True, "solved": False, "error": "Image CAPTCHA introuvable"}
        
        # Capturer l'image
        img_src = await captcha_img.get_attribute('src')
        if not img_src:
            return {"detected": True, "solved": False, "error": "Source d'image introuvable"}
        
        # Télécharger l'image du CAPTCHA
        img_content = None
        if img_src.startswith('data:'):
            # Image en base64
            try:
                import base64
                img_data = img_src.split(',')[1]
                img_content = base64.b64decode(img_data)
            except Exception as e:
                ctx.error(f"Erreur lors du décodage de l'image: {str(e)}")
        else:
            # Image par URL
            async with httpx.AsyncClient() as client:
                response = await client.get(img_src)
                if response.status_code == 200:
                    img_content = response.content
        
        if not img_content:
            return {"detected": True, "solved": False, "error": "Impossible de télécharger l'image"}
        
        # Enregistrer l'image temporairement
        captcha_file = f"screenshot/{SESSION_ID}/captcha_{uuid.uuid4()}.png"
        with open(captcha_file, "wb") as f:
            f.write(img_content)
        
        # Tentative OCR simple pour CAPTCHA textuels basiques
        # Cette partie peut être remplacée par un appel API à un service OCR plus puissant
        try:
            # Utiliser Tesseract si disponible (à installer séparément)
            import pytesseract
            from PIL import Image
            
            # Prétraitement de l'image pour améliorer l'OCR
            img = Image.open(captcha_file)
            captcha_text = pytesseract.image_to_string(img, config='--psm 7 -c tessedit_char_whitelist=0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
            captcha_text = captcha_text.strip()
            
            if not captcha_text:
                return {"detected": True, "solved": False, "error": "OCR échoué"}
            
            # Entrer le texte dans le champ
            input_field = await page.query_selector('input[name*="captcha"], input[id*="captcha"]')
            if input_field:
                await input_field.fill(captcha_text)
                return {"detected": True, "solved": True, "method": "ocr", "text": captcha_text}
            else:
                return {"detected": True, "solved": False, "error": "Champ de saisie introuvable"}
        except ImportError:
            ctx.warning("Tesseract OCR non disponible")
            return {"detected": True, "solved": False, "error": "OCR non disponible"}
        except Exception as e:
            ctx.error(f"Erreur OCR: {str(e)}")
            return {"detected": True, "solved": False, "error": f"Erreur OCR: {str(e)}"}
    except Exception as e:
        ctx.error(f"Erreur générale lors de la résolution du CAPTCHA: {str(e)}")
        return {"detected": True, "solved": False, "error": str(e)}

async def solve_image_captcha(page: Page, ctx: Context) -> Dict[str, Any]:
    """Tente de résoudre un CAPTCHA image simple
    
    Args:
        page: La page Playwright
        ctx: Le contexte MCP
    
    Returns:
        Résultat de la tentative de résolution
    """
    # Pour les CAPTCHA par images, il faut généralement un service externe
    return {"detected": True, "solved": False, "message": "CAPTCHA image nécessite service externe"}

async def solve_tiktok_puzzle_captcha(page: Page, ctx: Context) -> Dict[str, Any]:
    """Tente de résoudre le CAPTCHA de puzzle coulissant de TikTok
    
    Args:
        page: La page Playwright
        ctx: Le contexte MCP
    
    Returns:
        Résultat de la tentative de résolution
    """
    try:
        ctx.info("Tentative de résolution du CAPTCHA puzzle TikTok")
        
        # Vérifier si le CAPTCHA est présent
        captcha_frame = await page.query_selector('iframe[src*="captcha"], iframe[title*="captcha"]')
        if not captcha_frame:
            # Recherche directe du puzzle sur la page
            puzzle_container = await page.query_selector('div[class*="captcha-verify"], .captcha_verify_container')
            if not puzzle_container:
                return {"detected": False, "message": "Aucun CAPTCHA de type puzzle détecté"}
        
        # Prendre une capture d'écran du CAPTCHA pour analyse
        captcha_screenshot = f"screenshot/{SESSION_ID}/captcha_puzzle_{uuid.uuid4()}.png"
        
        # Si nous avons trouvé un iframe, travailler dedans
        frame = None
        if captcha_frame:
            frame = await captcha_frame.content_frame()
            if not frame:
                return {"detected": True, "solved": False, "error": "Impossible d'accéder au cadre du CAPTCHA"}
            await captcha_frame.screenshot(path=captcha_screenshot)
        else:
            # Sinon, travailler directement sur la page
            frame = page
            if puzzle_container:
                await puzzle_container.screenshot(path=captcha_screenshot)
            else:
                await page.screenshot(path=captcha_screenshot)
        
        # Trouver le curseur à faire glisser
        selectors = [
            '.captcha_verify_slide_bar', 
            '.slider', 
            '[role="slider"]',
            'div[class*="slider"]', 
            'div[class*="drag"]', 
            'div[role="button"]',
            '.secsdk-captcha-drag-icon',
            '.captcha_verify_img_slide'
        ]
        
        slider = None
        for selector in selectors:
            slider = await frame.query_selector(selector)
            if slider:
                ctx.info(f"Curseur trouvé avec le sélecteur: {selector}")
                break
        
        if not slider:
            return {"detected": True, "solved": False, "error": "Curseur de puzzle non trouvé"}
        
        # Obtenir la position du curseur
        slider_box = await slider.bounding_box()
        if not slider_box:
            return {"detected": True, "solved": False, "error": "Impossible d'obtenir les coordonnées du curseur"}
        
        # Coordonnées du curseur
        slider_x = slider_box['x'] + slider_box['width'] / 2
        slider_y = slider_box['y'] + slider_box['height'] / 2
        
        # Pour le puzzle TikTok, il faut généralement glisser vers la droite
        # Estimer la largeur totale disponible
        total_width = await frame.evaluate('() => document.documentElement.clientWidth')
        max_drag_distance = min(total_width * 0.8, 300)  # Limiter à une distance raisonnable
        
        # Simule plusieurs tentatives avec différentes distances
        for attempt in range(3):
            # Varier la distance de glissement à chaque tentative
            slide_distance = int(max_drag_distance * random.uniform(0.4, 0.7))
            
            ctx.info(f"Tentative {attempt+1}: glissement sur {slide_distance}px")
            
            # Résolution du puzzle avec simulation de mouvement humain
            await page.mouse.move(slider_x, slider_y)
            await asyncio.sleep(random.uniform(0.2, 0.5))
            
            # Cliquer et maintenir
            await page.mouse.down()
            await asyncio.sleep(random.uniform(0.2, 0.5))
            
            # Mouvement non linéaire pour imiter un glissement humain
            steps = random.randint(20, 30)
            for i in range(1, steps + 1):
                # Fonction d'easing pour simuler l'accélération/décélération humaine
                progress = i / steps
                
                # Courbe d'accélération/décélération (fonction cubique d'easing)
                if progress < 0.5:
                    ease = 4 * progress * progress * progress
                else:
                    p = progress - 1
                    ease = 1 + 4 * p * p * p
                
                # Calculer la position actuelle
                current_distance = slide_distance * ease
                
                # Ajouter une petite variation verticale pour simuler la main humaine
                y_offset = random.randint(-3, 3)
                
                # Déplacer la souris avec un délai variable pour simuler le mouvement humain
                await page.mouse.move(
                    slider_x + current_distance,
                    slider_y + y_offset,
                    steps={'steps': 1}
                )
                
                # Pause variable pour simuler la vitesse variable de la main humaine
                await asyncio.sleep(random.uniform(0.01, 0.03))
            
            # Relâcher le bouton de la souris
            await page.mouse.up()
            
            # Attendre pour voir si le CAPTCHA est validé
            await asyncio.sleep(2)
            
            # Vérifier si le CAPTCHA a été résolu
            # Plusieurs façons de vérifier le succès sur TikTok
            success_selectors = [
                '.captcha_verify_success', 
                '.success-icon', 
                '[class*="success"]',
                '.secsdk-captcha-success-icon'
            ]
            
            success = False
            for selector in success_selectors:
                success_element = await frame.query_selector(selector)
                if success_element:
                    success = True
                    break
            
            # Vérifier aussi si la page a changé ou si le CAPTCHA a disparu
            captcha_still_present = await page.query_selector('iframe[src*="captcha"], div[class*="captcha"]')
            if not captcha_still_present:
                success = True
            
            if success:
                return {"detected": True, "solved": True, "method": "puzzle_sliding", "attempt": attempt + 1}
            
            # Si pas résolu, attendre un peu avant la prochaine tentative
            await asyncio.sleep(1)
        
        # Si toutes les tentatives échouent
        return {"detected": True, "solved": False, "message": "Échec de la résolution du puzzle après plusieurs tentatives"}
        
    except Exception as e:
        ctx.error(f"Erreur lors de la résolution du CAPTCHA puzzle: {str(e)}")
        return {"detected": True, "solved": False, "error": str(e)}

# --- Fonctions pour télécharger des vidéos ---
@mcp_host.tool()
async def download_video(url: str, ctx: Context, filename: Optional[str] = None) -> Dict[str, Any]:
    """Télécharge une vidéo depuis une URL
    
    Args:
        url: URL de la vidéo à télécharger
        ctx: Contexte MCP
        filename: Nom de fichier optionnel (si non fourni, il sera généré)
    
    Returns:
        Informations sur le téléchargement de la vidéo
    """
    try:
        # Valider l'URL
        ctx.info(f"Tentative de téléchargement vidéo depuis: {url}")
        parsed_url = urlparse(url)
        if not parsed_url.scheme or not parsed_url.netloc:
            return {"success": False, "error": "URL invalide"}
        
        # Vérifier si c'est une URL TikTok
        if 'tiktok.com' in parsed_url.netloc:
            return await download_tiktok_video(url, ctx, filename)
        
        # Générer un nom de fichier s'il n'est pas fourni
        if not filename:
            filename = f"video_{int(time.time())}_{uuid.uuid4().hex[:8]}.mp4"
        
        # Chemin de sortie
        output_path = os.path.join(f"videos/{SESSION_ID}", filename)
        
        # Vérifier si yt-dlp est installé
        try:
            # Utiliser yt-dlp pour le téléchargement (meilleure solution pour la plupart des sites)
            command = [
                "yt-dlp", 
                url,
                "-o", output_path,
                "--no-playlist",
                "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4"
            ]
            
            # Exécuter la commande
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Erreur inconnue"
                ctx.error(f"Erreur yt-dlp: {error_msg}")
                return {"success": False, "error": error_msg}
            
            # Vérifier si le fichier a été créé
            if not os.path.exists(output_path):
                alternative_path = output_path.replace(".mp4", "")
                if os.path.exists(f"{alternative_path}.mp4"):
                    output_path = f"{alternative_path}.mp4"
                elif os.path.exists(f"{alternative_path}.mkv"):
                    output_path = f"{alternative_path}.mkv"
                elif os.path.exists(f"{alternative_path}.webm"):
                    output_path = f"{alternative_path}.webm"
                else:
                    # Chercher tous les fichiers créés récemment
                    all_files = os.listdir(f"videos/{SESSION_ID}")
                    recent_files = sorted(
                        [f for f in all_files if os.path.getctime(f"videos/{SESSION_ID}/{f}") > time.time() - 60],
                        key=lambda x: os.path.getctime(f"videos/{SESSION_ID}/{x}"),
                        reverse=True
                    )
                    
                    if recent_files:
                        output_path = f"videos/{SESSION_ID}/{recent_files[0]}"
                    else:
                        return {"success": False, "error": "Fichier vidéo non trouvé après téléchargement"}
            
            file_size = os.path.getsize(output_path)
            return {
                "success": True, 
                "file_path": output_path,
                "file_size": file_size,
                "file_size_human": f"{file_size / (1024*1024):.2f} MB"
            }
            
        except FileNotFoundError:
            ctx.warning("yt-dlp non trouvé, utilisation de la méthode HTTP directe")
            
            # Méthode alternative par téléchargement direct HTTP
            async with httpx.AsyncClient() as client:
                response = await client.get(url, follow_redirects=True)
                
                if response.status_code != 200:
                    return {"success": False, "error": f"HTTP error: {response.status_code}"}
                
                # Vérifier le type de contenu
                content_type = response.headers.get("content-type", "")
                if not content_type.startswith(("video/", "application/octet-stream")):
                    return {"success": False, "error": f"Not a video content: {content_type}"}
                
                # Écrire le fichier
                with open(output_path, "wb") as f:
                    f.write(response.content)
                
                file_size = os.path.getsize(output_path)
                return {
                    "success": True, 
                    "file_path": output_path,
                    "file_size": file_size,
                    "file_size_human": f"{file_size / (1024*1024):.2f} MB",
                    "method": "direct_http"
                }
    
    except Exception as e:
        ctx.error(f"Erreur lors du téléchargement de la vidéo: {str(e)}")
        return {"success": False, "error": str(e)}

@mcp_host.tool()
async def find_videos_on_page(ctx: Context) -> Dict[str, Any]:
    """Trouve toutes les vidéos présentes sur la page courante
    
    Args:
        ctx: Contexte MCP
    
    Returns:
        Liste des vidéos trouvées sur la page
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info("Recherche de vidéos sur la page...")
        
        # 1. Trouver les éléments vidéo HTML5
        video_elements = await page.query_selector_all('video')
        video_srcs = []
        
        for idx, video in enumerate(video_elements):
            # Récupérer l'URL de la source
            src = await video.get_attribute('src')
            
            # Si la vidéo n'a pas de src direct, chercher dans les éléments source enfants
            if not src:
                source_element = await video.query_selector('source')
                if source_element:
                    src = await source_element.get_attribute('src')
            
            # Obtenir les dimensions
            width = await video.get_attribute('width')
            height = await video.get_attribute('height')
            
            if src:
                # Convertir les URL relatives en absolues
                if not src.startswith(('http://', 'https://', 'data:')):
                    base_url = page.url
                    src = base_url + ('' if base_url.endswith('/') else '/') + src.lstrip('/')
                
                video_srcs.append({
                    'index': idx,
                    'type': 'video_element',
                    'src': src,
                    'width': width,
                    'height': height
                })
        
        # 2. Trouver les iframes qui pourraient contenir des vidéos (YouTube, Vimeo, etc.)
        iframe_elements = await page.query_selector_all('iframe')
        for idx, iframe in enumerate(iframe_elements):
            src = await iframe.get_attribute('src')
            if src and ('youtube.com' in src or 'vimeo.com' in src or 'dailymotion.com' in src):
                width = await iframe.get_attribute('width')
                height = await iframe.get_attribute('height')
                
                video_srcs.append({
                    'index': len(video_srcs) + idx,
                    'type': 'iframe_embed',
                    'platform': 'youtube' if 'youtube.com' in src else ('vimeo' if 'vimeo.com' in src else 'dailymotion'),
                    'src': src,
                    'width': width,
                    'height': height
                })
        
        # 3. Chercher des vidéos avec JavaScript en examinant la page
        js_videos = await page.evaluate(r"""() => {
            const results = [];
            
            // Chercher les objets player courants
            const playerObjects = [
                'YT', 'YTPlayer', 'player', 'videojs', 'jwplayer',
                'brightcovePlayer', 'vimeo', 'wistiaPlayer'
            ];
            
            // Vérifier si ces objets sont définis dans window
            playerObjects.forEach(obj => {
                if (window[obj]) results.push({
                    type: 'js_player',
                    player_type: obj,
                    available: true
                });
            });
            
            // Chercher les URLs potentielles de vidéos dans les scripts et les données de page
            const pageContent = document.documentElement.innerHTML;
            const videoPatterns = [
                { regex: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/g, platform: 'youtube' },
                { regex: /(?:https?:)?\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/g, platform: 'youtube' },
                { regex: /(?:https?:)?\/\/(?:www\.)?vimeo\.com\/([0-9]+)/g, platform: 'vimeo' },
                { regex: /(?:https?:)?\/\/(?:www\.)?dailymotion\.com\/video\/([a-zA-Z0-9]+)/g, platform: 'dailymotion' },
                { regex: /(?:https?:)?\/\/(?:www\.)?facebook\.com\/[^\/]+\/videos\/([0-9]+)/g, platform: 'facebook' },
                { regex: /videoUrl["']?\s*:\s*["']([^"']+)["']/g, platform: 'generic' },
                { regex: /mp4["']?\s*:\s*["']([^"']+\.mp4)["']/g, platform: 'mp4' },
                { regex: /src["']?\s*:\s*["']([^"']+\.mp4)["']/g, platform: 'mp4' }
            ];
            
            videoPatterns.forEach(pattern => {
                const matches = pageContent.matchAll(pattern.regex);
                for (const match of matches) {
                    if (match[1]) {
                        results.push({
                            type: 'embedded_url',
                            platform: pattern.platform,
                            src: match[1]
                        });
                    }
                }
            });
            
            return results;
        }""")
        
        # Combiner les résultats
        all_videos = video_srcs + js_videos
        
        # Filtrer les doublons potentiels
        unique_videos = []
        seen_urls = set()
        
        for video in all_videos:
            url = video.get('src', '')
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_videos.append(video)
        
        return {
            "found": len(unique_videos) > 0,
            "count": len(unique_videos),
            "videos": unique_videos
        }
    except Exception as e:
        ctx.error(f"Erreur lors de la recherche de vidéos: {str(e)}")
        return {"found": False, "error": str(e)}

@mcp_host.tool()
async def download_page_video(index: int, ctx: Context, filename: Optional[str] = None) -> Dict[str, Any]:
    """Télécharge une vidéo spécifique trouvée sur la page
    
    Args:
        index: Indice de la vidéo à télécharger
        ctx: Contexte MCP
        filename: Nom de fichier optionnel
    
    Returns:
        Informations sur le téléchargement
    """
    try:
        # D'abord trouver toutes les vidéos sur la page
        videos_result = await find_videos_on_page(ctx)
        
        if not videos_result.get("found", False):
            return {"success": False, "error": "Aucune vidéo trouvée sur la page"}
        
        videos = videos_result.get("videos", [])
        if index < 0 or index >= len(videos):
            return {"success": False, "error": f"Index de vidéo invalide: {index}. Plage valide: 0-{len(videos)-1}"}
        
        # Obtenir les informations de la vidéo sélectionnée
        video = videos[index]
        video_type = video.get("type")
        video_src = video.get("src")
        
        if not video_src:
            return {"success": False, "error": "Source de vidéo non trouvée"}
        
        # Générer un nom de fichier si non fourni
        if not filename:
            # Extraire le nom du fichier de l'URL si possible
            parsed_url = urlparse(video_src)
            path = unquote(parsed_url.path)
            base_filename = os.path.basename(path)
            
            # Utiliser un nom générique si nécessaire
            if not base_filename or base_filename == "/" or "." not in base_filename:
                if video_type == "iframe_embed":
                    platform = video.get("platform", "video")
                    base_filename = f"{platform}_{int(time.time())}_{uuid.uuid4().hex[:8]}.mp4"
                else:
                    base_filename = f"video_{int(time.time())}_{uuid.uuid4().hex[:8]}.mp4"
            
            filename = base_filename
        
        # Pour les iframes YouTube/Vimeo, extraire l'ID de la vidéo
        if video_type == "iframe_embed":
            platform = video.get("platform")
            
            # Construire une URL directe pour yt-dlp
            if platform == "youtube":
                youtube_pattern = r'(?:embed\/|watch\?v=|youtu\.be\/|\/v\/|\/e\/|watch\?.*v=)([^&?%#\/\s]*)'
                match = re.search(youtube_pattern, video_src)
                if match:
                    video_id = match.group(1)
                    video_src = f"https://www.youtube.com/watch?v={video_id}"
            
            elif platform == "vimeo":
                vimeo_pattern = r'vimeo\.com\/(?:video\/)?([0-9]+)'
                match = re.search(vimeo_pattern, video_src)
                if match:
                    video_id = match.group(1)
                    video_src = f"https://vimeo.com/{video_id}"
            
            elif platform == "dailymotion":
                dm_pattern = r'dailymotion\.com\/(?:video\/)?([a-zA-Z0-9]+)'
                match = re.search(dm_pattern, video_src)
                if match:
                    video_id = match.group(1)
                    video_src = f"https://www.dailymotion.com/video/{video_id}"
        
        # Télécharger la vidéo
        return await download_video(video_src, ctx, filename)
        
    except Exception as e:
        ctx.error(f"Erreur lors du téléchargement de la vidéo: {str(e)}")
        return {"success": False, "error": str(e)}

# --- TikTok Video Downloader Tools ---

@mcp_host.tool()
async def download_tiktok_video_advanced(url: str, ctx: Context, quality: str = "best", include_audio: bool = True) -> Dict[str, Any]:
    """Télécharge une vidéo TikTok avec Playwright et extraction avancée
    
    Args:
        url: URL de la vidéo TikTok
        ctx: Contexte MCP
        quality: Qualité vidéo souhaitée ('best', 'worst', 'medium')
        include_audio: Inclure l'audio dans le téléchargement
    
    Returns:
        Informations sur le téléchargement et métadonnées de la vidéo
    """
    page: Page = ctx.request_context.lifespan_context.page
    
    try:
        ctx.info(f"Téléchargement TikTok avancé: {url}")
        
        # Valider l'URL TikTok
        if not is_valid_tiktok_url(url):
            return {"success": False, "error": "URL TikTok invalide"}
        
        # Nettoyer l'URL
        clean_url = clean_tiktok_url(url)
        
        # Créer le dossier de téléchargement
        download_dir = f"videos/{SESSION_ID}/tiktok"
        os.makedirs(download_dir, exist_ok=True)
        
        # Étape 1: Navigation avec anti-détection
        ctx.info("Navigation vers TikTok avec anti-détection...")
        navigation_result = await navigate_tiktok_with_stealth(page, clean_url, ctx)
        
        if not navigation_result["success"]:
            return {"success": False, "error": navigation_result["error"]}
        
        # Étape 2: Extraction des métadonnées
        ctx.info("Extraction des métadonnées de la vidéo...")
        metadata = await extract_tiktok_metadata(page, ctx)
        
        # Étape 3: Extraction de l'URL de la vidéo
        ctx.info("Extraction de l'URL de la vidéo...")
        video_urls = await extract_tiktok_video_urls(page, ctx)
        
        if not video_urls:
            return {"success": False, "error": "Impossible d'extraire les URLs de la vidéo"}
        
        # Étape 4: Sélection de la meilleure qualité
        selected_url = select_best_quality_url(video_urls, quality)
        
        # Étape 5: Téléchargement de la vidéo
        ctx.info("Téléchargement de la vidéo...")
        filename = generate_tiktok_filename(metadata, clean_url)
        download_result = await download_video_file(selected_url, download_dir, filename, ctx)
        
        if not download_result["success"]:
            return {"success": False, "error": download_result["error"]}
        
        # Étape 6: Post-traitement (si nécessaire)
        final_path = download_result["file_path"]
        if not include_audio:
            ctx.info("Suppression de l'audio...")
            final_path = await remove_audio_from_video(download_result["file_path"], ctx)
        
        # Étape 7: Génération de la miniature
        thumbnail_path = await generate_video_thumbnail(final_path, ctx)
        
        return {
            "success": True,
            "file_path": final_path,
            "thumbnail_path": thumbnail_path,
            "metadata": metadata,
            "file_size": os.path.getsize(final_path),
            "file_size_human": format_file_size(os.path.getsize(final_path)),
            "duration": metadata.get("duration", "Unknown"),
            "quality": quality,
            "include_audio": include_audio,
            "download_method": "playwright_advanced"
        }
        
    except Exception as e:
        ctx.error(f"Erreur lors du téléchargement TikTok: {str(e)}")
        return {"success": False, "error": str(e)}

async def navigate_tiktok_with_stealth(page: Page, url: str, ctx: Context) -> Dict[str, Any]:
    """Navigation TikTok avec techniques de camouflage avancées"""
    try:
        # Configuration des en-têtes HTTP avancés
        await page.set_extra_http_headers({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
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
        
        # Injection de scripts anti-détection spécifiques à TikTok
        await page.add_init_script("""
        // Script anti-détection TikTok avancé
        (() => {
            // Masquer WebDriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
            });
            
            // Simuler un navigateur réel
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                    { name: 'Chrome PDF Viewer', description: '', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                    { name: 'Native Client', description: '', filename: 'internal-nacl-plugin' }
                ]
            });
            
            // Masquer les traces de Playwright
            delete window.playwright;
            delete window.__playwright;
            delete window.__pw_manual;
            
            // TikTok spécifique - Simuler les objets attendus
            window.TiktokAnalyticsObject = 'ttq';
            window.ttq = window.ttq || [];
            
            // Simuler les événements de souris pour TikTok
            let mouseEvents = ['mousedown', 'mouseup', 'mousemove', 'click'];
            mouseEvents.forEach(eventType => {
                document.addEventListener(eventType, (e) => {
                    window.lastMouseEvent = {
                        type: eventType,
                        timestamp: Date.now(),
                        x: e.clientX,
                        y: e.clientY
                    };
                }, true);
            });
            
            // Simuler l'activité utilisateur
            setInterval(() => {
                window.dispatchEvent(new Event('user-activity'));
            }, 1000 + Math.random() * 2000);
            
            // Overrider les fonctions de détection communes
            const originalToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this.name === 'webdriver' || this.name === 'driver') {
                    return 'function webdriver() { [native code] }';
                }
                return originalToString.call(this);
            };
        })();
        """)
        
        # Navigation avec retry en cas d'échec
        max_retries = 3
        for attempt in range(max_retries):
            try:
                ctx.info(f"Tentative de navigation {attempt + 1}/{max_retries}")
                
                # Simuler un comportement humain avant navigation
                await asyncio.sleep(random.uniform(1, 3))
                
                response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
                
                # Attendre que la page soit stable
                await page.wait_for_load_state("networkidle", timeout=30000)
                
                # Vérifier si on a été redirigé vers une page d'erreur
                current_url = page.url
                if "error" in current_url.lower() or "not-found" in current_url.lower():
                    raise Exception("Page d'erreur détectée")
                
                # Simuler l'activité utilisateur
                await simulate_user_activity(page, ctx)
                
                # Vérifier la présence de CAPTCHA
                captcha_detected = await detect_tiktok_captcha(page, ctx)
                if captcha_detected:
                    ctx.info("CAPTCHA détecté, tentative de résolution...")
                    captcha_solved = await solve_tiktok_captcha(page, ctx)
                    if not captcha_solved:
                        if attempt < max_retries - 1:
                            ctx.warning("CAPTCHA non résolu, nouvelle tentative...")
                            await asyncio.sleep(5)
                            continue
                        else:
                            return {"success": False, "error": "CAPTCHA non résolu après plusieurs tentatives"}
                
                # Vérifier que la vidéo est chargée
                video_loaded = await wait_for_video_load(page, ctx)
                if not video_loaded:
                    if attempt < max_retries - 1:
                        ctx.warning("Vidéo non chargée, nouvelle tentative...")
                        await asyncio.sleep(3)
                        continue
                    else:
                        return {"success": False, "error": "Vidéo non chargée après plusieurs tentatives"}
                
                return {"success": True, "url": current_url}
                
            except Exception as e:
                ctx.warning(f"Tentative {attempt + 1} échouée: {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(5)
                    continue
                else:
                    return {"success": False, "error": f"Navigation échouée après {max_retries} tentatives: {str(e)}"}
        
    except Exception as e:
        return {"success": False, "error": f"Erreur de navigation: {str(e)}"}

async def simulate_user_activity(page: Page, ctx: Context):
    """Simuler une activité utilisateur réaliste"""
    try:
        # Mouvements de souris aléatoires
        for _ in range(random.randint(3, 7)):
            x = random.randint(100, 1800)
            y = random.randint(100, 900)
            await page.mouse.move(x, y)
            await asyncio.sleep(random.uniform(0.1, 0.5))
        
        # Scroll aléatoire
        for _ in range(random.randint(1, 3)):
            await page.mouse.wheel(0, random.randint(-200, 200))
            await asyncio.sleep(random.uniform(0.5, 1.5))
        
        # Pause pour simuler la lecture
        await asyncio.sleep(random.uniform(2, 5))
        
    except Exception as e:
        ctx.warning(f"Erreur lors de la simulation d'activité: {str(e)}")

async def detect_tiktok_captcha(page: Page, ctx: Context) -> bool:
    """Détecter la présence d'un CAPTCHA TikTok"""
    try:
        captcha_selectors = [
            'iframe[src*="captcha"]',
            'div[class*="captcha"]',
            'div[class*="verify"]',
            '.captcha_verify_container',
            '.secsdk-captcha-wrapper',
            '[data-testid="captcha"]'
        ]
        
        for selector in captcha_selectors:
            element = await page.query_selector(selector)
            if element and await element.is_visible():
                return True
        
        return False
    except Exception:
        return False

async def solve_tiktok_captcha(page: Page, ctx: Context) -> bool:
    """Résoudre le CAPTCHA TikTok"""
    try:
        # Utiliser la fonction existante
        captcha_result = await solve_tiktok_puzzle_captcha(page, ctx)
        return captcha_result.get("solved", False)
    except Exception as e:
        ctx.error(f"Erreur lors de la résolution du CAPTCHA: {str(e)}")
        return False

async def wait_for_video_load(page: Page, ctx: Context) -> bool:
    """Attendre que la vidéo soit chargée"""
    try:
        # Attendre la présence d'éléments vidéo
        await page.wait_for_selector('video', timeout=30000)
        
        # Vérifier que la vidéo a des données
        video_data = await page.evaluate("""
        () => {
            const videos = document.querySelectorAll('video');
            for (const video of videos) {
                if (video.src || video.currentSrc) {
                    return {
                        found: true,
                        src: video.src || video.currentSrc,
                        duration: video.duration,
                        readyState: video.readyState
                    };
                }
            }
            return { found: false };
        }
        """)
        
        return video_data.get("found", False)
    except Exception as e:
        ctx.warning(f"Erreur lors de l'attente de chargement vidéo: {str(e)}")
        return False

async def extract_tiktok_metadata(page: Page, ctx: Context) -> Dict[str, Any]:
    """Extraire les métadonnées de la vidéo TikTok"""
    try:
        metadata = await page.evaluate("""
        () => {
            const data = {};
            
            // Extraire depuis les meta tags
            const metaTags = document.querySelectorAll('meta');
            metaTags.forEach(tag => {
                const property = tag.getAttribute('property') || tag.getAttribute('name');
                const content = tag.getAttribute('content');
                
                if (property && content) {
                    if (property.includes('title') || property.includes('description')) {
                        data[property] = content;
                    }
                }
            });
            
            // Extraire depuis les scripts JSON-LD
            const scripts = document.querySelectorAll('script[type="application/ld+json"]');
            scripts.forEach(script => {
                try {
                    const json = JSON.parse(script.textContent);
                    if (json['@type'] === 'VideoObject') {
                        data.title = json.name || data.title;
                        data.description = json.description || data.description;
                        data.duration = json.duration;
                        data.uploadDate = json.uploadDate;
                        data.author = json.author?.name;
                    }
                } catch (e) {}
            });
            
            // Extraire depuis les éléments de la page
            const titleElement = document.querySelector('[data-e2e="browse-video-desc"]') || 
                                document.querySelector('h1') || 
                                document.querySelector('[data-testid="video-title"]');
            if (titleElement) {
                data.title = titleElement.textContent?.trim() || data.title;
            }
            
            const authorElement = document.querySelector('[data-e2e="browse-username"]') ||
                                 document.querySelector('[data-testid="author-name"]');
            if (authorElement) {
                data.author = authorElement.textContent?.trim() || data.author;
            }
            
            // Extraire les informations vidéo
            const video = document.querySelector('video');
            if (video) {
                data.videoWidth = video.videoWidth;
                data.videoHeight = video.videoHeight;
                data.duration = video.duration || data.duration;
            }
            
            return data;
        }
        """)
        
        return metadata
    except Exception as e:
        ctx.warning(f"Erreur lors de l'extraction des métadonnées: {str(e)}")
        return {}

async def extract_tiktok_video_urls(page: Page, ctx: Context) -> List[Dict[str, Any]]:
    """Extraire les URLs de la vidéo TikTok"""
    try:
        video_urls = await page.evaluate("""
        () => {
            const urls = [];
            
            // Méthode 1: Éléments vidéo directs
            const videos = document.querySelectorAll('video');
            videos.forEach((video, index) => {
                if (video.src) {
                    urls.push({
                        url: video.src,
                        quality: 'unknown',
                        type: 'direct',
                        source: `video_element_${index}`
                    });
                }
                
                // Sources multiples
                const sources = video.querySelectorAll('source');
                sources.forEach((source, sourceIndex) => {
                    if (source.src) {
                        urls.push({
                            url: source.src,
                            quality: source.getAttribute('data-quality') || 'unknown',
                            type: 'source',
                            source: `video_source_${index}_${sourceIndex}`
                        });
                    }
                });
            });
            
            // Méthode 2: Scripts et données JSON
            const scripts = document.querySelectorAll('script');
            scripts.forEach((script, index) => {
                const content = script.textContent || '';
                
                // Recherche des URLs de vidéo dans le contenu
                const videoUrlPatterns = [
                    /["']playAddr["']:\s*["']([^"']+)["']/g,
                    /["']downloadAddr["']:\s*["']([^"']+)["']/g,
                    /["']url["']:\s*["']([^"']+\.mp4[^"']*)["']/g,
                    /https:\/\/[^"'\s]+\.mp4[^"'\s]*/g
                ];
                
                videoUrlPatterns.forEach(pattern => {
                    const matches = content.matchAll(pattern);
                    for (const match of matches) {
                        let url = match[1] || match[0];
                        if (url && url.includes('.mp4')) {
                            // Nettoyer l'URL
                            url = url.replace(/\\u002F/g, '/').replace(/\\/g, '');
                            urls.push({
                                url: url,
                                quality: 'unknown',
                                type: 'script_extracted',
                                source: `script_${index}`
                            });
                        }
                    }
                });
            });
            
            // Méthode 3: API calls interceptées (si disponibles)
            if (window.tiktokVideoUrls) {
                window.tiktokVideoUrls.forEach((url, index) => {
                    urls.push({
                        url: url,
                        quality: 'api',
                        type: 'intercepted',
                        source: `api_${index}`
                    });
                });
            }
            
            // Dédupliquer les URLs
            const uniqueUrls = [];
            const seen = new Set();
            
            urls.forEach(item => {
                if (!seen.has(item.url)) {
                    seen.add(item.url);
                    uniqueUrls.push(item);
                }
            });
            
            return uniqueUrls;
        }
        """)
        
        # Filtrer et valider les URLs
        valid_urls = []
        for url_data in video_urls:
            url = url_data.get("url", "")
            if url and is_valid_video_url(url):
                valid_urls.append(url_data)
        
        return valid_urls
        
    except Exception as e:
        ctx.error(f"Erreur lors de l'extraction des URLs vidéo: {str(e)}")
        return []

def select_best_quality_url(video_urls: List[Dict[str, Any]], quality_preference: str) -> str:
    """Sélectionner la meilleure URL selon la préférence de qualité"""
    if not video_urls:
        return None
    
    # Priorités par type de source
    source_priority = {
        'direct': 3,
        'source': 2,
        'script_extracted': 1,
        'intercepted': 4
    }
    
    # Trier par priorité de source
    sorted_urls = sorted(video_urls, key=lambda x: source_priority.get(x.get('type', ''), 0), reverse=True)
    
    if quality_preference == "best":
        return sorted_urls[0]["url"]
    elif quality_preference == "worst":
        return sorted_urls[-1]["url"]
    else:  # medium
        mid_index = len(sorted_urls) // 2
        return sorted_urls[mid_index]["url"]

async def download_video_file(url: str, download_dir: str, filename: str, ctx: Context) -> Dict[str, Any]:
    """Télécharger le fichier vidéo"""
    try:
        file_path = os.path.join(download_dir, filename)
        
        # En-têtes pour le téléchargement
        headers = {
            'User-Agent': random.choice(USER_AGENTS),
            'Referer': 'https://www.tiktok.com/',
            'Accept': '*/*',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site',
            'Range': 'bytes=0-'
        }
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=300) as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code in [200, 206]:
                with open(file_path, 'wb') as f:
                    f.write(response.content)
                
                return {
                    "success": True,
                    "file_path": file_path,
                    "file_size": len(response.content)
                }
            else:
                return {
                    "success": False,
                    "error": f"Échec du téléchargement: HTTP {response.status_code}"
                }
                
    except Exception as e:
        return {"success": False, "error": f"Erreur de téléchargement: {str(e)}"}

async def remove_audio_from_video(video_path: str, ctx: Context) -> str:
    """Supprimer l'audio d'une vidéo avec ffmpeg"""
    try:
        output_path = video_path.replace('.mp4', '_no_audio.mp4')
        
        command = [
            'ffmpeg',
            '-i', video_path,
            '-c:v', 'copy',
            '-an',  # Supprimer l'audio
            '-y',   # Overwrite output file
            output_path
        ]
        
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            # Supprimer le fichier original
            os.remove(video_path)
            return output_path
        else:
            ctx.warning(f"Échec de la suppression audio: {stderr.decode()}")
            return video_path
            
    except Exception as e:
        ctx.warning(f"Erreur lors de la suppression audio: {str(e)}")
        return video_path

async def generate_video_thumbnail(video_path: str, ctx: Context) -> str:
    """Générer une miniature de la vidéo"""
    try:
        thumbnail_path = video_path.replace('.mp4', '_thumbnail.jpg')
        
        command = [
            'ffmpeg',
            '-i', video_path,
            '-ss', '00:00:01',  # Prendre la frame à 1 seconde
            '-vframes', '1',    # Une seule frame
            '-y',               # Overwrite
            thumbnail_path
        ]
        
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            return thumbnail_path
        else:
            ctx.warning(f"Échec de la génération de miniature: {stderr.decode()}")
            return None
            
    except Exception as e:
        ctx.warning(f"Erreur lors de la génération de miniature: {str(e)}")
        return None

# --- Fonctions utilitaires ---

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
    # Supprimer les paramètres de tracking
    parsed = urlparse(url)
    clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    
    # Convertir les URLs courtes
    if 'vm.tiktok.com' in url or '/t/' in url:
        # Ces URLs nécessitent une redirection, on les laisse telles quelles
        return url
    
    return clean_url

def is_valid_video_url(url: str) -> bool:
    """Vérifier si l'URL est une URL vidéo valide"""
    if not url or not isinstance(url, str):
        return False
    
    # Vérifier le format de base
    if not url.startswith(('http://', 'https://')):
        return False
    
    # Vérifier l'extension ou le type
    video_indicators = ['.mp4', '.webm', '.m4v', 'video', 'stream']
    return any(indicator in url.lower() for indicator in video_indicators)

def generate_tiktok_filename(metadata: Dict[str, Any], url: str) -> str:
    """Générer un nom de fichier pour la vidéo TikTok"""
    # Extraire l'ID de la vidéo de l'URL
    video_id_match = re.search(r'/video/(\d+)', url)
    video_id = video_id_match.group(1) if video_id_match else str(uuid.uuid4())[:8]
    
    # Nettoyer le titre si disponible
    title = metadata.get('title', '')
    if title:
        # Nettoyer le titre pour le nom de fichier
        title = re.sub(r'[^\w\s-]', '', title)[:50]
        title = re.sub(r'\s+', '_', title)
        return f"tiktok_{video_id}_{title}.mp4"
    
    # Nom par défaut
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

# --- Outil pour lister les vidéos TikTok d'un profil ---

@mcp_host.tool()
async def get_tiktok_profile_videos(username: str, ctx: Context, limit: int = 10) -> Dict[str, Any]:
    """Récupérer la liste des vidéos d'un profil TikTok
    
    Args:
        username: Nom d'utilisateur TikTok (sans @)
        ctx: Contexte MCP
        limit: Nombre maximum de vidéos à récupérer
    
    Returns:
        Liste des vidéos du profil avec métadonnées
    """
    page: Page = ctx.request_context.lifespan_context.page
    
    try:
        ctx.info(f"Récupération des vidéos du profil @{username}")
        
        # Construire l'URL du profil
        profile_url = f"https://www.tiktok.com/@{username}"
        
        # Navigation vers le profil
        navigation_result = await navigate_tiktok_with_stealth(page, profile_url, ctx)
        if not navigation_result["success"]:
            return {"success": False, "error": navigation_result["error"]}
        
        # Attendre le chargement des vidéos
        await page.wait_for_selector('[data-e2e="user-post-item"]', timeout=30000)
        
        # Extraire les informations des vidéos
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

# --- Outil pour télécharger plusieurs vidéos ---

@mcp_host.tool()
async def download_multiple_tiktok_videos(urls: List[str], ctx: Context, quality: str = "best") -> Dict[str, Any]:
    """Télécharger plusieurs vidéos TikTok en lot
    
    Args:
        urls: Liste des URLs TikTok à télécharger
        ctx: Contexte MCP
        quality: Qualité vidéo souhaitée
    
    Returns:
        Résultats du téléchargement en lot
    """
    try:
        ctx.info(f"Téléchargement en lot de {len(urls)} vidéos TikTok")
        
        results = []
        success_count = 0
        
        for i, url in enumerate(urls):
            ctx.info(f"Téléchargement {i+1}/{len(urls)}: {url}")
            
            result = await download_tiktok_video_advanced(url, ctx, quality)
            results.append({
                "url": url,
                "index": i,
                "result": result
            })
            
            if result.get("success", False):
                success_count += 1
            
            # Pause entre les téléchargements pour éviter le rate limiting
            await asyncio.sleep(random.uniform(2, 5))
        
        return {
            "success": True,
            "total_videos": len(urls),
            "successful_downloads": success_count,
            "failed_downloads": len(urls) - success_count,
            "results": results
        }
        
    except Exception as e:
        ctx.error(f"Erreur lors du téléchargement en lot: {str(e)}")
        return {"success": False, "error": str(e)}

# @mcp_host.tool()
# async def download_tiktok_video(url: str, ctx: Context, filename: Optional[str] = None) -> Dict[str, Any]:
#     """Télécharge une vidéo TikTok en évitant les mesures anti-bots
    
#     Args:
#         url: URL de la vidéo TikTok
#         ctx: Contexte MCP
#         filename: Nom de fichier optionnel
    
#     Returns:
#         Informations sur le téléchargement
#     """
#     try:
#         ctx.info(f"Tentative de téléchargement vidéo TikTok depuis: {url}")
        
#         # Vérifier si l'URL est valide
#         if not url or not ('tiktok.com' in url):
#             return {"success": False, "error": "URL TikTok invalide"}
        
#         # Générer un nom de fichier si non fourni
#         if not filename:
#             filename = f"tiktok_video_{int(time.time())}_{uuid.uuid4().hex[:8]}.mp4"
        
#         # Chemin de sortie
#         output_path = os.path.join(f"videos/{SESSION_ID}", filename)
        
#         # Méthode 1: Utiliser yt-dlp (méthode privilégiée pour TikTok)
#         try:
#             ctx.info("Utilisation de yt-dlp pour télécharger la vidéo TikTok")
#             command = [
#                 "yt-dlp", 
#                 url,
#                 "-o", output_path,
#                 "--no-playlist",
#                 "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
#                 "--merge-output-format", "mp4",
#                 # Options spécifiques à TikTok
#                 "--cookies-from-browser", "chrome",  # Utiliser les cookies de Chrome si disponibles
#                 "--user-agent", random.choice(USER_AGENTS),
#                 "--referer", "https://www.tiktok.com/",
#                 "--add-header", "Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
#                 "--no-check-certificate",  # Ignorer les problèmes de certificats
#                 "--force-generic-extractor"  # Forcer l'extracteur générique en cas d'échec
#             ]
            
#             # Exécuter la commande
#             process = await asyncio.create_subprocess_exec(
#                 *command,
#                 stdout=asyncio.subprocess.PIPE,
#                 stderr=asyncio.subprocess.PIPE
#             )
            
#             stdout, stderr = await process.communicate()
            
#             if process.returncode != 0:
#                 error_msg = stderr.decode() if stderr else "Erreur inconnue"
#                 ctx.warning(f"Erreur yt-dlp: {error_msg}, tentative avec la méthode 2")
#                 # Continuer avec la méthode 2 si yt-dlp échoue
#             else:
#                 # Vérifier si le fichier a été créé
#                 if os.path.exists(output_path):
#                     file_size = os.path.getsize(output_path)
#                     return {
#                         "success": True, 
#                         "file_path": output_path,
#                         "file_size": file_size,
#                         "file_size_human": f"{file_size / (1024*1024):.2f} MB",
#                         "method": "yt-dlp"
#                     }
#         except Exception as e:
#             ctx.warning(f"Erreur avec yt-dlp: {str(e)}, passage à la méthode alternative")
        
#         # Méthode 2: Navigation et extraction directe via Playwright
#         ctx.info("Utilisation de Playwright pour extraire la vidéo TikTok")
#         page: Page = ctx.request_context.lifespan_context.page
#         context: BrowserContext = ctx.request_context.lifespan_context.context
        
#         # Naviguer vers la page avec anti-détection
#         try:
#             # Ajouter des en-têtes HTTP supplémentaires pour TikTok
#             await page.set_extra_http_headers({
#                 'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
#                 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
#                 'Accept-Encoding': 'gzip, deflate, br',
#                 'Cache-Control': 'max-age=0',
#                 'Connection': 'keep-alive',
#                 'Upgrade-Insecure-Requests': '1',
#                 'Sec-Fetch-Dest': 'document',
#                 'Sec-Fetch-Mode': 'navigate',
#                 'Sec-Fetch-Site': 'none',
#                 'Sec-Fetch-User': '?1',
#                 'Pragma': 'no-cache'
#             })
            
#             # Simuler un comportement humain avant la navigation
#             await emulate_human_behavior(page)
            
#             # Naviguer vers TikTok
#             ctx.info(f"Navigation vers TikTok: {url}")
#             response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            
#             # Temps d'attente aléatoire comme le ferait un humain
#             await asyncio.sleep(1 + random.random() * 2)
            
#             # Vérifier si TikTok a affiché un CAPTCHA
#             if (await page.query_selector('iframe[src*="captcha"], iframe[title*="captcha"]') or 
#                 await page.query_selector('div[class*="captcha"], div[class*="verify"]')):
                
#                 ctx.info("CAPTCHA TikTok détecté, tentative de résolution...")
                
#                 # D'abord vérifier s'il s'agit d'un puzzle coulissant
#                 captcha_result = await solve_tiktok_puzzle_captcha(page, ctx)
                
#                 if not captcha_result.get("solved", False):
#                     # Si le puzzle coulissant échoue, essayer les autres méthodes
#                     captcha_result = await detect_and_solve_captcha(page, ctx)
                
#                 if captcha_result.get("solved", False):
#                     # Captcha résolu, attendre que la page se charge
#                     await asyncio.sleep(2)
#                     await page.wait_for_load_state("networkidle")
#                 else:
#                     ctx.warning("Impossible de résoudre le CAPTCHA, tentative d'extraction quand même")
            
#             # Attendre le chargement complet
#             await page.wait_for_load_state("networkidle")
            
#             # Faire défiler lentement pour déclencher le chargement de la vidéo
#             for _ in range(random.randint(1, 3)):
#                 await page.mouse.wheel(0, random.randint(100, 200))
#                 await asyncio.sleep(random.uniform(0.5, 1.0))
            
#             # Essayer d'extraire la vidéo directement de la page

#             video_data = await page.evaluate(r"""() => {
#                 // Chercher l'URL de la vidéo dans différents éléments et attributs
                
#                 // Méthode 1: Chercher les éléments vidéo directs
#                 const videoElements = document.querySelectorAll('video');
#                 for (const video of videoElements) {
#                     if (video.src && video.src.includes('.mp4')) {
#                         return { url: video.src, method: 'video_element' };
#                     }
                    
#                     // Vérifier les sources
#                     const sources = video.querySelectorAll('source');
#                     for (const source of sources) {
#                         if (source.src && source.src.includes('.mp4')) {
#                             return { url: source.src, method: 'video_source' };
#                         }
#                     }
#                 }
                
#                 // Méthode 2: Chercher dans le contenu JSON de la page
#                 try {
#                     const scripts = document.querySelectorAll('script');
#                     for (const script of scripts) {
#                         const content = script.textContent || '';
#                         if (content.includes('playAddr') || content.includes('downloadAddr')) {
#                             // Trouver l'URL de la vidéo dans le JSON
#                             const playAddrMatch = content.match(/"playAddr":"([^"]+)"/);
#                             const downloadAddrMatch = content.match(/"downloadAddr":"([^"]+)"/);
                            
#                             if (playAddrMatch && playAddrMatch[1]) {
#                                 return { 
#                                     url: playAddrMatch[1].replace(/\\u002F/g, '/'), 
#                                     method: 'json_playAddr' 
#                                 };
#                             }
                            
#                             if (downloadAddrMatch && downloadAddrMatch[1]) {
#                                 return { 
#                                     url: downloadAddrMatch[1].replace(/\\u002F/g, '/'), 
#                                     method: 'json_downloadAddr' 
#                                 };
#                             }
#                         }
#                     }
#                 } catch (e) {
#                     console.error('Erreur lors de l\'analyse JSON:', e);
#                 }
                
#                 // Méthode 3: Chercher les URLs de vidéo dans le HTML
#                 const html = document.documentElement.innerHTML;
#                 const videoUrlMatches = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/g);
#                 if (videoUrlMatches && videoUrlMatches.length > 0) {
#                     return { url: videoUrlMatches[0], method: 'html_regex' };
#                 }
                
#                 return null;
#             }""")

#             if video_data and video_data.get('url'):
#                 video_url = video_data.get('url')
#                 method = video_data.get('method', 'unknown')
#                 ctx.info(f"URL vidéo trouvée par {method}: {video_url[:50]}...")
                
#                 # Télécharger la vidéo
#                 async with httpx.AsyncClient(follow_redirects=True) as client:
#                     headers = {
#                         'User-Agent': random.choice(USER_AGENTS),
#                         'Referer': 'https://www.tiktok.com/',
#                         'Accept': '*/*',
#                         'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
#                         'Range': 'bytes=0-'  # Pour les téléchargements partiels
#                     }
                    
#                     response = await client.get(video_url, headers=headers)
                    
#                     if response.status_code in (200, 206):  # OK ou Partial Content
#                         # Écrire le fichier
#                         with open(output_path, "wb") as f:
#                             f.write(response.content)
                        
#                         file_size = os.path.getsize(output_path)
#                         return {
#                             "success": True, 
#                             "file_path": output_path,
#                             "file_size": file_size,
#                             "file_size_human": f"{file_size / (1024*1024):.2f} MB",
#                             "method": f"direct_extraction_{method}"
#                         }
#                     else:
#                         ctx.error(f"Échec du téléchargement direct: {response.status_code}")
#         except Exception as e:
#             ctx.error(f"Erreur lors de l'extraction via Playwright: {str(e)}")
        
#         # Méthode 3: Utiliser l'API TikTok sans clé
#         try:
#             ctx.info("Tentative via l'API TikTok sans clé")
            
#             # Extraire l'ID de la vidéo de l'URL
#             video_id_match = re.search(r'/video/(\d+)', url)
#             if not video_id_match:
#                 return {"success": False, "error": "Impossible d'extraire l'ID de la vidéo TikTok"}
            
#             video_id = video_id_match.group(1)
#             api_url = f"https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?aweme_id={video_id}"
            
#             async with httpx.AsyncClient() as client:
#                 headers = {
#                     'User-Agent': 'TikTok 26.2.0 rv:262018 (iPhone; iOS 14.4.2; en_US) Cronet',
#                     'Accept': 'application/json',
#                 }
                
#                 response = await client.get(api_url, headers=headers)
                
#                 if response.status_code == 200:
#                     try:
#                         json_data = response.json()
#                         aweme_list = json_data.get('aweme_list', [])
                        
#                         if aweme_list and len(aweme_list) > 0:
#                             # Extraire l'URL de la vidéo
#                             video_info = aweme_list[0]
#                             if 'video' in video_info and 'play_addr' in video_info['video']:
#                                 play_addr = video_info['video']['play_addr']
#                                 video_url = play_addr.get('url_list', [])[0]
                                
#                                 if video_url:
#                                     # Télécharger la vidéo
#                                     dl_response = await client.get(video_url)
                                    
#                                     if dl_response.status_code == 200:
#                                         with open(output_path, "wb") as f:
#                                             f.write(dl_response.content)
                                        
#                                         file_size = os.path.getsize(output_path)
#                                         return {
#                                             "success": True, 
#                                             "file_path": output_path,
#                                             "file_size": file_size,
#                                             "file_size_human": f"{file_size / (1024*1024):.2f} MB",
#                                             "method": "tiktok_api"
#                                         }
#                     except Exception as e:
#                         ctx.error(f"Erreur lors du traitement de la réponse API: {str(e)}")
#         except Exception as e:
#             ctx.error(f"Erreur lors de l'utilisation de l'API TikTok: {str(e)}")
        
#         # Si toutes les méthodes échouent
#         return {"success": False, "error": "Impossible de télécharger la vidéo avec toutes les méthodes disponibles"}
        
#     except Exception as e:
#         ctx.error(f"Erreur lors du téléchargement de la vidéo TikTok: {str(e)}")
#         return {"success": False, "error": str(e)}

# --- Fonctions de navigation spécifiques pour TikTok ---
@mcp_host.tool()
async def navigate_tiktok(url: str, ctx: Context) -> Dict[str, Any]:
    """Navigue sur TikTok avec des techniques avancées pour éviter la détection
    
    Args:
        url: L'URL TikTok à visiter
        ctx: Le contexte MCP
    
    Returns:
        Résultat de la navigation
    """
    page: Page = ctx.request_context.lifespan_context.page
    context: BrowserContext = ctx.request_context.lifespan_context.context
    
    try:
        ctx.info(f"Navigation spéciale TikTok vers: {url}")
        
        # 1. Préparer le contexte
        # Ajouter des en-têtes HTTP supplémentaires qui sont typiques des navigateurs réels
        await page.set_extra_http_headers({
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Pragma': 'no-cache'
        })
        
        # 2. Simuler un comportement humain avant la navigation
        await emulate_human_behavior(page)
        
        # 3. Naviguer vers TikTok avec des délais aléatoires
        response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        # 4. Comportement humain après chargement initial
        await asyncio.sleep(random.uniform(1.0, 2.5))
        
        # 5. Vérifier si TikTok a affiché un CAPTCHA
        if (await page.query_selector('iframe[src*="captcha"], iframe[title*="captcha"]') or 
            await page.query_selector('div[class*="captcha"], div[class*="verify"]')):
            
            ctx.info("CAPTCHA TikTok détecté, tentative de résolution...")
            
            # D'abord vérifier s'il s'agit d'un puzzle coulissant
            captcha_result = await solve_tiktok_puzzle_captcha(page, ctx)
            
            if not captcha_result.get("solved", False):
                # Si le puzzle coulissant échoue, essayer les autres méthodes
                captcha_result = await detect_and_solve_captcha(page, ctx)
            
            if captcha_result.get("solved", False):
                # Captcha résolu, attendre que la page se charge
                await asyncio.sleep(2)
                await page.wait_for_load_state("networkidle")
                
                # Recharger les informations de la page
                title = await page.title()
                current_url = page.url
                
                return {
                    "title": title, 
                    "url": current_url, 
                    "captcha_solved": True,
                    "status_code": response.status if response else None
                }
            else:
                # Si le CAPTCHA n'est pas résolu, informer l'utilisateur
                return {
                    "title": await page.title(), 
                    "url": page.url, 
                    "captcha_detected": True, 
                    "captcha_solved": False,
                    "captcha_info": captcha_result,
                    "status_code": response.status if response else None
                }
        
        # 6. Attendre le chargement complet
        await page.wait_for_load_state("networkidle")
        
        # 7. Simuler un comportement de navigation humain après chargement
        # Faire défiler lentement la page
        for _ in range(random.randint(2, 5)):
            # Scroll progressif avec vitesse variable
            scroll_amount = random.randint(100, 300)
            await page.mouse.wheel(0, scroll_amount)
            await asyncio.sleep(random.uniform(0.7, 1.3))
        
        # 8. Interagir occasionnellement avec la page
        if random.random() > 0.7:
            # Trouver un élément interactif aléatoire et le survoler
            elements = await page.query_selector_all('a, button, [role="button"], .tiktok-button')
            if elements and len(elements) > 0:
                random_element = elements[random.randint(0, len(elements) - 1)]
                elem_box = await random_element.bounding_box()
                if elem_box:
                    # Survoler l'élément
                    await page.mouse.move(
                        elem_box['x'] + elem_box['width'] / 2,
                        elem_box['y'] + elem_box['height'] / 2
                    )
                    await asyncio.sleep(random.uniform(0.3, 0.7))
        
        # 9. Récupérer le titre et l'URL finale
        title = await page.title()
        current_url = page.url
        
        return {
            "title": title, 
            "url": current_url,
            "status_code": response.status if response else None,
            "success": True
        }
    except Exception as e:
        ctx.error(f"Erreur lors de la navigation TikTok vers {url}: {str(e)}")
        return {"error": f"Échec de navigation vers {url}: {str(e)}"}

# --- Improved Puppeteer tools with CAPTCHA detection and handling ---
@mcp_host.tool()
async def navigate(url: str, ctx: Context) -> Dict[str, Any]:
    """Navigate to a specified URL with automatic CAPTCHA detection
    
    Args:
        url: The URL to navigate to
        ctx: The MCP context
    
    Returns:
        Information about the loaded page including title and URL
    """
    # Pour TikTok, utiliser la navigation spécialisée
    if 'tiktok.com' in url:
        return await navigate_tiktok(url, ctx)
    
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Navigating to: {url}")
        
        # Naviguer avec des temps d'attente aléatoires pour imiter un humain
        response = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        
        # Attendre un temps aléatoire comme le ferait un humain
        await asyncio.sleep(1 + random.random() * 2)
        
        # Simuler un mouvement de souris aléatoire
        await page.mouse.move(
            random.randint(100, 700), 
            random.randint(100, 500)
        )
        
        # Vérifier si la page a été redirigée vers une page de CAPTCHA
        current_url = page.url
        if "captcha" in current_url.lower() or await page.query_selector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'):
            ctx.info("Captcha détecté lors de la navigation")
            captcha_result = await detect_and_solve_captcha(page, ctx)
            
            if captcha_result.get("solved", False):
                # Attendre que la redirection se produise après résolution du CAPTCHA
                await asyncio.sleep(2)
                await page.wait_for_load_state("networkidle")
                
                # Recharger les informations de la page
                title = await page.title()
                current_url = page.url
                
                return {
                    "title": title, 
                    "url": current_url, 
                    "captcha_solved": True,
                    "status_code": response.status if response else None
                }
            else:
                # CAPTCHA non résolu
                return {
                    "title": await page.title(), 
                    "url": current_url, 
                    "captcha_detected": True, 
                    "captcha_solved": False,
                    "captcha_info": captcha_result,
                    "status_code": response.status if response else None
                }
        
        # Attendre que la page soit complètement chargée
        await page.wait_for_load_state("networkidle")
        title = await page.title()
        
        return {
            "title": title, 
            "url": current_url,
            "status_code": response.status if response else None
        }
    except Exception as e:
        ctx.error(f"Error navigating to {url}: {str(e)}")
        return {"error": f"Failed to navigate to {url}: {str(e)}"}

@mcp_host.tool()
async def screenshot(ctx: Context) -> Image:
    """Take a screenshot of the current page
    
    Args:
        ctx: The MCP context
    
    Returns:
        The screenshot as an image
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Taking screenshot")
        fname = f"screenshot/{SESSION_ID}/screenshot_{uuid.uuid4()}.jpeg"
        await page.screenshot(path=fname, quality=80, type="jpeg")
        return Image(path=fname, format="jpeg")
    except Exception as e:
        ctx.error(f"Error taking screenshot: {str(e)}")
        # Return a placeholder or error image if possible
        # For now, we'll re-raise the exception
        raise RuntimeError(f"Failed to take screenshot: {str(e)}")

@mcp_host.tool()
async def click(x: int, y: int, ctx: Context) -> Dict[str, Any]:
    """Click at specific coordinates on the page
    
    Args:
        x: X coordinate for the click
        y: Y coordinate for the click
        ctx: The MCP context
    
    Returns:
        Information about the click action
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Clicking at coordinates: ({x}, {y})")
        
        # Simuler un mouvement de souris plus humain
        await emulate_human_behavior(page)
        
        # Déplacer la souris vers la cible avec un mouvement naturel
        current_pos = await page.evaluate("""() => { 
            return {x: window.mousePosX || 0, y: window.mousePosY || 0}; 
        }""")
        
        start_x = current_pos.get('x', 0)
        start_y = current_pos.get('y', 0)
        
        # Calculer la distance
        distance = ((x - start_x) ** 2 + (y - start_y) ** 2) ** 0.5
        
        # Nombre d'étapes basé sur la distance
        steps = max(10, int(distance / 10))
        
        # Mouvement progressif vers la cible
        for step in range(1, steps + 1):
            progress = step / steps
            ease = 0.5 - 0.5 * math.cos(math.pi * progress)
            
            current_x = start_x + (x - start_x) * ease
            current_y = start_y + (y - start_y) * ease
            
            # Ajouter un léger tremblement
            current_x += random.randint(-2, 2)
            current_y += random.randint(-2, 2)
            
            await page.mouse.move(current_x, current_y)
            await asyncio.sleep(random.uniform(0.005, 0.015))
        
        # Pause finale avant le clic
        await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # Effectuer le clic
        await page.mouse.click(x, y)
        
        # Attendre un moment après le clic pour que la page réagisse
        await asyncio.sleep(random.uniform(0.5, 1.5))
        
        return {"clicked_at": {"x": x, "y": y}}
    except Exception as e:
        ctx.error(f"Error clicking at ({x}, {y}): {str(e)}")
        return {"error": f"Failed to click at ({x}, {y}): {str(e)}"}

@mcp_host.tool()
async def scroll(direction: str, amount: int, ctx: Context) -> Dict[str, Any]:
    """Scroll the page up or down
    
    Args:
        direction: Direction to scroll: 'up' or 'down'
        amount: Amount to scroll in pixels
        ctx: The MCP context
    
    Returns:
        Information about the scroll action
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Scrolling {direction} by {amount} pixels")
        
        # Faire défiler de manière plus humaine, en plusieurs étapes
        steps = random.randint(3, 7)
        amount_per_step = amount / steps
        
        for i in range(steps):
            if direction.lower() == "down":
                await page.evaluate(f"window.scrollBy(0, {amount_per_step})")
            elif direction.lower() == "up":
                await page.evaluate(f"window.scrollBy(0, -{amount_per_step})")
            else:
                return {"scrolled": False, "error": f"Invalid direction: {direction}"}
            
            # Petite pause entre chaque étape
            await asyncio.sleep(random.uniform(0.05, 0.2))
        
        # Attendre un peu plus longtemps après le défilement pour le chargement
        await asyncio.sleep(random.uniform(0.5, 1.0))
        
        return {"scrolled": True, "direction": direction, "amount": amount}
    except Exception as e:
        ctx.error(f"Error scrolling {direction}: {str(e)}")
        return {"error": f"Failed to scroll {direction}: {str(e)}"}

@mcp_host.tool()
async def type(text: str, ctx: Context, submit: bool = False) -> Dict[str, Any]:
    """Type text into the last clicked element
    
    Args:
        text: Text to type into the last clicked element
        ctx: The MCP context
        submit: Whether to press Enter after typing (to submit forms)
    
    Returns:
        Information about the typing action
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Typing text: '{text}'")
        
        
        # Simuler une frappe plus humaine avec des vitesses variables
        for char in text:
            await page.keyboard.press(char)
            # Variation de la vitesse de frappe
            await asyncio.sleep(random.uniform(0.05, 0.15))
        
        submitted = False
        if submit:
            ctx.info("Pressing Enter to submit")
            # Pause légère avant d'appuyer sur Entrée
            await asyncio.sleep(random.uniform(0.2, 0.5))
            await page.keyboard.press('Enter')
            submitted = True
            # Attendre pour la réponse après soumission
            await asyncio.sleep(random.uniform(0.5, 1.5))
            
        return {"typed": True, "text": text, "submitted": submitted}
    except Exception as e:
        ctx.error(f"Error typing text: {str(e)}")
        return {"typed": False, "error": str(e)}

@mcp_host.tool()
async def get_page_info(ctx: Context) -> str:
    """Get information about the current page
    
    Args:
        ctx: The MCP context
    
    Returns:
        Information about the current page including title and URL
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        title = await page.title()
        return f"Current page: Title='{title}', URL='{page.url}'"
    except Exception as e:
        ctx.error(f"Error getting page info: {str(e)}")
        return f"Error getting page info: {str(e)}"

@mcp_host.tool()
def write_file(filename: str, content: str, ctx: Context) -> EmbeddedResource:
    """Write content to a file
    
    Args:
        filename: Name of the file to write to
        content: Content to write to the file
        ctx: The MCP context
    
    Returns:
        Information about the file writing operation including a resource URI
    """
    try:
        full = f"artefacts/{SESSION_ID}/{filename}"
        ctx.info(f"Writing to file: {full}")
        
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
            
        uri = f"artifact://{SESSION_ID}/{filename}"
        mime = "text/plain"
        if filename.endswith(".md"):   mime = "text/markdown"
        if filename.endswith(".html"): mime = "text/html"
        if filename.endswith(".json"): mime = "application/json"
        
        res = TextResourceContents(uri=uri, mimeType=mime, text=content[:100])
        return EmbeddedResource(type="resource", resource=res)
    except Exception as e:
        ctx.error(f"Error writing file: {str(e)}")
        return {"error": f"Failed to write file: {str(e)}"}

# --- Nouveaux outils Playwright avancés ---
@mcp_host.tool()
async def get_element_by_selector(selector: str, ctx: Context) -> Dict[str, Any]:
    """Find an element on the page using a CSS selector
    
    Args:
        selector: CSS selector to find the element
        ctx: The MCP context
    
    Returns:
        Information about the found element or error if not found
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Looking for element with selector: {selector}")
        # Check if element exists
        element = await page.query_selector(selector)
        if not element:
            return {"found": False, "message": f"No element found for selector: {selector}"}
        
        # Get element properties
        tag_name = await element.evaluate("el => el.tagName")
        text_content = await element.evaluate("el => el.textContent")
        is_visible = await element.is_visible()
        
        # Get bounding box for the element
        box = await element.bounding_box()
        coordinates = None
        if box:
            coordinates = {
                "x": box["x"],
                "y": box["y"],
                "width": box["width"],
                "height": box["height"],
                "center_x": box["x"] + box["width"] / 2,
                "center_y": box["y"] + box["height"] / 2
            }
        
        return {
            "found": True,
            "tag": tag_name,
            "text": text_content,
            "visible": is_visible,
            "coordinates": coordinates
        }
    except Exception as e:
        ctx.error(f"Error finding element with selector {selector}: {str(e)}")
        return {"error": f"Failed to find element: {str(e)}"}

@mcp_host.tool()
async def click_element(selector: str, ctx: Context) -> Dict[str, Any]:
    """Click on an element matched by the provided CSS selector
    
    Args:
        selector: CSS selector to find the element to click
        ctx: The MCP context
    
    Returns:
        Information about the click action
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Clicking element with selector: {selector}")
        # Check if element exists
        element = await page.query_selector(selector)
        if not element:
            return {"clicked": False, "message": f"No element found for selector: {selector}"}
        
        # Check if element is visible
        is_visible = await element.is_visible()
        if not is_visible:
            return {"clicked": False, "message": f"Element found but not visible: {selector}"}
        
        # Simuler un mouvement humain vers l'élément avant de cliquer
        box = await element.bounding_box()
        if box:
            # Coordonnées du centre de l'élément
            center_x = box["x"] + box["width"] / 2
            center_y = box["y"] + box["height"] / 2
            
            # Simuler un mouvement de souris vers l'élément
            current_pos = await page.evaluate("""() => { 
                return {x: window.mousePosX || 0, y: window.mousePosY || 0}; 
            }""")
            
            start_x = current_pos.get('x', 0)
            start_y = current_pos.get('y', 0)
            
            # Mouvement en plusieurs étapes avec courbe d'accélération
            steps = random.randint(10, 20)
            for step in range(1, steps + 1):
                progress = step / steps
                ease = 0.5 - 0.5 * math.cos(math.pi * progress)
                
                current_x = start_x + (center_x - start_x) * ease
                current_y = start_y + (center_y - start_y) * ease
                
                # Léger tremblement naturel
                current_x += random.randint(-2, 2)
                current_y += random.randint(-2, 2)
                
                await page.mouse.move(current_x, current_y)
                await asyncio.sleep(random.uniform(0.005, 0.015))
            
            # Petite pause avant le clic
            await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # Click the element
        await element.click()
        
        # Wait a bit for any navigation or page changes to stabilize
        await asyncio.sleep(random.uniform(0.7, 1.3))
        
        return {"clicked": True, "selector": selector}
    except Exception as e:
        ctx.error(f"Error clicking element with selector {selector}: {str(e)}")
        return {"clicked": False, "error": str(e)}

@mcp_host.tool()
async def type_in_element(selector: str, text: str, ctx: Context, submit: bool = False) -> Dict[str, Any]:
    """Type text into an element matched by the provided CSS selector
    
    Args:
        selector: CSS selector to find the element to type into
        text: Text to type into the element
        ctx: The MCP context
        submit: Whether to press Enter after typing (to submit forms)
    
    Returns:
        Information about the typing action
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Typing '{text}' into element with selector: {selector}")
        # Check if element exists
        element = await page.query_selector(selector)
        if not element:
            return {"typed": False, "message": f"No element found for selector: {selector}"}
        
        # Check if element is visible and editable
        is_visible = await element.is_visible()
        if not is_visible:
            return {"typed": False, "message": f"Element found but not visible: {selector}"}
        
        # D'abord cliquer sur l'élément (pour le focus)
        await click_element(selector, ctx)
        await asyncio.sleep(random.uniform(0.2, 0.5))
        
        # Effacer le contenu existant (si nécessaire)
        await element.fill("")
        await asyncio.sleep(random.uniform(0.1, 0.3))
        
        # Simuler une frappe humaine avec variations de vitesse
        for char in text:
            await element.press(char)
            # Variation de la vitesse de frappe
            await asyncio.sleep(random.uniform(0.05, 0.15))
        
        submitted = False
        if submit:
            ctx.info("Pressing Enter to submit")
            # Pause légère avant d'appuyer sur Entrée
            await asyncio.sleep(random.uniform(0.2, 0.5))
            await element.press("Enter")
            submitted = True
            # Attendre pour la réponse après soumission
            await asyncio.sleep(random.uniform(0.5, 1.5))
        
        return {"typed": True, "selector": selector, "text": text, "submitted": submitted}
    except Exception as e:
        ctx.error(f"Error typing into element with selector {selector}: {str(e)}")
        return {"typed": False, "error": str(e)}

@mcp_host.tool()
async def extract_text(selector: str, ctx: Context) -> Dict[str, Any]:
    """Extract text content from elements matching the provided CSS selector
    
    Args:
        selector: CSS selector to find the elements
        ctx: The MCP context
    
    Returns:
        Text content of all matched elements
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Extracting text from elements with selector: {selector}")
        # Get all elements matching the selector
        elements = await page.query_selector_all(selector)
        
        if not elements:
            return {"found": False, "message": f"No elements found for selector: {selector}"}
        
        # Extract text from each element
        texts = []
        for i, element in enumerate(elements):
            text = await element.evaluate("el => el.textContent")
            texts.append({"index": i, "text": text.strip() if text else ""})
        
        return {
            "found": True,
            "count": len(texts),
            "elements": texts
        }
    except Exception as e:
        ctx.error(f"Error extracting text with selector {selector}: {str(e)}")
        return {"error": f"Failed to extract text: {str(e)}"}

@mcp_host.tool()
async def wait_for_navigation(ctx: Context, timeout: int = 30000) -> Dict[str, Any]:
    """Wait for page navigation to complete
    
    Args:
        ctx: The MCP context
        timeout: Maximum time to wait in milliseconds
    
    Returns:
        Information about the navigation result
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Waiting for navigation to complete (timeout: {timeout}ms)")
        # Wait for the page to navigate and load
        await page.wait_for_load_state("networkidle", timeout=timeout)
        
        # Get current page information
        title = await page.title()
        url = page.url
        
        return {
            "navigated": True,
            "title": title,
            "url": url
        }
    except Exception as e:
        ctx.error(f"Error waiting for navigation: {str(e)}")
        return {"navigated": False, "error": str(e)}

@mcp_host.tool()
async def evaluate_javascript(script: str, ctx: Context) -> Dict[str, Any]:
    """Execute JavaScript code in the browser context
    
    Args:
        script: JavaScript code to execute
        ctx: The MCP context
    
    Returns:
        Result of the JavaScript execution
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info(f"Executing JavaScript: {script[:50]}...")
        # Execute the script in the browser context
        result = await page.evaluate(script)
        
        return {
            "executed": True,
            "result": result
        }
    except Exception as e:
        ctx.error(f"Error executing JavaScript: {str(e)}")
        return {"executed": False, "error": str(e)}

@mcp_host.tool()
async def bypass_cookie_consent(ctx: Context) -> Dict[str, Any]:
    """Tente de contourner automatiquement les bandeaux de consentement aux cookies
    
    Args:
        ctx: Le contexte MCP
    
    Returns:
        Informations sur la tentative de contournement
    """
    page: Page = ctx.request_context.lifespan_context.page
    try:
        ctx.info("Tentative de contournement des bandeaux de consentement aux cookies")
        
        # Liste des sélecteurs courants pour les boutons d'acceptation/fermeture
        consent_selectors = [
            # Boutons génériques
            'button[id*="accept"], button[class*="accept"]',
            'button[id*="agree"], button[class*="agree"]',
            'button[id*="consent"], button[class*="consent"]',
            'a[id*="accept"], a[class*="accept"]',
            
            # Boutons pour TikTok
            '.cookie-banner button',
            '.tiktok-cookie-banner button',
            '.accept-cookies-button',
            
            # Boutons génériques pour les bandeaux de cookies
            '.cookie-banner .accept, .cookie-banner .close',
            '.cookie-consent .accept, .cookie-consent .close',
            '.cookie-notice .accept, .cookie-notice .close',
            '.cookie-policy .accept, .cookie-policy .close',
            '.cookies-banner .accept, .cookies-banner .close',
            
            # Boutons spécifiques pour les popups courants
            '.fc-button-label',
            '.fc-consent-root button[aria-label*="Accepter"], .fc-consent-root button[aria-label*="Accept"]',
            '.gdpr-banner button, .gdpr button',
            '.consent-banner button',
            '.qc-cmp2-summary-buttons button',
            '#onetrust-accept-btn-handler',
            '#accept-all-cookies, #accept-cookies',
            '.js-accept-cookies',
            '.js-cookie-accept',
            
            # Boutons avec du texte
            'button:has-text("Accept"), button:has-text("Accepter")',
            'button:has-text("Agree"), button:has-text("I agree")',
            'button:has-text("Close"), button:has-text("Fermer")',
        ]
        
        # Essayer chaque sélecteur
        clicked = False
        for selector in consent_selectors:
            try:
                # Vérifier si le sélecteur existe
                element = await page.query_selector(selector)
                if element and await element.is_visible():
                    ctx.info(f"Bouton de consentement trouvé avec le sélecteur: {selector}")
                    await element.click()
                    clicked = True
                    await asyncio.sleep(1)  # Attendre que la popup disparaisse
                    break
            except Exception as e:
                # Continuer à essayer d'autres sélecteurs en cas d'erreur
                continue
        
        # Si aucun bouton n'a été trouvé, essayer une technique alternative
        if not clicked:
            # Technique alternative: simuler le stockage des cookies
            await page.evaluate("""() => {
                const setCookieConsent = () => {
                    const commonConsentCookies = [
                        'cookies_accepted=true',
                        'cookie_consent=true',
                        'gdpr_consent=true',
                        'cookie_consent_accepted=true',
                        'consent_accepted=true',
                    ];
                    
                    commonConsentCookies.forEach(cookie => {
                        document.cookie = `${cookie}; path=/; max-age=31536000;`;
                    });
                    
                    // Pour TikTok spécifiquement
                    if (window.location.href.includes('tiktok.com')) {
                        document.cookie = 'tt_cookie_consent=true; path=/; max-age=31536000;';
                        document.cookie = 'cookie_consent_accepted=true; path=/; max-age=31536000;';
                    }
                };
                
                setCookieConsent();
                
                // Tenter de supprimer les bandeaux par programmation
                const possibleBanners = [
                    '.cookie-banner',
                    '.cookie-notice',
                    '.cookie-policy',
                    '.gdpr-banner',
                    '.consent-banner',
                    '#cookieNotice',
                    '#cookie-banner',
                    '.fc-consent-root',
                    '#onetrust-banner-sdk',
                    '.qc-cmp2-container',
                ];
                
                possibleBanners.forEach(selector => {
                    const banner = document.querySelector(selector);
                    if (banner) {
                        banner.style.display = 'none';
                        banner.remove();
                    }
                });
            }""")
        
        return {
            "attempted": True,
            "button_clicked": clicked
        }
    except Exception as e:
        ctx.error(f"Erreur lors du contournement du consentement aux cookies: {str(e)}")
        return {"attempted": True, "error": str(e)}

# --- Existing Gemini & Traduction tools (unchanged) ---
@mcp_host.tool(
    name="translate_llm",
    description=(
        "Calls this translate_llm tool for requests explicitly asking "
        "for language translation or meaning clarification of non-English text."
    ),
)
async def call_translate(text: str, source_language: str, target_language: str) -> str:
    translated_result = translate_text(
        project_id=GOOGLE_PROJECT_ID,
        location=GOOGLE_LOCATION,
        source_language_code=source_language,
        target_language_code=target_language,
        source_text=text,
    )
    return translated_result or "\nTranslation failed."

# --- Main Execution Function (synchronous) ---
def main() -> None:
    if not GENAI_CLIENT:
        logging.error("Cannot start server: Gemini client not initialized.")
        return
    logging.info(f"Starting MCP server '{mcp_host.name}'")
    mcp_host.run()

if __name__ == "__main__":
    main()