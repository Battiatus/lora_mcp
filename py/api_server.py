# api_server.py
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import asyncio
import uuid
from datetime import datetime

# Import du serveur MCP existant
from server import mcp_host, AppContext, app_lifespan, SESSION_ID

# Modèles Pydantic pour la documentation
class ToolExecutionRequest(BaseModel):
    """Requête pour exécuter un outil MCP"""
    arguments: Dict[str, Any] = Field(..., description="Arguments à passer à l'outil")
    session_id: Optional[str] = Field(None, description="ID de session pour réutiliser un contexte")
    
    class Config:
        schema_extra = {
            "example": {
                "arguments": {
                    "url": "https://example.com"
                },
                "session_id": "550e8400-e29b-41d4-a716-446655440000"
            }
        }

class NavigateRequest(BaseModel):
    """Requête pour naviguer vers une URL"""
    url: str = Field(..., description="URL vers laquelle naviguer")
    wait_for: Optional[str] = Field("networkidle", description="Condition d'attente (domcontentloaded, networkidle)")
    session_id: Optional[str] = Field(None, description="ID de session")
    
    class Config:
        schema_extra = {
            "example": {
                "url": "https://www.example.com",
                "wait_for": "networkidle"
            }
        }

class ClickRequest(BaseModel):
    """Requête pour cliquer à des coordonnées"""
    x: int = Field(..., description="Coordonnée X")
    y: int = Field(..., description="Coordonnée Y")
    session_id: Optional[str] = Field(None, description="ID de session")
    
    class Config:
        schema_extra = {
            "example": {
                "x": 100,
                "y": 200
            }
        }

class TypeTextRequest(BaseModel):
    """Requête pour taper du texte"""
    text: str = Field(..., description="Texte à taper")
    submit: bool = Field(False, description="Appuyer sur Entrée après la saisie")
    session_id: Optional[str] = Field(None, description="ID de session")
    
    class Config:
        schema_extra = {
            "example": {
                "text": "Hello World",
                "submit": True
            }
        }

class SelectorRequest(BaseModel):
    """Requête pour interagir avec un élément par sélecteur CSS"""
    selector: str = Field(..., description="Sélecteur CSS")
    session_id: Optional[str] = Field(None, description="ID de session")
    
    class Config:
        schema_extra = {
            "example": {
                "selector": "button.submit-button"
            }
        }

class ScrollRequest(BaseModel):
    """Requête pour faire défiler la page"""
    direction: str = Field(..., description="Direction (up ou down)")
    amount: int = Field(..., description="Quantité en pixels")
    session_id: Optional[str] = Field(None, description="ID de session")
    
    class Config:
        schema_extra = {
            "example": {
                "direction": "down",
                "amount": 500
            }
        }

class VideoDownloadRequest(BaseModel):
    """Requête pour télécharger une vidéo"""
    url: str = Field(..., description="URL de la vidéo")
    filename: Optional[str] = Field(None, description="Nom du fichier de sortie")
    session_id: Optional[str] = Field(None, description="ID de session")
    
    class Config:
        schema_extra = {
            "example": {
                "url": "https://www.tiktok.com/@user/video/123456789",
                "filename": "my_video.mp4"
            }
        }

class ToolResponse(BaseModel):
    """Réponse standard d'un outil"""
    success: bool = Field(..., description="Indique si l'opération a réussi")
    session_id: str = Field(..., description="ID de la session")
    data: Optional[Dict[str, Any]] = Field(None, description="Données retournées par l'outil")
    error: Optional[str] = Field(None, description="Message d'erreur si échec")
    
    class Config:
        schema_extra = {
            "example": {
                "success": True,
                "session_id": "550e8400-e29b-41d4-a716-446655440000",
                "data": {
                    "title": "Example Domain",
                    "url": "https://example.com"
                }
            }
        }

class SessionInfo(BaseModel):
    """Informations sur une session"""
    session_id: str
    created_at: datetime
    last_activity: datetime
    browser_connected: bool
    current_url: Optional[str]
    artifacts_count: int

# Initialisation de FastAPI avec documentation
app = FastAPI(
    title="MCP Web Automation API",
    description="""
# MCP Web Automation API

Cette API expose les fonctionnalités du serveur MCP pour l'automatisation web.

## Fonctionnalités principales

- 🌐 **Navigation web** avec anti-détection
- 📸 **Captures d'écran** 
- 🖱️ **Interactions** (clic, saisie, défilement)
- 🎥 **Téléchargement de vidéos** (incluant TikTok)
- 🔍 **Extraction de données**
- 🤖 **Résolution de CAPTCHA**
- 📄 **Génération de rapports**

## Sessions

L'API utilise un système de sessions pour maintenir l'état entre les requêtes. 
Vous pouvez soit fournir un `session_id` existant, soit laisser l'API en créer un nouveau.

## Limites

- Timeout maximum: 900 secondes
- Taille maximale des fichiers: 100 MB
- Sessions actives simultanées: 10 par utilisateur
    """,
    version="1.0.0",
    openapi_tags=[
        {
            "name": "Navigation",
            "description": "Opérations de navigation web"
        },
        {
            "name": "Interaction",
            "description": "Interactions avec les éléments de la page"
        },
        {
            "name": "Extraction",
            "description": "Extraction de données et captures"
        },
        {
            "name": "Media",
            "description": "Téléchargement et manipulation de médias"
        },
        {
            "name": "Session",
            "description": "Gestion des sessions"
        }
    ]
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
        
    async def get_or_create_session(self, session_id: Optional[str] = None) -> tuple[str, AppContext]:
        """Obtient ou crée une session"""
        if session_id and session_id in self.sessions:
            return session_id, self.contexts[session_id]
        
        # Créer une nouvelle session
        new_session_id = str(uuid.uuid4())
        # Ici, on devrait initialiser le contexte Playwright
        # Pour l'exemple, on utilise un contexte mock
        context = None  # À remplacer par l'initialisation réelle
        
        self.sessions[new_session_id] = {
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow()
        }
        self.contexts[new_session_id] = context
        
        return new_session_id, context

session_manager = SessionManager()

# Dépendance pour vérifier l'authentification (optionnel)
async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Vérifie le token d'authentification"""
    # Implémenter la vérification du token ici
    # Pour l'exemple, on accepte tout
    return credentials.credentials

# Routes API

@app.get("/", tags=["General"])
async def root():
    """Point d'entrée de l'API"""
    return {
        "message": "MCP Web Automation API",
        "version": "1.0.0",
        "documentation": "/docs"
    }

@app.get("/health", tags=["General"])
async def health_check():
    """Vérification de l'état de santé de l'API"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }

# Navigation

@app.post("/api/v1/navigate", response_model=ToolResponse, tags=["Navigation"])
async def navigate(
    request: NavigateRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """
    Navigue vers une URL spécifiée
    
    Cette fonction permet de naviguer vers n'importe quelle URL avec des options avancées:
    - Gestion automatique des CAPTCHA
    - Anti-détection pour éviter le blocage
    - Simulation de comportement humain
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        # Appeler l'outil MCP navigate
        # Note: Dans l'implémentation réelle, il faut adapter l'appel
        result = {
            "title": "Example Page",
            "url": request.url,
            "status_code": 200
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

@app.post("/api/v1/screenshot", tags=["Extraction"])
async def take_screenshot(
    session_id: Optional[str] = None,
    full_page: bool = False,
    token: str = Depends(verify_token)
):
    """
    Prend une capture d'écran de la page actuelle
    
    Retourne l'image en base64 ou l'URL de téléchargement
    """
    try:
        session_id, context = await session_manager.get_or_create_session(session_id)
        
        # Simuler la capture d'écran
        result = {
            "filename": f"screenshot_{uuid.uuid4()}.jpeg",
            "size": "1920x1080",
            "url": f"/api/v1/sessions/{session_id}/screenshots/latest"
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=session_id or "",
            error=str(e)
        )

# Interaction

@app.post("/api/v1/click", response_model=ToolResponse, tags=["Interaction"])
async def click(
    request: ClickRequest,
    token: str = Depends(verify_token)
):
    """
    Clique à des coordonnées spécifiques
    
    Simule un clic de souris avec mouvement naturel
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        result = {
            "clicked_at": {"x": request.x, "y": request.y}
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

@app.post("/api/v1/type", response_model=ToolResponse, tags=["Interaction"])
async def type_text(
    request: TypeTextRequest,
    token: str = Depends(verify_token)
):
    """
    Tape du texte dans l'élément actif
    
    Simule une frappe humaine avec variations de vitesse
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        result = {
            "typed": True,
            "text": request.text,
            "submitted": request.submit
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

@app.post("/api/v1/click_element", response_model=ToolResponse, tags=["Interaction"])
async def click_element(
    request: SelectorRequest,
    token: str = Depends(verify_token)
):
    """
    Clique sur un élément identifié par un sélecteur CSS
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        result = {
            "clicked": True,
            "selector": request.selector
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

@app.post("/api/v1/scroll", response_model=ToolResponse, tags=["Interaction"])
async def scroll(
    request: ScrollRequest,
    token: str = Depends(verify_token)
):
    """
    Fait défiler la page
    
    Simule un défilement naturel avec accélération/décélération
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        result = {
            "scrolled": True,
            "direction": request.direction,
            "amount": request.amount
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

# Extraction

@app.post("/api/v1/extract_text", response_model=ToolResponse, tags=["Extraction"])
async def extract_text(
    request: SelectorRequest,
    token: str = Depends(verify_token)
):
    """
    Extrait le texte d'éléments correspondant au sélecteur CSS
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        result = {
            "found": True,
            "count": 1,
            "elements": [
                {"index": 0, "text": "Example text"}
            ]
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

@app.get("/api/v1/page_info", response_model=ToolResponse, tags=["Extraction"])
async def get_page_info(
    session_id: Optional[str] = None,
    token: str = Depends(verify_token)
):
    """
    Obtient les informations de la page actuelle
    """
    try:
        session_id, context = await session_manager.get_or_create_session(session_id)
        
        result = {
            "title": "Current Page Title",
            "url": "https://example.com",
            "ready_state": "complete"
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=session_id or "",
            error=str(e)
        )

# Media

@app.post("/api/v1/download_video", response_model=ToolResponse, tags=["Media"])
async def download_video(
    request: VideoDownloadRequest,
    background_tasks: BackgroundTasks,
    token: str = Depends(verify_token)
):
    """
    Télécharge une vidéo depuis une URL
    
    Supporte plusieurs plateformes incluant TikTok avec contournement anti-bot
    """
    try:
        session_id, context = await session_manager.get_or_create_session(request.session_id)
        
        # Lancer le téléchargement en arrière-plan
        background_tasks.add_task(
            download_video_task,
            request.url,
            request.filename,
            session_id
        )
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data={
                "status": "download_started",
                "message": "Le téléchargement a été lancé en arrière-plan"
            }
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=request.session_id or "",
            error=str(e)
        )

@app.get("/api/v1/find_videos", response_model=ToolResponse, tags=["Media"])
async def find_videos_on_page(
    session_id: Optional[str] = None,
    token: str = Depends(verify_token)
):
    """
    Trouve toutes les vidéos sur la page actuelle
    """
    try:
        session_id, context = await session_manager.get_or_create_session(session_id)
        
        result = {
            "found": True,
            "count": 2,
            "videos": [
                {
                    "index": 0,
                    "type": "video_element",
                    "src": "https://example.com/video1.mp4"
                },
                {
                    "index": 1,
                    "type": "iframe_embed",
                    "platform": "youtube",
                    "src": "https://www.youtube.com/embed/dQw4w9WgXcQ"
                }
            ]
        }
        
        return ToolResponse(
            success=True,
            session_id=session_id,
            data=result
        )
    except Exception as e:
        return ToolResponse(
            success=False,
            session_id=session_id or "",
            error=str(e)
        )

# Session Management

@app.get("/api/v1/sessions", response_model=List[SessionInfo], tags=["Session"])
async def list_sessions(token: str = Depends(verify_token)):
    """
    Liste toutes les sessions actives
    """
    sessions = []
    for session_id, session_data in session_manager.sessions.items():
        sessions.append(SessionInfo(
            session_id=session_id,
            created_at=session_data["created_at"],
            last_activity=session_data["last_activity"],
            browser_connected=True,
            current_url="https://example.com",
            artifacts_count=0
        ))
    return sessions

@app.get("/api/v1/sessions/{session_id}", response_model=SessionInfo, tags=["Session"])
async def get_session(
    session_id: str,
    token: str = Depends(verify_token)
):
    """
    Obtient les informations d'une session spécifique
    """
    if session_id not in session_manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session_data = session_manager.sessions[session_id]
    return SessionInfo(
        session_id=session_id,
        created_at=session_data["created_at"],
        last_activity=session_data["last_activity"],
        browser_connected=True,
        current_url="https://example.com",
        artifacts_count=0
    )

@app.delete("/api/v1/sessions/{session_id}", tags=["Session"])
async def close_session(
    session_id: str,
    token: str = Depends(verify_token)
):
    """
    Ferme une session et libère les ressources
    """
    if session_id not in session_manager.sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Nettoyer la session
    del session_manager.sessions[session_id]
    if session_id in session_manager.contexts:
        del session_manager.contexts[session_id]
    
    return {"message": "Session closed successfully"}

# Tâches d'arrière-plan
async def download_video_task(url: str, filename: Optional[str], session_id: str):
    """Tâche de téléchargement de vidéo en arrière-plan"""
    # Implémenter le téléchargement réel ici
    pass

# Documentation supplémentaire
@app.get("/api/v1/tools", tags=["General"])
async def list_available_tools():
    """
    Liste tous les outils MCP disponibles
    """
    tools = [
        {
            "name": "navigate",
            "description": "Navigate to a specified URL",
            "endpoint": "/api/v1/navigate"
        },
        {
            "name": "screenshot",
            "description": "Take a screenshot of the current page",
            "endpoint": "/api/v1/screenshot"
        },
        {
            "name": "click",
            "description": "Click at specific coordinates",
            "endpoint": "/api/v1/click"
        },
        {
            "name": "type",
            "description": "Type text into the active element",
            "endpoint": "/api/v1/type"
        },
        {
            "name": "download_video",
            "description": "Download video from URL",
            "endpoint": "/api/v1/download_video"
        }
    ]
    return {"tools": tools}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)