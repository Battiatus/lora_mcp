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
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel, Field
import uvicorn
from fastapi import Query

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

# Enhanced Pydantic models with proper documentation
class ToolRequest(BaseModel):
    """Request model for tool execution"""
    tool_name: str = Field(..., description="Name of the tool to execute", example="navigate")
    arguments: Dict[str, Any] = Field(..., description="Arguments for the tool", example={"url": "https://example.com"})
    session_id: Optional[str] = Field(None, description="Session ID for context isolation", example="session_123")

class ToolResponse(BaseModel):
    """Response model for tool execution"""
    success: bool = Field(..., description="Whether the tool execution was successful")
    result: Any = Field(..., description="Result of the tool execution")
    error: Optional[str] = Field(None, description="Error message if execution failed")
    execution_time: Optional[float] = Field(None, description="Execution time in seconds")
    session_id: str = Field(..., description="Session ID used for execution")

class AuthRequest(BaseModel):
    """Authentication request model"""
    id_token: str = Field(..., description="Firebase ID token", example="eyJhbGciOiJSUzI1NiIs...")
    provider: Optional[str] = Field("firebase", description="Authentication provider", example="firebase")

class AuthResponse(BaseModel):
    """Authentication response model"""
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    expires_in: int = Field(..., description="Token expiration time in seconds")
    user: Dict[str, Any] = Field(..., description="User information")

class RegisterRequest(BaseModel):
    """User registration request model"""
    email: str = Field(..., description="User email address", example="user@example.com")
    password: str = Field(..., description="User password", min_length=8, example="SecurePass123!")
    role: Optional[str] = Field(UserRole.USER, description="User role", example=UserRole.USER)
    display_name: Optional[str] = Field(None, description="Display name", example="John Doe")

class UserInfo(BaseModel):
    """User information model"""
    uid: str = Field(..., description="User unique identifier")
    email: str = Field(..., description="User email")
    role: str = Field(..., description="User role")
    permissions: List[str] = Field(..., description="User permissions")
    created_at: datetime = Field(..., description="Account creation date")
    last_login: Optional[datetime] = Field(None, description="Last login date")

class ToolDefinition(BaseModel):
    """Tool definition model"""
    name: str = Field(..., description="Tool name")
    description: str = Field(..., description="Tool description")
    permission_required: str = Field(..., description="Required permission")
    input_schema: Dict[str, Any] = Field(..., description="Input schema")
    examples: List[Dict[str, Any]] = Field(default_factory=list, description="Usage examples")

class AuditLog(BaseModel):
    """Audit log entry model"""
    user_id: str = Field(..., description="User ID")
    action: str = Field(..., description="Action performed")
    timestamp: datetime = Field(..., description="Timestamp")
    ip_address: Optional[str] = Field(None, description="Client IP address")
    details: Dict[str, Any] = Field(..., description="Action details")
    success: bool = Field(..., description="Whether action was successful")

class SessionInfo(BaseModel):
    """Session information model"""
    session_id: str = Field(..., description="Session ID")
    user_id: str = Field(..., description="User ID")
    created_at: datetime = Field(..., description="Session creation time")
    last_activity: datetime = Field(..., description="Last activity time")
    active: bool = Field(..., description="Whether session is active")

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
        self.created_at = datetime.utcnow()
        self.last_activity = datetime.utcnow()

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
        
    else:
        # Update last activity
        contexts[user_id][session_id].last_activity = datetime.utcnow()
        
    return contexts[user_id][session_id]

# Create FastAPI app with enhanced documentation
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting Secure MCP Server v2.0")
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
    title="Secure MCP Server API",
    description="""
    ## Secure Model Context Protocol (MCP) Server
    
    This API provides secure web automation capabilities with:
    
    - **Authentication**: Firebase-based authentication with JWT tokens
    - **Authorization**: Role-based access control with granular permissions
    - **Audit Trail**: Complete logging of all actions
    - **Rate Limiting**: Protection against abuse
    - **Session Management**: Isolated browser contexts per user
    
    ### Authentication Flow
    1. Register or authenticate with Firebase
    2. Receive JWT access token
    3. Include token in Authorization header: `Bearer <token>`
    
    ### Roles and Permissions
    - **Admin**: Full access to all tools and admin functions
    - **User**: Access to standard automation tools
    - **ReadOnly**: Limited to viewing operations
    - **Guest**: Minimal access for demonstration
    
    ### Security Features
    - Input validation and sanitization
    - Rate limiting (60 requests/minute by default)
    - Session isolation between users
    - Comprehensive audit logging
    - Protection against common web attacks
    """,
    version="2.0.0",
    contact={
        "name": "MCP Server Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)



# Add security middleware
app.middleware("http")(rate_limit_middleware)
# app.add_middleware(SecurityMiddleware)
# app.add_middleware(InputValidationMiddleware)

from starlette.middleware.base import BaseHTTPMiddleware

# instantiate your middleware classes
security_mw = SecurityMiddleware()
input_validation_mw = InputValidationMiddleware()

# register them via BaseHTTPMiddleware, which expects (app, dispatch=...)
app.add_middleware(
    BaseHTTPMiddleware,
    dispatch=security_mw.__call__
)
app.add_middleware(
    BaseHTTPMiddleware,
    dispatch=input_validation_mw.__call__
)


# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:8082").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

# Initialize security manager
security_manager = SecurityManager()

# Custom OpenAPI schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="Secure MCP Server API",
        version="2.0.0",
        description=app.description,
        routes=app.routes,
    )
    
    # Add security schemes
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT token obtained from authentication endpoint"
        },
        "FirebaseAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "Firebase ID Token",
            "description": "Firebase ID token for initial authentication"
        }
    }
    
    # Add security to all protected endpoints
    for path in openapi_schema["paths"]:
        for method in openapi_schema["paths"][path]:
            if path not in ["/auth/login", "/auth/register", "/health", "/docs", "/redoc", "/openapi.json"]:
                openapi_schema["paths"][path][method]["security"] = [{"BearerAuth": []}]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Authentication endpoints
@app.post("/auth/register", 
         response_model=AuthResponse,
         tags=["Authentication"],
         summary="Register new user",
         description="Register a new user account with email and password")
async def register(request: RegisterRequest):
    """Register a new user account"""
    try:
        user_data = await security_manager.create_user(
            request.email, 
            request.password, 
            request.role
        )
        
        # Generate tokens
        access_token = security_manager.generate_access_token(user_data)
        refresh_token = security_manager.generate_refresh_token(user_data)
        
        # Log registration
        await audit_logger.log_action(
            user_data["uid"], 
            "register", 
            {"email": request.email, "role": request.role, "success": True}
        )
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=SecurityConfig.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_data
        )
    except Exception as e:
        logger.error(f"Registration error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/auth/login", 
         response_model=AuthResponse,
         tags=["Authentication"],
         summary="Authenticate user",
         description="Authenticate user with Firebase ID token or SSO")
async def login(request: AuthRequest, client_request: Request):
    """Authenticate user with Firebase ID token"""
    try:
        user_data = await security_manager.authenticate_user(request.id_token)
        
        # Generate tokens
        access_token = security_manager.generate_access_token(user_data)
        refresh_token = security_manager.generate_refresh_token(user_data)
        
        # Log login
        client_ip = client_request.client.host if client_request.client else "unknown"
        await audit_logger.log_action(
            user_data["uid"], 
            "login", 
            {"provider": request.provider, "success": True},
            client_ip
        )
        
        return AuthResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=SecurityConfig.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_data
        )
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

@app.post("/auth/refresh",
         response_model=AuthResponse,
         tags=["Authentication"],
         summary="Refresh access token",
         description="Refresh access token using refresh token")
async def refresh_token(refresh_token: str):
    """Refresh access token"""
    try:
        payload = security_manager.verify_token(refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        # Get user data
        user_data = await security_manager.get_user_by_uid(payload["uid"])
        
        # Generate new access token
        new_access_token = security_manager.generate_access_token(user_data)
        
        return AuthResponse(
            access_token=new_access_token,
            refresh_token=refresh_token,  # Keep same refresh token
            expires_in=SecurityConfig.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_data
        )
    except Exception as e:
        logger.error(f"Token refresh error: {e}")
        raise HTTPException(status_code=401, detail="Token refresh failed")

# Core API endpoints
@app.get("/health",
        tags=["System"],
        summary="Health check",
        description="Check API health status")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy", 
        "service": "secure-mcp-server", 
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "firebase_status": "connected" if firebase_initialized else "standalone"
    }

@app.get("/tools",
        response_model=List[ToolDefinition],
        tags=["Tools"],
        summary="List available tools",
        description="Get list of tools available to current user based on permissions")
async def list_tools(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List available tools based on user permissions"""
    user_permissions = current_user.get("permissions", [])
    
    all_tools = {
        Permission.NAVIGATE: ToolDefinition(
            name="navigate",
            description="Navigate to a specified URL with automatic CAPTCHA detection",
            permission_required=Permission.NAVIGATE,
            input_schema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string", 
                        "description": "The URL to navigate to",
                        "pattern": "^https?://.*",
                        "example": "https://example.com"
                    }
                },
                "required": ["url"]
            },
            examples=[
                {"url": "https://google.com"},
                {"url": "https://github.com"}
            ]
        ),
        Permission.SCREENSHOT: ToolDefinition(
            name="screenshot",
            description="Take a screenshot of the current page",
            permission_required=Permission.SCREENSHOT,
            input_schema={"type": "object", "properties": {}},
            examples=[{}]
        ),
        Permission.CLICK: ToolDefinition(
            name="click",
            description="Click at specific coordinates on the page",
            permission_required=Permission.CLICK,
            input_schema={
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate", "minimum": 0},
                    "y": {"type": "integer", "description": "Y coordinate", "minimum": 0}
                },
                "required": ["x", "y"]
            },
            examples=[
                {"x": 100, "y": 200},
                {"x": 500, "y": 300}
            ]
        ),
        Permission.SCROLL: ToolDefinition(
            name="scroll",
            description="Scroll the page up or down",
            permission_required=Permission.SCROLL,
            input_schema={
                "type": "object",
                "properties": {
                    "direction": {"type": "string", "enum": ["up", "down"]},
                    "amount": {"type": "integer", "description": "Amount to scroll in pixels", "minimum": 1}
                },
                "required": ["direction", "amount"]
            },
            examples=[
                {"direction": "down", "amount": 300},
                {"direction": "up", "amount": 150}
            ]
        ),
        Permission.TYPE: ToolDefinition(
            name="type",
            description="Type text into the focused element",
            permission_required=Permission.TYPE,
            input_schema={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to type"},
                    "submit": {"type": "boolean", "description": "Whether to press Enter", "default": False}
                },
                "required": ["text"]
            },
            examples=[
                {"text": "Hello World", "submit": False},
                {"text": "search query", "submit": True}
            ]
        ),
        Permission.WRITE_FILE: ToolDefinition(
            name="write_file",
            description="Write content to a file in user's isolated directory",
            permission_required=Permission.WRITE_FILE,
            input_schema={
                "type": "object",
                "properties": {
                    "filename": {"type": "string", "description": "Name of the file", "pattern": "^[a-zA-Z0-9._-]+$"},
                    "content": {"type": "string", "description": "Content to write"}
                },
                "required": ["filename", "content"]
            },
            examples=[
                {"filename": "report.md", "content": "# My Report\n\nContent here..."},
                {"filename": "data.json", "content": '{"key": "value"}'}
            ]
        )
    }
    
    # Filter tools based on user permissions
    available_tools = [
        tool for perm, tool in all_tools.items() 
        if perm in user_permissions
    ]
    
    return available_tools

@app.post("/tools/execute",
         response_model=ToolResponse,
         tags=["Tools"],
         summary="Execute a tool",
         description="Execute a specific tool with provided arguments")
async def execute_tool(
    request: ToolRequest,
    client_request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Execute a tool with proper authorization and audit logging"""
    start_time = datetime.utcnow()
    
    try:
        session_id = request.session_id or str(uuid.uuid4())
        user_id = current_user["uid"]
        
        logger.info(f"User {current_user['email']} executing tool '{request.tool_name}' for session {session_id}")
        
        # Check permission for the specific tool
        tool_permission_map = {
            "navigate": Permission.NAVIGATE,
            "screenshot": Permission.SCREENSHOT,
            "click": Permission.CLICK,
            "scroll": Permission.SCROLL,
            "type": Permission.TYPE,
            "write_file": Permission.WRITE_FILE,
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
        
        # Execute tool (implement tool functions here)
        result = await execute_tool_function(request.tool_name, request.arguments, ctx, current_user)
        
        # Calculate execution time
        execution_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Log successful execution
        client_ip = client_request.client.host if client_request.client else "unknown"
        await audit_logger.log_action(
            current_user["uid"], 
            f"tool_execute_{request.tool_name}", 
            {
                "tool": request.tool_name,
                "arguments": request.arguments,
                "session_id": session_id,
                "execution_time": execution_time,
                "success": True
            },
            client_ip
        )
        
        logger.info(f"Tool '{request.tool_name}' executed successfully for user {current_user['email']} in {execution_time:.2f}s")
        
        return ToolResponse(
            success=True, 
            result=result,
            execution_time=execution_time,
            session_id=session_id
        )
        
    except HTTPException:
        raise
    except Exception as e:
        execution_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Log failed execution
        client_ip = client_request.client.host if client_request.client else "unknown"
        await audit_logger.log_action(
            current_user["uid"], 
            f"tool_execute_{request.tool_name}", 
            {
                "tool": request.tool_name,
                "arguments": request.arguments,
                "session_id": request.session_id,
                "execution_time": execution_time,
                "success": False,
                "error": str(e)
            },
            client_ip
        )
        
        logger.error(f"Error executing tool {request.tool_name}: {e}")
        traceback.print_exc()
        
        return ToolResponse(
            success=False, 
            error=str(e),
            execution_time=execution_time,
            session_id=request.session_id or "unknown"
        )

# Session management endpoints
@app.get("/sessions",
        response_model=List[SessionInfo],
        tags=["Sessions"],
        summary="List user sessions",
        description="Get list of active sessions for current user")
async def list_sessions(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List active sessions for current user"""
    user_id = current_user["uid"]
    user_sessions = []
    
    if user_id in contexts:
        for session_id, context in contexts[user_id].items():
            user_sessions.append(SessionInfo(
                session_id=session_id,
                user_id=user_id,
                created_at=context.created_at,
                last_activity=context.last_activity,
                active=True
            ))
    
    return user_sessions

@app.delete("/sessions/{session_id}",
           tags=["Sessions"],
           summary="Delete session",
           description="Delete a specific session and cleanup resources")
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
@app.get("/admin/users",
        response_model=List[UserInfo],
        tags=["Admin"],
        summary="List all users",
        description="Get list of all users (admin only)")
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
                users.append(UserInfo(**user_data))
            return users
        else:
            return []
    except Exception as e:
        logger.error(f"Error listing users: {e}")
        raise HTTPException(status_code=500, detail="Failed to list users")

@app.get("/admin/audit-logs",
        response_model=List[AuditLog],
        tags=["Admin"],
        summary="Get audit logs",
        description="Get audit logs with optional filtering (admin only)")
@require_permission(Permission.VIEW_LOGS)
async def get_audit_logs(
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of logs to return"),
    user_id: Optional[str] = Query(None,  description="Filter by user ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Get audit logs with filtering options"""
    try:
        if security_manager.db:
            logs_ref = security_manager.db.collection("audit_logs")
            
            # Apply filters
            if user_id:
                logs_ref = logs_ref.where("user_id", "==", user_id)
            if action:
                logs_ref = logs_ref.where("action", "==", action)
            
            logs_ref = logs_ref.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
            
            logs = []
            for doc in logs_ref.stream():
                log_data = doc.to_dict()
                logs.append(AuditLog(**log_data))
            return logs
        else:
            return []
    except Exception as e:
        logger.error(f"Error getting audit logs: {e}")
        raise HTTPException(status_code=500, detail="Failed to get audit logs")

@app.get("/admin/stats",
        tags=["Admin"],
        summary="Get system statistics",
        description="Get system usage statistics (admin only)")
@require_role(UserRole.ADMIN)
async def get_system_stats(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Get system statistics"""
    try:
        # Count active sessions
        total_sessions = sum(len(user_contexts) for user_contexts in contexts.values())
        active_users = len(contexts)
        
        # Get database stats if available
        total_users = 0
        total_logs = 0
        
        if security_manager.db:
            # Count users
            users_ref = security_manager.db.collection("users")
            total_users = len(list(users_ref.stream()))
            
            # Count logs
            logs_ref = security_manager.db.collection("audit_logs")
            total_logs = len(list(logs_ref.stream()))
        
        return {
            "active_sessions": total_sessions,
            "active_users": active_users,
            "total_users": total_users,
            "total_audit_logs": total_logs,
            "server_version": "2.0.0",
            "firebase_status": "connected" if firebase_initialized else "standalone",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting system stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get system statistics")

# Tool execution functions (implement your existing tool logic here)
async def execute_tool_function(tool_name: str, arguments: Dict[str, Any], ctx, current_user: Dict[str, Any]):
    """Execute the appropriate tool function"""
    if tool_name == "navigate":
        return await navigate_tool(arguments["url"], ctx, current_user)
    elif tool_name == "screenshot":
        return await screenshot_tool(ctx, current_user)
    elif tool_name == "click":
        return await click_tool(arguments["x"], arguments["y"], ctx, current_user)
    elif tool_name == "scroll":
        return await scroll_tool(arguments["direction"], arguments["amount"], ctx, current_user)
    elif tool_name == "type":
        return await type_tool(arguments["text"], ctx, current_user, arguments.get("submit", False))
    elif tool_name == "write_file":
        return await write_file_tool(arguments["filename"], arguments["content"], ctx, current_user)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")

# Include your existing tool implementations here (navigate_tool, screenshot_tool, etc.)
# ... (previous tool implementations remain the same)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8083))
    uvicorn.run(app, host="0.0.0.0", port=port)