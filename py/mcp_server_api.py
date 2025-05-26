"""
MCP Server exposé en tant qu'API REST avec documentation Swagger automatique
"""

from fastapi import FastAPI, HTTPException, Depends, Security, BackgroundTasks, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timedelta
import asyncio
import uuid
import json
import base64
from enum import Enum

# Import du serveur MCP existant
from server import mcp_host, app_lifespan, AppContext, SESSION_ID

# Modèles Pydantic pour la validation des données
class ToolName(str, Enum):
    """Énumération des outils disponibles"""
    NAVIGATE = "navigate"
    SCREENSHOT = "screenshot"
    CLICK = "click"
    SCROLL = "scroll"
    TYPE = "type"
    GET_PAGE_INFO = "get_page_info"
    GET_ELEMENT_BY_SELECTOR = "get_element_by_selector"
    CLICK_ELEMENT = "click_element"
    TYPE_IN_ELEMENT = "type_in_element"
    EXTRACT_TEXT = "extract_text"
    WAIT_FOR_NAVIGATION = "wait_for_navigation"
    EVALUATE_JAVASCRIPT = "evaluate_javascript"
    BYPASS_COOKIE_CONSENT = "bypass_cookie_consent"
    FIND_VIDEOS_ON_PAGE = "find_videos_on_page"
    DOWNLOAD_VIDEO = "download_video"
    DOWNLOAD_PAGE_VIDEO = "download_page_video"
    DETECT_AND_SOLVE_CAPTCHA = "detect_and_solve_captcha"
    NAVIGATE_TIKTOK = "navigate_tiktok"
    WRITE_FILE = "write_file"
    TRANSLATE_LLM = "translate_llm"

class NavigateRequest(BaseModel):
    """Paramètres pour naviguer vers une URL"""
    url: HttpUrl = Field(..., description="URL vers laquelle naviguer", example="https://example.com")
    session_id: Optional[str] = Field(None, description="ID de session pour réutiliser un contexte")
    
    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://www.example.com",
                "session_id": "optional-session-id"
            }
        }

class ClickRequest(BaseModel):
    """Paramètres pour cliquer à des coordonnées spécifiques"""
    x: int = Field(..., description="Coordonnée X du clic", ge=0)
    y: int = Field(..., description="Coordonnée Y du clic", ge=0)
    session_id: str = Field(..., description="ID de session requis")
    
    class Config:
        json_schema_extra = {
            "example": {
                "x": 100,
                "y": 200,
                "session_id": "session-123"
            }
        }

class ScrollRequest(BaseModel):
    """Paramètres pour faire défiler la page"""
    direction: str = Field(..., description="Direction du défilement", pattern="^(up|down)$")
    amount: int = Field(..., description="Quantité de défilement en pixels", ge=0)
    session_id: str = Field(..., description="ID de session requis")

class TypeRequest(BaseModel):
    """Paramètres pour taper du texte"""
    text: str = Field(..., description="Texte à saisir")
    submit: bool = Field(False, description="Appuyer sur Entrée après la saisie")
    session_id: str = Field(..., description="ID de session requis")

class ElementSelectorRequest(BaseModel):
    """Paramètres pour interagir avec un élément via sélecteur CSS"""
    selector: str = Field(..., description="Sélecteur CSS de l'élément", example="button.submit")
    session_id: str = Field(..., description="ID de session requis")

class TypeInElementRequest(BaseModel):
    """Paramètres pour taper dans un élément spécifique"""
    selector: str = Field(..., description="Sélecteur CSS de l'élément")
    text: str = Field(..., description="Texte à saisir")
    submit: bool = Field(False, description="Appuyer sur Entrée après la saisie")
    session_id: str = Field(..., description="ID de session requis")

class JavaScriptRequest(BaseModel):
    """Paramètres pour exécuter du JavaScript"""
    script: str = Field(..., description="Code JavaScript à exécuter")
    session_id: str = Field(..., description="ID de session requis")

class VideoDownloadRequest(BaseModel):
    """Paramètres pour télécharger une vidéo"""
    url: HttpUrl = Field(..., description="URL de la vidéo à télécharger")
    filename: Optional[str] = Field(None, description="Nom de fichier personnalisé")
    session_id: str = Field(..., description="ID de session requis")

class PageVideoDownloadRequest(BaseModel):
    """Paramètres pour télécharger une vidéo de la page"""
    index: int = Field(..., description="Index de la vidéo sur la page", ge=0)
    filename: Optional[str] = Field(None, description="Nom de fichier personnalisé")
    session_id: str = Field(..., description="ID de session requis")

class WriteFileRequest(BaseModel):
    """Paramètres pour écrire un fichier"""
    filename: str = Field(..., description="Nom du fichier à créer")
    content: str = Field(..., description="Contenu du fichier")
    session_id: str = Field(..., description="ID de session requis")

class TranslateRequest(BaseModel):
    """Paramètres pour traduire du texte"""
    text: str = Field(..., description="Texte à traduire")
    source_language: str = Field(..., description="Code de langue source", example="en")
    target_language: str = Field(..., description="Code de langue cible", example="fr")

class SessionResponse(BaseModel):
    """Réponse contenant les informations de session"""
    session_id: str
    created_at: datetime
    status: str = "active"

class ToolResponse(BaseModel):
    """Réponse générique pour les outils"""
    success: bool
    session_id: str
    result: Dict[str, Any]
    error: Optional[str] = None

class ScreenshotResponse(BaseModel):
    """Réponse pour une capture d'écran"""
    success: bool
    session_id: str
    filename: str
    image_base64: str
    format: str = "jpeg"

# Initialisation de l'API FastAPI
app = FastAPI(
    title="MCP Server API",
    description="""
    API REST pour le serveur MCP (Model Context Protocol) avec automatisation web via Playwright.
    
    ## Fonctionnalités principales
    
    * 🌐 **Navigation web** - Navigation automatisée avec anti-détection
    * 📸 **Captures d'écran** - Capture de pages web
    * 🖱️ **Interactions** - Clic, saisie de texte, défilement
    * 🎬 **Téléchargement vidéo** - Support YouTube, TikTok, etc.
    * 🔍 **Extraction de données** - Sélecteurs CSS, JavaScript
    * 🤖 **Résolution CAPTCHA** - Détection et résolution automatique
    * 🌍 **Traduction** - Via Google Translate API
    
    ## Authentification
    
    Utiliser un token Bearer dans l'en-tête Authorization.
    
    ## Sessions
    
    La plupart des opérations nécessitent une session active. Créer une session avec `/sessions` avant d'utiliser les outils.
    """,
    version="1.0.0",
    terms_of_service="https://example.com/terms/",
    contact={
        "name": "MCP Server Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
)

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # À restreindre en production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sécurité
security = HTTPBearer()

# Gestionnaire de sessions
class SessionManager:
    def __init__(self):
        self.sessions = {}
        self.contexts = {}
    
    async def create_session(self) -> str:
        """Crée une nouvelle session"""
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            "id": session_id,
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow(),
            "status": "active"
        }
        # Initialiser le contexte Playwright pour cette session
        # (À implémenter avec la logique du serveur MCP)
        return session_id
    
    def get_session(self, session_id: str) -> Optional[dict]:
        """Récupère une session existante"""
        return self.sessions.get(session_id)
    
    def update_activity(self, session_id: str):
        """Met à jour l'activité de la session"""
        if session_id in self.sessions:
            self.sessions[session_id]["last_activity"] = datetime.utcnow()

session_manager = SessionManager()

# Fonction de vérification du token
async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)):
    """Vérifie le token d'authentification"""
    token = credentials.credentials
    # Implémenter la vérification du token ici
    # Pour l'exemple, on accepte tout token non vide
    if not token:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    return token

# Routes de santé
@app.get("/", tags=["Health"])
async def root():
    """Point de terminaison racine"""
    return {
        "message": "MCP Server API",
        "version": "1.0.0",
        "documentation": "/docs",
        "openapi": "/openapi.json"
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Vérification de l'état de santé du service"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "mcp-server-api"
    }

# Gestion des sessions
@app.post("/sessions", response_model=SessionResponse, tags=["Sessions"])
async def create_session(token: str = Depends(verify_token)):
    """
    Crée une nouvelle session de navigation.
    
    Une session est nécessaire pour utiliser la plupart des outils.
    La session maintient l'état du navigateur entre les appels.
    """
    session_id = await session_manager.create_session()
    return SessionResponse(
        session_id=session_id,
        created_at=datetime.utcnow(),
        status="active"
    )

@app.get("/sessions/{session_id}", response_model=SessionResponse, tags=["Sessions"])
async def get_session(session_id: str, token: str = Depends(verify_token)):
    """Récupère les informations d'une session"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse(**session)

@app.delete("/sessions/{session_id}", tags=["Sessions"])
async def close_session(session_id: str, token: str = Depends(verify_token)):
    """Ferme une session et libère les ressources"""
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Nettoyer les ressources de la session
    session["status"] = "closed"
    return {"message": "Session closed successfully"}

# Outils de navigation
@app.post("/tools/navigate", response_model=ToolResponse, tags=["Navigation"])
async def navigate(request: NavigateRequest, token: str = Depends(verify_token)):
    """
    Navigue vers une URL spécifiée.
    
    Supporte la détection et résolution automatique de CAPTCHA.
    Pour TikTok, utilise automatiquement des techniques anti-détection avancées.
    """
    session_id = request.session_id or await session_manager.create_session()
    session_manager.update_activity(session_id)
    
    # Simuler l'appel à l'outil MCP
    # Dans l'implémentation réelle, appeler l'outil navigate du serveur MCP
    result = {
        "title": "Example Domain",
        "url": str(request.url),
        "status_code": 200
    }
    
    return ToolResponse(
        success=True,
        session_id=session_id,
        result=result
    )

@app.post("/tools/screenshot", response_model=ScreenshotResponse, tags=["Navigation"])
async def take_screenshot(session_id: str, token: str = Depends(verify_token)):
    """
    Prend une capture d'écran de la page actuelle.
    
    Retourne l'image en base64.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(session_id)
    
    # Simuler la prise de screenshot
    # Dans l'implémentation réelle, appeler l'outil screenshot du serveur MCP
    fake_image = base64.b64encode(b"fake_image_data").decode()
    
    return ScreenshotResponse(
        success=True,
        session_id=session_id,
        filename=f"screenshot_{uuid.uuid4()}.jpeg",
        image_base64=fake_image
    )

@app.post("/tools/click", response_model=ToolResponse, tags=["Interaction"])
async def click(request: ClickRequest, token: str = Depends(verify_token)):
    """
    Clique aux coordonnées spécifiées.
    
    Simule un mouvement de souris naturel avant le clic.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    # Simuler le clic
    result = {
        "clicked_at": {"x": request.x, "y": request.y}
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/type", response_model=ToolResponse, tags=["Interaction"])
async def type_text(request: TypeRequest, token: str = Depends(verify_token)):
    """
    Tape du texte dans l'élément actuellement focalisé.
    
    Simule une vitesse de frappe humaine avec des variations.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    result = {
        "typed": True,
        "text": request.text,
        "submitted": request.submit
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/scroll", response_model=ToolResponse, tags=["Interaction"])
async def scroll(request: ScrollRequest, token: str = Depends(verify_token)):
    """Fait défiler la page dans la direction spécifiée"""
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    result = {
        "scrolled": True,
        "direction": request.direction,
        "amount": request.amount
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/element/find", response_model=ToolResponse, tags=["Elements"])
async def find_element(request: ElementSelectorRequest, token: str = Depends(verify_token)):
    """
    Trouve un élément sur la page en utilisant un sélecteur CSS.
    
    Retourne les informations sur l'élément incluant sa position et son contenu.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    # Simuler la recherche d'élément
    result = {
        "found": True,
        "tag": "BUTTON",
        "text": "Submit",
        "visible": True,
        "coordinates": {
            "x": 100,
            "y": 200,
            "width": 80,
            "height": 30,
            "center_x": 140,
            "center_y": 215
        }
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/element/click", response_model=ToolResponse, tags=["Elements"])
async def click_element(request: ElementSelectorRequest, token: str = Depends(verify_token)):
    """Clique sur un élément identifié par un sélecteur CSS"""
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    result = {
        "clicked": True,
        "selector": request.selector
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/element/type", response_model=ToolResponse, tags=["Elements"])
async def type_in_element(request: TypeInElementRequest, token: str = Depends(verify_token)):
    """Tape du texte dans un élément spécifique"""
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    result = {
        "typed": True,
        "selector": request.selector,
        "text": request.text,
        "submitted": request.submit
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/element/extract-text", response_model=ToolResponse, tags=["Elements"])
async def extract_text(request: ElementSelectorRequest, token: str = Depends(verify_token)):
    """
    Extrait le texte de tous les éléments correspondant au sélecteur CSS.
    
    Utile pour scraper du contenu de pages web.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    # Simuler l'extraction de texte
    result = {
        "found": True,
        "count": 3,
        "elements": [
            {"index": 0, "text": "Premier élément"},
            {"index": 1, "text": "Deuxième élément"},
            {"index": 2, "text": "Troisième élément"}
        ]
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/javascript", response_model=ToolResponse, tags=["Advanced"])
async def execute_javascript(request: JavaScriptRequest, token: str = Depends(verify_token)):
    """
    Exécute du code JavaScript dans le contexte du navigateur.
    
    ⚠️ Utiliser avec précaution - peut modifier l'état de la page.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    # Simuler l'exécution JavaScript
    result = {
        "executed": True,
        "result": "Script executed successfully"
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/video/find", response_model=ToolResponse, tags=["Video"])
async def find_videos(session_id: str, token: str = Depends(verify_token)):
    """
    Trouve toutes les vidéos présentes sur la page actuelle.
    
    Détecte les vidéos HTML5, iframes YouTube/Vimeo, et autres formats.
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(session_id)
    
    # Simuler la recherche de vidéos
    result = {
        "found": True,
        "count": 2,
        "videos": [
            {
                "index": 0,
                "type": "video_element",
                "src": "https://example.com/video1.mp4",
                "width": "640",
                "height": "360"
            },
            {
                "index": 1,
                "type": "iframe_embed",
                "platform": "youtube",
                "src": "https://www.youtube.com/embed/dQw4w9WgXcQ",
                "width": "560",
                "height": "315"
            }
        ]
    }
    
    return ToolResponse(
        success=True,
        session_id=session_id,
        result=result
    )

@app.post("/tools/video/download", response_model=ToolResponse, tags=["Video"])
async def download_video(request: VideoDownloadRequest, token: str = Depends(verify_token)):
    """
    Télécharge une vidéo depuis une URL.
    
    Supporte YouTube, TikTok, Vimeo, et autres plateformes via yt-dlp.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    # Simuler le téléchargement
    result = {
        "success": True,
        "file_path": f"videos/{request.session_id}/video.mp4",
        "file_size": 10485760,  # 10 MB
        "file_size_human": "10.00 MB",
        "method": "yt-dlp"
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

@app.post("/tools/captcha/detect", response_model=ToolResponse, tags=["CAPTCHA"])
async def detect_captcha(session_id: str, token: str = Depends(verify_token)):
    """
    Détecte et tente de résoudre automatiquement les CAPTCHA.
    
    Supporte reCAPTCHA, hCaptcha, et les puzzles coulissants (TikTok).
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(session_id)
    
    # Simuler la détection de CAPTCHA
    result = {
        "detected": True,
        "type": "recaptcha_v2",
        "solved": False,
        "message": "CAPTCHA detected, manual resolution required"
    }
    
    return ToolResponse(
        success=True,
        session_id=session_id,
        result=result
    )

@app.post("/tools/translate", response_model=ToolResponse, tags=["Translation"])
async def translate(request: TranslateRequest, token: str = Depends(verify_token)):
    """
    Traduit du texte entre différentes langues.
    
    Utilise Google Cloud Translation API.
    """
    # La traduction n'a pas besoin de session
    result = {
        "translated_text": f"[Traduction simulée de '{request.text}' de {request.source_language} vers {request.target_language}]",
        "source_language": request.source_language,
        "target_language": request.target_language
    }
    
    return ToolResponse(
        success=True,
        session_id="translation-no-session",
        result=result
    )

@app.post("/tools/file/write", response_model=ToolResponse, tags=["Files"])
async def write_file(request: WriteFileRequest, token: str = Depends(verify_token)):
    """
    Écrit du contenu dans un fichier.
    
    Les fichiers sont stockés dans le contexte de la session.
    """
    session = session_manager.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_manager.update_activity(request.session_id)
    
    # Simuler l'écriture du fichier
    result = {
        "success": True,
        "filename": request.filename,
        "path": f"artifacts/{request.session_id}/{request.filename}",
        "size": len(request.content)
    }
    
    return ToolResponse(
        success=True,
        session_id=request.session_id,
        result=result
    )

# Endpoint pour télécharger les fichiers générés
@app.get("/artifacts/{session_id}/{filename}", tags=["Files"])
async def download_artifact(session_id: str, filename: str, token: str = Depends(verify_token)):
    """Télécharge un fichier artifact généré"""
    # Simuler le téléchargement
    # Dans l'implémentation réelle, servir le fichier depuis le stockage
    content = f"Contenu simulé du fichier {filename}"
    return StreamingResponse(
        iter([content.encode()]),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

# Gestion des erreurs globales
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Gestionnaire d'exceptions HTTP personnalisé"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "status_code": exc.status_code,
            "timestamp": datetime.utcnow().isoformat()
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Gestionnaire d'exceptions générales"""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc),
            "timestamp": datetime.utcnow().isoformat()
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)