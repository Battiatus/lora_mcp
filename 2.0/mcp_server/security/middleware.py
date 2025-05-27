import time
import json
import logging
from typing import Dict, Any
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
import asyncio

logger = logging.getLogger(__name__)

class SecurityMiddleware:
    def __init__(self):
        self.blocked_ips = set()
        self.suspicious_activities = {}
        
    async def __call__(self, request: Request, call_next):
        start_time = time.time()
        
        try:
            # Security checks
            await self.check_ip_blocking(request)
            await self.check_request_size(request)
            await self.check_suspicious_patterns(request)
            
            # Process request
            response = await call_next(request)
            
            # Log successful request
            process_time = time.time() - start_time
            await self.log_request(request, response, process_time)
            
            # Add security headers
            response = self.add_security_headers(response)
            
            return response
            
        except HTTPException as e:
            # Log security violation
            await self.log_security_violation(request, str(e.detail))
            raise
        except Exception as e:
            # Log unexpected error
            logger.error(f"Unexpected error in security middleware: {e}")
            await self.log_security_violation(request, f"Unexpected error: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    async def check_ip_blocking(self, request: Request):
        """Check if IP is blocked"""
        client_ip = self.get_client_ip(request)
        if client_ip in self.blocked_ips:
            raise HTTPException(status_code=403, detail="IP address blocked")
    
    async def check_request_size(self, request: Request):
        """Check request size limits"""
        content_length = request.headers.get("content-length")
        if content_length:
            size = int(content_length)
            max_size = 10 * 1024 * 1024  # 10MB
            if size > max_size:
                raise HTTPException(status_code=413, detail="Request too large")
    
    async def check_suspicious_patterns(self, request: Request):
        """Check for suspicious request patterns"""
        client_ip = self.get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")
        
        # Check for common attack patterns
        suspicious_patterns = [
            "sqlmap", "nikto", "burp", "nmap", "masscan",
            "../", "..\\", "<script", "javascript:",
            "union select", "drop table", "insert into"
        ]
        
        request_data = str(request.url) + str(request.headers) + user_agent
        
        for pattern in suspicious_patterns:
            if pattern.lower() in request_data.lower():
                await self.mark_suspicious_activity(client_ip, f"Suspicious pattern: {pattern}")
                raise HTTPException(status_code=400, detail="Suspicious request detected")
    
    async def mark_suspicious_activity(self, ip: str, reason: str):
        """Mark IP for suspicious activity"""
        if ip not in self.suspicious_activities:
            self.suspicious_activities[ip] = []
        
        self.suspicious_activities[ip].append({
            "timestamp": time.time(),
            "reason": reason
        })
        
        # Block IP after multiple suspicious activities
        recent_activities = [
            activity for activity in self.suspicious_activities[ip]
            if time.time() - activity["timestamp"] < 3600  # Last hour
        ]
        
        if len(recent_activities) >= 5:
            self.blocked_ips.add(ip)
            logger.warning(f"IP {ip} blocked due to suspicious activities")
    
    def get_client_ip(self, request: Request) -> str:
        """Get real client IP address"""
        # Check for forwarded headers
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"
    
    def add_security_headers(self, response: Response) -> Response:
        """Add security headers to response"""
        security_headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "Content-Security-Policy": "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        "img-src 'self' https://fastapi.tiangolo.com data:; "
        "font-src 'self' https://cdn.jsdelivr.net; "
        "connect-src 'self';",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "geolocation=(), microphone=(), camera=()"

        }
        
        for header, value in security_headers.items():
            response.headers[header] = value
        
        return response
    
    async def log_request(self, request: Request, response: Response, process_time: float):
        """Log request details"""
        log_data = {
            "method": request.method,
            "url": str(request.url),
            "status_code": response.status_code,
            "process_time": round(process_time, 4),
            "client_ip": self.get_client_ip(request),
            "user_agent": request.headers.get("user-agent", ""),
            "timestamp": time.time()
        }
        
        logger.info(f"REQUEST: {json.dumps(log_data)}")
    
    async def log_security_violation(self, request: Request, violation: str):
        """Log security violations"""
        log_data = {
            "violation": violation,
            "method": request.method,
            "url": str(request.url),
            "client_ip": self.get_client_ip(request),
            "user_agent": request.headers.get("user-agent", ""),
            "timestamp": time.time()
        }
        
        logger.warning(f"SECURITY_VIOLATION: {json.dumps(log_data)}")

class InputValidationMiddleware:
    """Middleware for input validation and sanitization"""
    
    async def __call__(self, request: Request, call_next):
        # Validate and sanitize input for specific endpoints
        if request.method in ["POST", "PUT", "PATCH"]:
            await self.validate_json_input(request)
        
        return await call_next(request)
    
    async def validate_json_input(self, request: Request):
        """Validate JSON input"""
        if "application/json" in request.headers.get("content-type", ""):
            try:
                # Read body
                body = await request.body()
                if body:
                    data = json.loads(body)
                    await self.sanitize_input(data)
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON format")
            except Exception as e:
                logger.error(f"Input validation error: {e}")
                raise HTTPException(status_code=400, detail="Input validation failed")
    
    async def sanitize_input(self, data: Dict[str, Any]):
        """Sanitize input data"""
        dangerous_patterns = [
            r"<script.*?>.*?</script>",
            r"javascript:",
            r"vbscript:",
            r"onload=",
            r"onerror=",
            r"eval\(",
            r"exec\("
        ]
        
        def clean_string(value: str) -> str:
            import re
            for pattern in dangerous_patterns:
                value = re.sub(pattern, "", value, flags=re.IGNORECASE)
            return value
        
        def clean_data(obj):
            if isinstance(obj, dict):
                return {k: clean_data(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_data(item) for item in obj]
            elif isinstance(obj, str):
                return clean_string(obj)
            return obj
        
        return clean_data(data)