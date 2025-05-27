#!/usr/bin/env python
import os
import sys
import logging
import json
import uuid
import asyncio
import traceback
from typing import Dict, Any, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Import security components
from security.auth import (
    SecurityManager, get_current_user, require_permission, require_role,
    rate_limit_middleware, audit_logger, Permission, UserRole, initialize_firebase
)
from security.middleware import SecurityMiddleware, InputValidationMiddleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s [%(name)s] - %(message)s",
)

logger = logging.getLogger(__name__)

# Initialize Firebase
firebase_initialized = initialize_firebase()
if not firebase_initialized:
    logger.warning("Firebase not initialized - running in standalone mode")

# Pydantic models
class ToolRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    session_id: Optional[str] = None

class ToolResponse(BaseModel):
    success: bool
    result: Any
    error: Optional[str] = None

class AuthRequest(BaseModel):
    id_token: str

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: Dict[str, Any]

class RegisterRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = UserRole.USER

# Import existing components
try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    import nest_asyncio
    nest_asyncio.apply()
    logger.info("Dependencies imported successfully")
except ImportError as e:
    logger.error(f"Failed to import dependencies: {e}")
    sys.exit(1)

# Global context storage with user isolation
contexts: Dict[str, Dict[str, Any]] = {}  # {user_id: {session_id: context}}

class SimpleAppContext:
    def __init__(self, user_id: str, session_id: str):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.session_id = session_id
        self.user_id = user_id

async def get_or_create_context(session_id: str, user_id: str) -> SimpleAppContext:
    """Get or create a context for the user session"""
    if user_id not in contexts:
        contexts[user_id] = {}
    
    if session_id not in contexts[user_id]:
        logger.info(f"Creating new context for user {user_id}, session {session_id}")
        
        context = SimpleAppContext(user_id, session_id)
        
        # Initialize Playwright
        context.playwright = await async_playwright().start()
        
        # Launch browser with user-specific settings
        context.browser = await context.playwright.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--window-size=1920,1080'
            ]
        )
        
        # Create browser context
        context.context = await context.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # Create page
        context.page = await context.context.new_page()
        
        # Store context
        contexts[user_id][session_id] = context
        
        logger.info(f"Context created successfully for user {user_id}, session {session_id}")
        
    return contexts[user_id][session_id]

async def cleanup_context(session_id: str, user_id: str):
    """Cleanup a specific context"""
    if user_id in contexts and session_id in contexts[user_id]:
        context = contexts[user_id][session_id]
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
            logger.error(f"Error cleaning up context {session_id} for user {user_id}: {e}")
        finally:
            del contexts[user_id][session_id]
            if not contexts[user_id]:  # Remove user entry if no sessions
                del contexts[user_id]
            logger.info(f"Context {session_id} cleaned up for user {user_id}")

# Mock context class for tool functions
class MockContext:
    def __init__(self, app_context: SimpleAppContext):
        self.app_context = app_context
        
    def info(self, message: str):
        logger.info(f"[{self.app_context.user_id}:{self.app_context.session_id}] {message}")
        
    def error(self, message: str):
        logger.error(f"[{self.app_context.user_id}:{self.app_context.session_id}] {message}")
        
    def warning(self, message: str):
        logger.warning(f"[{self.app_context.user_id}:{self.app_context.session_id}] {message}")

# Secure tool implementations
async def navigate_tool(url: str, ctx: MockContext, current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Navigate to a specified URL"""
    try:
        page = ctx.app_context.page
        ctx.info(f"User {current_user['email']} navigating to: {url}")
        
        # Log action for audit
        await audit_logger.log_action(
            current_user["uid"], 
            "navigate", 
            {"url": url, "success": True}
        )
        
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
        await audit_logger.log_action(
            current_user["uid"], 
            "navigate", 
            {"url": url, "success": False, "error": str(e)}
        )
        return {"error": f"Failed to navigate to {url}: {str(e)}"}

async def screenshot_tool(ctx: MockContext, current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Take a screenshot of the current page"""
    try:
        page = ctx.app_context.page
        session_id = ctx.app_context.session_id
        user_id = ctx.app_context.user_id
        
        # Create user-specific screenshot directory
        os.makedirs(f"screenshot/{user_id}/{session_id}", exist_ok=True)
        
        filename = f"screenshot/{user_id}/{session_id}/screenshot_{uuid.uuid4()}.png"
        await page.screenshot(path=filename, full_page=True)
        
        ctx.info(f"Screenshot saved: {filename}")
        
        # Log action
        await audit_logger.log_action(
            current_user["uid"], 
            "screenshot", 
            {"filename": filename, "success": True}
        )
        
        return {"filename": filename, "path": filename}
    except Exception as e:
        ctx.error(f"Error taking screenshot: {str(e)}")
        await audit_logger.log_action(
            current_user["uid"], 
            "screenshot", 
            {"success": False, "error": str(e)}
        )
        return {"error": f"Failed to take screenshot: {str(e)}"}

# Additional secure tool implementations...
async def write_file_tool(filename: str, content: str, ctx: MockContext, current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Write content to a file with user isolation"""
    try:
        session_id = ctx.app_context.session_id
        user_id = ctx.app_context.user_id
        
        # Create user-specific directory
        os.makedirs(f"artefacts/{user_id}/{session_id}", exist_ok=True)
        
        # Sanitize filename
        safe_filename = "".join(c for c in filename if c.isalnum() or c in "._-")
        full_path = f"artefacts/{user_id}/{session_id}/{safe_filename}"
        
        ctx.info(f"Writing to file: {full_path}")
        
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
        
        # Log action
        await audit_logger.log_action(
            current_user["uid"], 
            "write_file", 
            {"filename": safe_filename, "size": len(content), "success": True}
        )
            
        return {"filename": safe_filename, "path": full_path, "written": True}
    except Exception as e:
        ctx.error(f"Error writing file: {str(e)}")
        await audit_logger.log_action(
            current_user["uid"], 
            "write_file", 
            {"filename": filename, "success": False, "error": str(e)}
        )
        return {"error": f"Failed to write file: {str(e)}"}

# Create FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Secure MCP Server")
    yield
    # Cleanup all contexts
    for user_id, user_contexts in contexts.items():
        for session_id in list(user_contexts.keys()):
            try:
                await cleanup_context(session_id, user_id)
            except Exception as e:
                logger.error(f"Error cleaning up context {session_id} for user {user_id}: {e}")
    logger.info("Secure MCP Server stopped")

app = FastAPI(
    title="Secure MCP Server",
    description="Secure HTTP API for MCP Server with authentication and authorization",
    version="2.0.0",
    lifespan=lifespan
)

# Add security middleware
app.middleware("http")(rate_limit_middleware)
app.add_middleware(SecurityMiddleware)
app.add_middleware(InputValidationMiddleware)

# Add CORS middleware (restrictive)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:8082").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# Initialize security manager
security_manager = SecurityManager()

# Authentication endpoints
@app.post("/auth/register", response_model=AuthResponse)
async def register(request: RegisterRequest):
    """Register a new user"""
    try:
        user_data = await security_manager.create_user(
            request.email, 
            request.password, 
            request.role
        )
        
        # Generate tokens
        access_token = security_manager.generate_access_token(user_data)
        refresh_token = security_manager.generate_refresh_token(user_data)
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_data
        )
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/login", response_model=AuthResponse)
async def login(request: AuthRequest):
    """Authenticate user with Firebase ID token"""
    try:
        user_data = await security_manager.authenticate_user(request.id_token)
        
        # Generate tokens
        access_token = security_manager.generate_access_token(user_data)
        refresh_token = security_manager.generate_refresh_token(user_data)
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            user=user_data
        )
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

# Secure API endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "secure-mcp-server", "version": "2.0.0"}

@app.get("/tools")
async def list_tools(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List available tools based on user permissions"""
    user_permissions = current_user.get("permissions", [])
    
    all_tools = {
        Permission.NAVIGATE: {
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
        Permission.SCREENSHOT: {
            "name": "screenshot", 
            "description": "Take a screenshot of the current page",
            "input_schema": {"type": "object", "properties": {}}
        },
        Permission.WRITE_FILE: {
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
        }
        # Add other tools based on permissions
    }
    
    # Filter tools based on user permissions
    available_tools = {
        perm: tool for perm, tool in all_tools.items() 
        if perm in user_permissions
    }
    
    return {"tools": list(available_tools.values())}

@app.post("/tools/execute", response_model=ToolResponse)
async def execute_tool(
    request: ToolRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Execute a tool with proper authorization"""
    try:
        session_id = request.session_id or str(uuid.uuid4())
        user_id = current_user["uid"]
        
        logger.info(f"User {current_user['email']} executing tool '{request.tool_name}' for session {session_id}")
        
        # Check permission for the specific tool
        tool_permission_map = {
            "navigate": Permission.NAVIGATE,
            "screenshot": Permission.SCREENSHOT,
            "write_file": Permission.WRITE_FILE,
            # Add other mappings
        }
        
        required_permission = tool_permission_map.get(request.tool_name)
        if required_permission and required_permission not in current_user.get("permissions", []):
            raise HTTPException(
                status_code=403, 
                detail=f"Permission '{required_permission}' required for tool '{request.tool_name}'"
            )
        
        # Get or create context
        context = await get_or_create_context(session_id, user_id)
        ctx = MockContext(context)
        
        # Route to appropriate tool function
        tool_name = request.tool_name
        arguments = request.arguments
        
        if tool_name == "navigate":
            result = await navigate_tool(arguments["url"], ctx, current_user)
        elif tool_name == "screenshot":
            result = await screenshot_tool(ctx, current_user)
        elif tool_name == "write_file":
            result = await write_file_tool(arguments["filename"], arguments["content"], ctx, current_user)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")
            
        logger.info(f"Tool '{tool_name}' executed successfully for user {current_user['email']}")
        return ToolResponse(success=True, result=result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error executing tool {request.tool_name}: {e}")
        traceback.print_exc()
        return ToolResponse(success=False, error=str(e))

@app.delete("/sessions/{session_id}")
async def cleanup_session(
    session_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Cleanup a user session"""
    try:
        user_id = current_user["uid"]
        await cleanup_context(session_id, user_id)
        
        # Log action
        await audit_logger.log_action(
            current_user["uid"], 
            "cleanup_session", 
            {"session_id": session_id, "success": True}
        )
        
        return {"message": f"Session {session_id} cleaned up successfully"}
    except Exception as e:
        logger.error(f"Error cleaning up session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Admin endpoints
@app.get("/admin/users")
@require_role(UserRole.ADMIN)
async def list_users(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List all users (admin only)"""
    try:
        if security_manager.db:
            users_ref = security_manager.db.collection("users")
            users = []
            for doc in users_ref.stream():
                user_data = doc.to_dict()
                # Remove sensitive data
                user_data.pop("password", None)
                users.append(user_data)
            return {"users": users}
        else:
            return {"users": [], "message": "Database not available"}
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail="Failed to list users")

@app.get("/admin/audit-logs")
@require_permission(Permission.VIEW_LOGS)
async def get_audit_logs(
    limit: int = 100,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get audit logs (admin only)"""
    try:
        if security_manager.db:
            logs_ref = security_manager.db.collection("audit_logs").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
            logs = []
            for doc in logs_ref.stream():
                logs.append(doc.to_dict())
            return {"logs": logs}
        else:
            return {"logs": [], "message": "Database not available"}
    except Exception as e:
        logger.error(f"Error getting audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to get audit logs")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8083))
    uvicorn.run(app, host="0.0.0.0", port=port)