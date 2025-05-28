import asyncio
import json
import logging
import os
import sys
import uuid
from typing import Dict, Any, Optional, List
import traceback
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import uvicorn
import httpx

# Google Cloud imports
from google.cloud import logging as cloud_logging
from google.cloud import firestore
from google.oauth2 import service_account
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Configure Google Cloud Logging
def setup_gcp_logging():
    """Setup Google Cloud Logging"""
    try:
        # Initialize Google Cloud Logging
        client = cloud_logging.Client()
        client.setup_logging()
        
        # Create custom logger
        logger = logging.getLogger("mcp_client")
        logger.setLevel(logging.INFO)
        
        return logger
    except Exception as e:
        # Fallback to standard logging
        logging.basicConfig(level=logging.INFO)
        logger = logging.getLogger("mcp_client")
        logger.warning(f"Failed to setup GCP logging: {e}")
        return logger

logger = setup_gcp_logging()

# Initialize Firebase for client
def initialize_firebase_client():
    """Initialize Firebase for client-side authentication"""
    try:
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
        else:
            cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
            else:
                cred = credentials.ApplicationDefault()
        
        firebase_admin.initialize_app(cred, name="client_app")
        logger.info("Firebase initialized for client")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Firebase for client: {e}")
        return False

# Initialize Firestore for logging
def initialize_firestore():
    """Initialize Firestore for client logging"""
    try:
        db = firestore.Client()
        logger.info("Firestore initialized for client logging")
        return db
    except Exception as e:
        logger.error(f"Failed to initialize Firestore: {e}")
        return None

# Pydantic models
class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None

class UserSession(BaseModel):
    session_id: str
    user_id: str
    email: str
    created_at: datetime
    last_activity: datetime

# Security middleware for client
class ClientSecurityMiddleware:
    def __init__(self, firestore_db):
        self.db = firestore_db
        self.blocked_ips = set()
        self.request_counts = {}
        
    async def __call__(self, request: Request, call_next):
        start_time = datetime.utcnow()
        client_ip = self.get_client_ip(request)
        
        try:
            # Check if IP is blocked
            if client_ip in self.blocked_ips:
                await self.log_security_event("blocked_ip_access", {
                    "ip": client_ip,
                    "url": str(request.url),
                    "user_agent": request.headers.get("user-agent", "")
                })
                raise HTTPException(status_code=403, detail="Access denied")
            
            # Rate limiting check
            await self.check_rate_limit(client_ip)
            
            # Process request
            response = await call_next(request)
            
            # Log request
            await self.log_request(request, response, start_time)
            
            return response
            
        except Exception as e:
            await self.log_security_event("request_error", {
                "ip": client_ip,
                "error": str(e),
                "url": str(request.url)
            })
            raise
    
    def get_client_ip(self, request: Request) -> str:
        """Get real client IP"""
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
    
    async def check_rate_limit(self, ip: str):
        """Check rate limiting"""
        now = datetime.utcnow()
        minute_key = f"{ip}_{now.strftime('%Y%m%d%H%M')}"
        
        if minute_key not in self.request_counts:
            self.request_counts[minute_key] = 0
        
        self.request_counts[minute_key] += 1
        
        if self.request_counts[minute_key] > 100:  # 100 requests per minute
            self.blocked_ips.add(ip)
            await self.log_security_event("rate_limit_exceeded", {
                "ip": ip,
                "requests": self.request_counts[minute_key]
            })
            raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    async def log_request(self, request: Request, response, start_time: datetime):
        """Log request to Firestore"""
        if not self.db:
            return
            
        try:
            log_data = {
                "timestamp": start_time,
                "method": request.method,
                "url": str(request.url),
                "status_code": response.status_code,
                "client_ip": self.get_client_ip(request),
                "user_agent": request.headers.get("user-agent", ""),
                "processing_time": (datetime.utcnow() - start_time).total_seconds(),
                "service": "mcp_client"
            }
            
            self.db.collection("client_request_logs").add(log_data)
        except Exception as e:
            logger.error(f"Failed to log request: {e}")
    
    async def log_security_event(self, event_type: str, details: Dict[str, Any]):
        """Log security events to Firestore"""
        if not self.db:
            return
            
        try:
            log_data = {
                "timestamp": datetime.utcnow(),
                "event_type": event_type,
                "details": details,
                "service": "mcp_client",
                "severity": "WARNING"
            }
            
            self.db.collection("client_security_logs").add(log_data)
            logger.warning(f"Security event: {event_type} - {details}")
        except Exception as e:
            logger.error(f"Failed to log security event: {e}")

# MCP Server client
class MCPServerClient:
    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip('/')
        self.access_token = None
        self.session_id = None
        
    async def authenticate(self, firebase_token: str) -> Dict[str, Any]:
        """Authenticate with MCP server"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.server_url}/auth/login",
                json={"id_token": firebase_token}
            )
            response.raise_for_status()
            
            auth_data = response.json()
            self.access_token = auth_data["access_token"]
            return auth_data
    
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute tool on MCP server"""
        if not self.access_token:
            raise ValueError("Not authenticated")
            
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{self.server_url}/tools/execute",
                json={
                    "tool_name": tool_name,
                    "arguments": arguments,
                    "session_id": self.session_id
                },
                headers=headers
            )
            response.raise_for_status()
            return response.json()
    
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools"""
        if not self.access_token:
            raise ValueError("Not authenticated")
            
        headers = {"Authorization": f"Bearer {self.access_token}"}
        
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.server_url}/tools", headers=headers)
            response.raise_for_status()
            return response.json()

# Initialize components
firebase_initialized = initialize_firebase_client()
firestore_db = initialize_firestore()

# Create FastAPI app
app = FastAPI(
    title="Secure MCP Client",
    description="Secure web interface for MCP automation with SSO authentication",
    version="2.0.0"
)

# Add security middleware
security_middleware = ClientSecurityMiddleware(firestore_db)
app.middleware("http")(security_middleware)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global MCP client
mcp_client = MCPServerClient(os.getenv("MCP_SERVER_URL", "http://localhost:8083"))

@app.get("/", response_class=HTMLResponse)
async def get_interface():
    """Serve the secure interface"""
    return FileResponse("static/secure_interface.html")

@app.post("/auth/firebase")
async def authenticate_firebase(request: Request):
    """Authenticate with Firebase and MCP server"""
    try:
        data = await request.json()
        firebase_token = data.get("firebase_token")
        
        if not firebase_token:
            raise HTTPException(status_code=400, detail="Firebase token required")
        
        # Verify Firebase token
        try:
            decoded_token = firebase_auth.verify_id_token(firebase_token, app=firebase_admin.get_app("client_app"))
        except Exception as e:
            logger.error(f"Firebase token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid Firebase token")
        
        # Authenticate with MCP server
        auth_data = await mcp_client.authenticate(firebase_token)
        
        # Create session
        session_id = str(uuid.uuid4())
        mcp_client.session_id = session_id
        
        # Log authentication
        if firestore_db:
            try:
                firestore_db.collection("client_auth_logs").add({
                    "timestamp": datetime.utcnow(),
                    "user_id": decoded_token["uid"],
                    "email": decoded_token.get("email"),
                    "session_id": session_id,
                    "success": True,
                    "client_ip": security_middleware.get_client_ip(request)
                })
            except Exception as e:
                logger.error(f"Failed to log authentication: {e}")
        
        logger.info(f"User authenticated: {decoded_token.get('email')} - Session: {session_id}")
        
        return {
            "success": True,
            "session_id": session_id,
            "user": {
                "uid": decoded_token["uid"],
                "email": decoded_token.get("email"),
                "name": decoded_token.get("name")
            },
            "mcp_auth": auth_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")

@app.get("/tools")
async def get_tools():
    """Get available tools from MCP server"""
    try:
        tools = await mcp_client.list_tools()
        return {"tools": tools}
    except Exception as e:
        logger.error(f"Error getting tools: {e}")
        raise HTTPException(status_code=500, detail="Failed to get tools")

@app.post("/chat")
async def chat(message: ChatMessage, request: Request):
    """Handle chat messages"""
    try:
        # Log chat interaction
        if firestore_db:
            try:
                firestore_db.collection("client_chat_logs").add({
                    "timestamp": datetime.utcnow(),
                    "session_id": message.session_id,
                    "message": message.message,
                    "client_ip": security_middleware.get_client_ip(request)
                })
            except Exception as e:
                logger.error(f"Failed to log chat: {e}")
        
        # Process message (implement your chat logic here)
        # This would integrate with your existing intelligent processing
        
        return {
            "response": "Chat functionality would be implemented here",
            "session_id": message.session_id
        }
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail="Chat processing failed")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
async def health_check():
    """Health check"""
    return {
        "status": "healthy",
        "service": "secure-mcp-client",
        "version": "2.0.0",
        "firebase_status": "connected" if firebase_initialized else "disconnected",
        "firestore_status": "connected" if firestore_db else "disconnected"
    }

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    uvicorn.run(app, host="0.0.0.0", port=port)