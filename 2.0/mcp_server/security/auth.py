import os
import json
import logging
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from functools import wraps

import jwt
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, firestore
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
from cryptography.fernet import Fernet

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

# Initialize Firebase
def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        # Try to get credentials from environment variable
        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        print(f"Using Firebase credentials from: {cred_path}")
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
        else:
            # Try to get credentials from environment variable as JSON
            cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
            if cred_json:
                cred_dict = json.loads(cred_json)
                cred = credentials.Certificate(cred_dict)
            else:
                # Use default credentials
                cred = credentials.ApplicationDefault()
        
        firebase_admin.initialize_app(cred)
        logger.info("Firebase initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Firebase: {e}")
        return False

# Security configuration
class SecurityConfig:
    SECRET_KEY = os.getenv("MCP_SECRET_KEY", Fernet.generate_key().decode())
    JWT_ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
    MAX_REQUESTS_PER_MINUTE = int(os.getenv("MAX_REQUESTS_PER_MINUTE", "60"))
    MAX_SESSIONS_PER_USER = int(os.getenv("MAX_SESSIONS_PER_USER", "5"))
    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", Fernet.generate_key())

# User roles and permissions
class UserRole:
    ADMIN = "admin"
    USER = "user"
    READONLY = "readonly"
    GUEST = "guest"

class Permission:
    # Navigation permissions
    NAVIGATE = "navigate"
    SCREENSHOT = "screenshot"
    CLICK = "click"
    SCROLL = "scroll"
    TYPE = "type"
    DOWNLOAD_TIKTOK = "download_tiktok"
    
    # Advanced permissions
    WRITE_FILE = "write_file"
    DOWNLOAD_VIDEO = "download_video"
    TRANSLATE = "translate"
    
    # Admin permissions
    MANAGE_USERS = "manage_users"
    VIEW_LOGS = "view_logs"
    MANAGE_SESSIONS = "manage_sessions"

# Role-based permissions mapping
ROLE_PERMISSIONS = {
    UserRole.ADMIN: [
        Permission.NAVIGATE, Permission.SCREENSHOT, Permission.CLICK,
        Permission.SCROLL, Permission.TYPE, Permission.WRITE_FILE,
        Permission.DOWNLOAD_VIDEO, Permission.TRANSLATE,
        Permission.MANAGE_USERS, Permission.VIEW_LOGS, Permission.MANAGE_SESSIONS,
        Permission.DOWNLOAD_TIKTOK
    ],
    UserRole.USER: [
        Permission.NAVIGATE, Permission.SCREENSHOT, Permission.CLICK,
        Permission.SCROLL, Permission.TYPE, Permission.WRITE_FILE,
        Permission.TRANSLATE,
        Permission.DOWNLOAD_TIKTOK
    ],
    UserRole.READONLY: [
        Permission.NAVIGATE, Permission.SCREENSHOT
    ],
    UserRole.GUEST: [
        Permission.SCREENSHOT
    ]
}

class SecurityManager:
    def __init__(self):
        self.db = firestore.client() if firebase_admin._apps else None
        self.cipher = Fernet(SecurityConfig.ENCRYPTION_KEY)
        self.rate_limiter = RateLimiter()
        self.session_manager = SessionManager()
        
    async def create_user(self, email: str, password: str, role: str = UserRole.USER) -> Dict[str, Any]:
        """Create a new user in Firebase"""
        try:
            # Create user in Firebase Auth
            user = firebase_auth.create_user(
                email=email,
                password=password,
                email_verified=False
            )
            
            # Store user metadata in Firestore
            user_data = {
                "uid": user.uid,
                "email": email,
                "role": role,
                "permissions": ROLE_PERMISSIONS.get(role, []),
                "created_at": datetime.utcnow(),
                "is_active": True,
                "last_login": None,
                "session_count": 0,
                "rate_limit_reset": datetime.utcnow()
            }
            
            if self.db:
                self.db.collection("users").document(user.uid).set(user_data)
            
            logger.info(f"User created successfully: {email}")
            return {"uid": user.uid, "email": email, "role": role}
            
        except Exception as e:
            logger.error(f"Error creating user: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to create user: {str(e)}")
    
    async def authenticate_user(self, id_token: str) -> Dict[str, Any]:
        """Authenticate user with Firebase ID token"""
        try:
            # Verify the ID token
            decoded_token = firebase_auth.verify_id_token(id_token)
            uid = decoded_token["uid"]
            
            # Get user data from Firestore
            if self.db:
                user_doc = self.db.collection("users").document(uid).get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    
                    # Check if user is active
                    if not user_data.get("is_active", False):
                        raise HTTPException(status_code=403, detail="User account is disabled")
                    
                    # Update last login
                    self.db.collection("users").document(uid).update({
                        "last_login": datetime.utcnow()
                    })
                    
                    return user_data
                else:
                    raise HTTPException(status_code=404, detail="User not found in database")
            else:
                # Fallback if Firestore is not available
                return {
                    "uid": uid,
                    "email": decoded_token.get("email"),
                    "role": UserRole.USER,
                    "permissions": ROLE_PERMISSIONS[UserRole.USER]
                }
                
        except firebase_auth.InvalidIdTokenError:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            raise HTTPException(status_code=401, detail="Authentication failed")
    
    def generate_access_token(self, user_data: Dict[str, Any]) -> str:
        """Generate JWT access token"""
        expire = datetime.utcnow() + timedelta(minutes=SecurityConfig.ACCESS_TOKEN_EXPIRE_MINUTES)
        payload = {
            "uid": user_data["uid"],
            "email": user_data["email"],
            "role": user_data["role"],
            "permissions": user_data["permissions"],
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        }
        return jwt.encode(payload, SecurityConfig.SECRET_KEY, algorithm=SecurityConfig.JWT_ALGORITHM)
    
    def generate_refresh_token(self, user_data: Dict[str, Any]) -> str:
        """Generate JWT refresh token"""
        expire = datetime.utcnow() + timedelta(days=SecurityConfig.REFRESH_TOKEN_EXPIRE_DAYS)
        payload = {
            "uid": user_data["uid"],
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh"
        }
        return jwt.encode(payload, SecurityConfig.SECRET_KEY, algorithm=SecurityConfig.JWT_ALGORITHM)
    
    def verify_token(self, token: str) -> Dict[str, Any]:
        """Verify and decode JWT token"""
        try:
            payload = jwt.decode(token, SecurityConfig.SECRET_KEY, algorithms=[SecurityConfig.JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token has expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    
    def encrypt_sensitive_data(self, data: str) -> str:
        """Encrypt sensitive data"""
        return self.cipher.encrypt(data.encode()).decode()
    
    def decrypt_sensitive_data(self, encrypted_data: str) -> str:
        """Decrypt sensitive data"""
        return self.cipher.decrypt(encrypted_data.encode()).decode()

class RateLimiter:
    def __init__(self):
        self.requests = {}
    
    async def check_rate_limit(self, user_id: str) -> bool:
        """Check if user has exceeded rate limit"""
        now = datetime.utcnow()
        minute_ago = now - timedelta(minutes=1)
        
        # Clean old requests
        if user_id in self.requests:
            self.requests[user_id] = [req_time for req_time in self.requests[user_id] if req_time > minute_ago]
        else:
            self.requests[user_id] = []
        
        # Check current count
        if len(self.requests[user_id]) >= SecurityConfig.MAX_REQUESTS_PER_MINUTE:
            return False
        
        # Add current request
        self.requests[user_id].append(now)
        return True

class SessionManager:
    def __init__(self):
        self.active_sessions = {}
    
    async def create_session(self, user_id: str, session_data: Dict[str, Any]) -> str:
        """Create a new session"""
        # Check session limit
        user_sessions = [s for s in self.active_sessions.values() if s.get("user_id") == user_id]
        if len(user_sessions) >= SecurityConfig.MAX_SESSIONS_PER_USER:
            # Remove oldest session
            oldest_session = min(user_sessions, key=lambda x: x["created_at"])
            for session_id, session in list(self.active_sessions.items()):
                if session == oldest_session:
                    del self.active_sessions[session_id]
                    break
        
        # Create new session
        session_id = f"session_{user_id}_{datetime.utcnow().timestamp()}"
        self.active_sessions[session_id] = {
            "user_id": user_id,
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow(),
            **session_data
        }
        
        return session_id
    
    async def validate_session(self, session_id: str, user_id: str) -> bool:
        """Validate session"""
        if session_id not in self.active_sessions:
            return False
        
        session = self.active_sessions[session_id]
        if session["user_id"] != user_id:
            return False
        
        # Update last activity
        session["last_activity"] = datetime.utcnow()
        return True
    
    async def cleanup_expired_sessions(self):
        """Remove expired sessions"""
        now = datetime.utcnow()
        expired_sessions = []
        
        for session_id, session in self.active_sessions.items():
            if now - session["last_activity"] > timedelta(hours=24):
                expired_sessions.append(session_id)
        
        for session_id in expired_sessions:
            del self.active_sessions[session_id]

# Security middleware
security_manager = SecurityManager()
security_scheme = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> Dict[str, Any]:
    """Get current authenticated user"""
    try:
        token = credentials.credentials
        payload = security_manager.verify_token(token)
        
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

def require_permission(permission: str):
    """Decorator to require specific permission"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Get current user from kwargs (injected by FastAPI)
            current_user = None
            for arg in kwargs.values():
                if isinstance(arg, dict) and "permissions" in arg:
                    current_user = arg
                    break
            
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            if permission not in current_user.get("permissions", []):
                raise HTTPException(status_code=403, detail=f"Permission '{permission}' required")
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

def require_role(role: str):
    """Decorator to require specific role"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            current_user = None
            for arg in kwargs.values():
                if isinstance(arg, dict) and "role" in arg:
                    current_user = arg
                    break
            
            if not current_user:
                raise HTTPException(status_code=401, detail="Authentication required")
            
            if current_user.get("role") != role:
                raise HTTPException(status_code=403, detail=f"Role '{role}' required")
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware"""
    # Skip rate limiting for health checks and auth endpoints
    if request.url.path in ["/health", "/auth/login", "/auth/register"]:
        return await call_next(request)
    
    # Get user ID from token
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = security_manager.verify_token(token)
            user_id = payload.get("uid")
            
            if user_id and not await security_manager.rate_limiter.check_rate_limit(user_id):
                raise HTTPException(status_code=429, detail="Rate limit exceeded")
                
        except Exception:
            pass  # Let other middleware handle auth errors
    
    return await call_next(request)

class AuditLogger:
    def __init__(self):
        self.db = firestore.client() if firebase_admin._apps else None
    
    async def log_action(self, user_id: str, action: str, details: Dict[str, Any], ip_address: str = None):
        """Log user actions for audit trail"""
        log_entry = {
            "user_id": user_id,
            "action": action,
            "details": details,
            "timestamp": datetime.utcnow(),
            "ip_address": ip_address,
            "success": details.get("success", True)
        }
        
        if self.db:
            try:
                self.db.collection("audit_logs").add(log_entry)
            except Exception as e:
                logger.error(f"Failed to log audit entry: {e}")
        
        # Also log to file
        logger.info(f"AUDIT: {user_id} - {action} - {details}")

audit_logger = AuditLogger()