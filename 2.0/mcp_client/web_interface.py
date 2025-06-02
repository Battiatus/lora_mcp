import asyncio
import json
import logging
import os
import sys
import uuid
import hashlib
import secrets
from typing import Dict, Any, Optional, List
import traceback
from datetime import datetime, timedelta
import sqlite3
from pathlib import Path
import base64
import markdown
import pdfkit
import csv
import io

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, status, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import uvicorn
import jwt
from passlib.context import CryptContext

import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import ChatSession, HTTPServer, LLMClient, Configuration

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Security configuration
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# User credentials (in production, use a proper database)
USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash(os.getenv("ADMIN_PASSWORD", "secure_password_123")),
        "avatar": "/static/default-avatar.png"
    }
}

# Database setup for conversations
def init_db():
    """Initialize SQLite database for conversations"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            user_id TEXT NOT NULL,
            messages TEXT NOT NULL
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS screenshots (
            id TEXT PRIMARY KEY,
            conversation_id TEXT,
            filename TEXT NOT NULL,
            path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Initialize database
init_db()

# Models
class LoginRequest(BaseModel):
    username: str
    password: str

class Message(BaseModel):
    type: str
    content: str
    conversation_id: Optional[str] = None

class ConversationCreate(BaseModel):
    title: str

# WebSocket connection manager with enhanced features
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.active_tasks: Dict[str, bool] = {}  # Track running tasks
        
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        self.active_tasks[session_id] = False
        
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
        if session_id in self.active_tasks:
            del self.active_tasks[session_id]
            
    async def send_message(self, session_id: str, message: Dict[str, Any]):
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {session_id}: {e}")
                self.disconnect(session_id)
                
    def set_task_status(self, session_id: str, is_running: bool):
        self.active_tasks[session_id] = is_running
        
    def is_task_running(self, session_id: str) -> bool:
        return self.active_tasks.get(session_id, False)

# Global instances
manager = ConnectionManager()
chat_sessions: Dict[str, ChatSession] = {}

# FastAPI app
app = FastAPI(title="MCP Advanced Interface", description="Professional interface for MCP automation")

# Security middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def authenticate_user(username: str, password: str):
    user = USERS_DB.get(username)
    if not user or not verify_password(password, user["hashed_password"]):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = USERS_DB.get(username)
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# Database functions
def save_conversation(conversation_id: str, title: str, messages: List[Dict], user_id: str):
    """Save conversation to database"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT OR REPLACE INTO conversations (id, title, messages, user_id, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ''', (conversation_id, title, json.dumps(messages), user_id))
    
    conn.commit()
    conn.close()

def get_conversations(user_id: str) -> List[Dict]:
    """Get all conversations for a user"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, title, created_at, updated_at 
        FROM conversations 
        WHERE user_id = ? 
        ORDER BY updated_at DESC
    ''', (user_id,))
    
    conversations = []
    for row in cursor.fetchall():
        conversations.append({
            "id": row[0],
            "title": row[1],
            "created_at": row[2],
            "updated_at": row[3]
        })
    
    conn.close()
    return conversations

def get_conversation(conversation_id: str, user_id: str) -> Optional[Dict]:
    """Get a specific conversation"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, title, messages, created_at, updated_at 
        FROM conversations 
        WHERE id = ? AND user_id = ?
    ''', (conversation_id, user_id))
    
    row = cursor.fetchone()
    if row:
        conversation = {
            "id": row[0],
            "title": row[1],
            "messages": json.loads(row[2]),
            "created_at": row[3],
            "updated_at": row[4]
        }
        conn.close()
        return conversation
    
    conn.close()
    return None

def save_screenshot(conversation_id: str, filename: str, path: str):
    """Save screenshot info to database"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    
    screenshot_id = str(uuid.uuid4())
    cursor.execute('''
        INSERT INTO screenshots (id, conversation_id, filename, path)
        VALUES (?, ?, ?, ?)
    ''', (screenshot_id, conversation_id, filename, path))
    
    conn.commit()
    conn.close()
    return screenshot_id

def get_conversation_screenshots(conversation_id: str) -> List[Dict]:
    """Get all screenshots for a conversation"""
    conn = sqlite3.connect('conversations.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, filename, path, created_at 
        FROM screenshots 
        WHERE conversation_id = ? 
        ORDER BY created_at ASC
    ''', (conversation_id,))
    
    screenshots = []
    for row in cursor.fetchall():
        screenshots.append({
            "id": row[0],
            "filename": row[1],
            "path": row[2],
            "created_at": row[3]
        })
    
    conn.close()
    return screenshots

# Export functions
def export_to_markdown(messages: List[Dict], title: str) -> str:
    """Export conversation to markdown"""
    md_content = f"# {title}\n\n"
    md_content += f"*Exported on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n\n"
    
    for msg in messages:
        if msg["role"] == "user":
            md_content += f"## User\n{msg['content']}\n\n"
        elif msg["role"] == "assistant":
            md_content += f"## Assistant\n{msg['content']}\n\n"
    
    return md_content

def export_to_html(messages: List[Dict], title: str) -> str:
    """Export conversation to HTML"""
    md_content = export_to_markdown(messages, title)
    html_content = markdown.markdown(md_content, extensions=['tables', 'fenced_code'])
    
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{title}</title>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }}
            h1, h2 {{ color: #333; }}
            pre {{ background: #f5f5f5; padding: 10px; border-radius: 5px; }}
            code {{ background: #f0f0f0; padding: 2px 4px; border-radius: 3px; }}
        </style>
    </head>
    <body>
        {html_content}
    </body>
    </html>
    """

async def get_or_create_chat_session(session_id: str) -> ChatSession:
    """Get or create a chat session"""
    if session_id not in chat_sessions:
        config_loader = Configuration()
        config_loader.load_env()
        
        http_server_config = {
            "name": "gemini_http_server",
            "config": {
                "base_url": os.getenv("MCP_SERVER_URL", "http://localhost:8080")
            }
        }
        
        llm_project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
        llm_location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        llm_model = os.getenv("LLM_MODEL_NAME", "gemini-2.0-flash")
        
        gemini_server = HTTPServer(
            http_server_config["name"],
            http_server_config["config"],
        )
        
        llm_client = LLMClient(
            model_name=llm_model, project=llm_project, location=llm_location
        )
        
        chat_session = ChatSession(gemini_server, llm_client)
        await chat_session._prepare_llm()
        
        chat_sessions[session_id] = chat_session
        
    return chat_sessions[session_id]

# Routes
@app.post("/auth/login")
async def login(login_request: LoginRequest):
    """Authenticate user and return JWT token"""
    user = authenticate_user(login_request.username, login_request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": user["username"],
            "avatar": user["avatar"]
        }
    }

@app.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    return {
        "username": current_user["username"],
        "avatar": current_user["avatar"]
    }

@app.get("/", response_class=HTMLResponse)
async def get_interface():
    """Serve the main interface"""
    return FileResponse("static/index.html")

@app.get("/conversations")
async def get_user_conversations(current_user: dict = Depends(get_current_user)):
    """Get all conversations for the current user"""
    conversations = get_conversations(current_user["username"])
    return {"conversations": conversations}

@app.post("/conversations")
async def create_conversation(
    conversation: ConversationCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new conversation"""
    conversation_id = str(uuid.uuid4())
    save_conversation(conversation_id, conversation.title, [], current_user["username"])
    return {"id": conversation_id, "title": conversation.title}

@app.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get conversation details"""
    conversation = get_conversation(conversation_id, current_user["username"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    screenshots = get_conversation_screenshots(conversation_id)
    conversation["screenshots"] = screenshots
    
    return conversation

@app.get("/conversations/{conversation_id}/export/{format}")
async def export_conversation(
    conversation_id: str,
    format: str,
    current_user: dict = Depends(get_current_user)
):
    """Export conversation in various formats"""
    conversation = get_conversation(conversation_id, current_user["username"])
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if format == "markdown":
        content = export_to_markdown(conversation["messages"], conversation["title"])
        return JSONResponse(
            content={"content": content, "filename": f"{conversation['title']}.md"},
            media_type="application/json"
        )
    elif format == "html":
        content = export_to_html(conversation["messages"], conversation["title"])
        return JSONResponse(
            content={"content": content, "filename": f"{conversation['title']}.html"},
            media_type="application/json"
        )
    elif format == "json":
        return JSONResponse(
            content={"content": json.dumps(conversation, indent=2), "filename": f"{conversation['title']}.json"},
            media_type="application/json"
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported format")

@app.get("/api/limits")
async def get_api_limits(current_user: dict = Depends(get_current_user)):
    """Get API usage limits and remaining calls"""
    # This would integrate with your actual API limit tracking
    return {
        "total_calls": 1000,
        "used_calls": 150,
        "remaining_calls": 850,
        "reset_date": "2024-02-01T00:00:00Z"
    }

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            if message_data["type"] == "stop_execution":
                manager.set_task_status(session_id, False)
                await manager.send_message(session_id, {
                    "type": "execution_stopped",
                    "message": "Execution stopped by user"
                })
                continue
            
            chat_session = await get_or_create_chat_session(session_id)
            
            if message_data["type"] == "chat":
                await handle_chat_message(session_id, message_data, chat_session)
            elif message_data["type"] == "task":
                await handle_task_execution(session_id, message_data, chat_session)
                
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        await manager.send_message(session_id, {
            "type": "error",
            "message": f"An error occurred: {str(e)}"
        })

async def handle_chat_message(session_id: str, message_data: dict, chat_session: ChatSession):
    """Handle a chat message with progress tracking"""
    try:
        message = message_data["message"]
        conversation_id = message_data.get("conversation_id")
        
        # Set task as running
        manager.set_task_status(session_id, True)
        
        # Send progress update
        await manager.send_message(session_id, {
            "type": "progress_update",
            "step": "processing",
            "message": "Processing your request...",
            "progress": 10
        })
        
        # Check if this looks like a task requiring tools
        if any(keyword in message.lower() for keyword in ["search", "navigate", "browse", "screenshot", "click", "research", "analyze", "find", "download"]):
            await handle_task_execution(session_id, message_data, chat_session)
        else:
            # Regular chat mode
            chat_session.conversation.add_message("user", message)
            
            await manager.send_message(session_id, {
                "type": "progress_update",
                "step": "generating",
                "message": "Generating response...",
                "progress": 50
            })
            
            if chat_session.conversation.should_summarize():
                await manager.send_message(session_id, {
                    "type": "progress_update",
                    "step": "optimizing",
                    "message": "Optimizing conversation memory...",
                    "progress": 30
                })
                chat_session.conversation.summarize_conversation()
            
            llm_response = chat_session.llm_client.get_response(message)
            parsed_tool_call = chat_session.llm_client.extract_tool_call_json(llm_response)
            
            if parsed_tool_call:
                chat_session.conversation.add_message("assistant", llm_response)
                
                await manager.send_message(session_id, {
                    "type": "assistant_tool_call",
                    "message": llm_response,
                    "tool_name": parsed_tool_call.get("tool"),
                    "tool_args": parsed_tool_call.get("arguments", {}),
                    "conversation_id": conversation_id
                })
                
                await execute_tool_with_feedback(session_id, parsed_tool_call, chat_session, conversation_id)
                
                next_prompt = "Continue with the task. What's the next step?"
                follow_up_response = chat_session.llm_client.get_response(next_prompt)
                
                chat_session.conversation.add_message("assistant", follow_up_response)
                await manager.send_message(session_id, {
                    "type": "assistant_message",
                    "message": follow_up_response,
                    "conversation_id": conversation_id,
                    "final": True
                })
                
            else:
                chat_session.conversation.add_message("assistant", llm_response)
                await manager.send_message(session_id, {
                    "type": "assistant_message",
                    "message": llm_response,
                    "conversation_id": conversation_id,
                    "final": True
                })
        
        # Save conversation if conversation_id provided
        if conversation_id:
            save_conversation(
                conversation_id, 
                "Chat Session", 
                [{"role": msg["role"], "content": str(msg["content"])} for msg in chat_session.conversation.messages],
                "admin"  # Use actual user from session
            )
        
        # Set task as completed
        manager.set_task_status(session_id, False)
        
        await manager.send_message(session_id, {
            "type": "progress_complete",
            "message": "Task completed successfully!",
            "progress": 100
        })
            
    except Exception as e:
        manager.set_task_status(session_id, False)
        logger.error(f"Error handling chat message: {e}")
        traceback.print_exc()
        await manager.send_message(session_id, {
            "type": "error",
            "message": f"Error processing message: {str(e)}"
        })

async def handle_task_execution(session_id: str, message_data: dict, chat_session: ChatSession):
    """Handle complex task execution with detailed progress tracking"""
    try:
        task_description = message_data["message"]
        conversation_id = message_data.get("conversation_id")
        
        manager.set_task_status(session_id, True)
        
        await manager.send_message(session_id, {
            "type": "task_started",
            "message": f"Starting task: {task_description}",
            "conversation_id": conversation_id
        })
        
        chat_session.conversation.add_message("user", task_description)
        
        llm_response = chat_session.llm_client.get_response(task_description)
        parsed_tool_call = chat_session.llm_client.extract_tool_call_json(llm_response)
        
        if not parsed_tool_call:
            chat_session.conversation.add_message("assistant", llm_response)
            await manager.send_message(session_id, {
                "type": "task_completed",
                "message": llm_response,
                "steps": 0,
                "conversation_id": conversation_id,
                "final": True
            })
            manager.set_task_status(session_id, False)
            return
        
        chat_session.conversation.add_message("assistant", llm_response)
        
        await manager.send_message(session_id, {
            "type": "assistant_message",
            "message": llm_response,
            "conversation_id": conversation_id
        })
        
        # Task automation loop with progress tracking
        stop_reason = "tool_use"
        step_count = 0
        max_steps = 20
        
        while stop_reason == "tool_use" and step_count < max_steps and manager.is_task_running(session_id):
            step_count += 1
            progress = min(90, (step_count / max_steps) * 80 + 10)
            
            await manager.send_message(session_id, {
                "type": "progress_update",
                "step": f"step_{step_count}",
                "message": f"Step {step_count}: Executing {parsed_tool_call.get('tool')}",
                "progress": progress,
                "tool_name": parsed_tool_call.get("tool"),
                "tool_args": parsed_tool_call.get("arguments", {}),
                "conversation_id": conversation_id
            })
            
            # Execute the tool
            tool_calls = [{
                "tool": parsed_tool_call.get("tool"),
                "arguments": parsed_tool_call.get("arguments", {}),
                "toolUseId": str(uuid.uuid4())
            }]
            
            tool_results = await process_tool_requests(tool_calls, chat_session, conversation_id)
            
            chat_session.conversation.add_message("user", tool_results["content"])
            
            if chat_session.conversation.should_summarize():
                await manager.send_message(session_id, {
                    "type": "progress_update",
                    "step": "optimizing",
                    "message": "Optimizing conversation memory...",
                    "progress": progress,
                    "conversation_id": conversation_id
                })
                chat_session.conversation.summarize_conversation()
            
            chat_session.conversation.remove_media_except_last_turn()
            
            next_prompt = "Continue with the task. What's the next step?"
            llm_response = chat_session.llm_client.get_response(next_prompt)
            
            parsed_tool_call = chat_session.llm_client.extract_tool_call_json(llm_response)
            
            chat_session.conversation.add_message("assistant", llm_response)
            
            await manager.send_message(session_id, {
                "type": "assistant_message",
                "message": llm_response,
                "conversation_id": conversation_id
            })
            
            if parsed_tool_call:
                stop_reason = "tool_use"
            else:
                stop_reason = "content_stopped"
                await manager.send_message(session_id, {
                    "type": "task_completed",
                    "message": "Task completed successfully!",
                    "steps": step_count,
                    "conversation_id": conversation_id,
                    "final": True
                })
                break
        
        if step_count >= max_steps:
            await manager.send_message(session_id, {
                "type": "task_completed",
                "message": "Task execution reached maximum steps limit. Please review the results.",
                "steps": step_count,
                "conversation_id": conversation_id,
                "final": True
            })
        
        # Save conversation
        if conversation_id:
            save_conversation(
                conversation_id,
                f"Task: {task_description[:50]}...",
                [{"role": msg["role"], "content": str(msg["content"])} for msg in chat_session.conversation.messages],
                "admin"
            )
            
            # Send final screenshots
            screenshots = get_conversation_screenshots(conversation_id)
            if screenshots:
                await manager.send_message(session_id, {
                    "type": "screenshots_summary",
                    "screenshots": screenshots,
                    "conversation_id": conversation_id
                })
        
        manager.set_task_status(session_id, False)
        
    except Exception as e:
        manager.set_task_status(session_id, False)
        logger.error(f"Error handling task execution: {e}")
        traceback.print_exc()
        await manager.send_message(session_id, {
            "type": "error",
            "message": f"Error executing task: {str(e)}"
        })

async def process_tool_requests(tool_calls, chat_session: ChatSession, conversation_id: str = None):
    """Process all tool calls in a response"""
    consolidated_result = {
        "role": "user",
        "content": []
    }
    
    for tool_call in tool_calls:
        tool_name = tool_call.get("tool")
        tool_id = tool_call.get("toolUseId", str(uuid.uuid4()))
        arguments = tool_call.get("arguments", {})
        
        result = await chat_session.gemini_server.execute_tool(tool_name, arguments, tool_id)
        
        # Check for screenshots and save them
        if "toolResult" in result and "content" in result["toolResult"]:
            for content_item in result["toolResult"]["content"]:
                if isinstance(content_item, dict) and "image" in content_item:
                    # Save screenshot info
                    if conversation_id:
                        filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                        save_screenshot(conversation_id, filename, f"/screenshots/{filename}")
            
            consolidated_result["content"].extend(result["toolResult"]["content"])
    
    return consolidated_result

async def execute_tool_with_feedback(session_id: str, tool_call: Dict[str, Any], chat_session: ChatSession, conversation_id: str = None):
    """Execute a tool and provide real-time feedback"""
    try:
        tool_name = tool_call.get("tool")
        arguments = tool_call.get("arguments", {})
        tool_id = str(uuid.uuid4())
        
        await manager.send_message(session_id, {
            "type": "tool_executing",
            "tool_name": tool_name,
            "message": f"Executing {tool_name}...",
            "conversation_id": conversation_id
        })
        
        result = await chat_session.gemini_server.execute_tool(tool_name, arguments, tool_id)
        
        if "toolResult" in result and "content" in result["toolResult"]:
            content = result["toolResult"]["content"]
            
            has_image = any("image" in item for item in content if isinstance(item, dict))
            has_error = any("error" in str(item).lower() for item in content if isinstance(item, dict))
            
            if has_error:
                await manager.send_message(session_id, {
                    "type": "tool_error",
                    "tool_name": tool_name,
                    "message": f"Tool execution failed: {content}",
                    "conversation_id": conversation_id
                })
            elif has_image:
                # Save screenshot
                if conversation_id:
                    filename = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
                    save_screenshot(conversation_id, filename, f"/screenshots/{filename}")
                
                await manager.send_message(session_id, {
                    "type": "tool_success_image",
                    "tool_name": tool_name,
                    "message": f"✅ {tool_name} completed successfully - Screenshot captured",
                    "content": content,
                    "conversation_id": conversation_id
                })
            else:
                text_content = []
                for item in content:
                    if isinstance(item, dict):
                        if "text" in item:
                            text_content.append(item["text"])
                        elif "json" in item and "text" in item["json"]:
                            text_content.append(item["json"]["text"])
                
                await manager.send_message(session_id, {
                    "type": "tool_success",
                    "tool_name": tool_name,
                    "message": f"✅ {tool_name} completed successfully",
                    "result": " | ".join(text_content) if text_content else "Operation completed",
                    "conversation_id": conversation_id
                })
            
            chat_session.conversation.add_message("user", content)
            
        return result
        
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {e}")
        await manager.send_message(session_id, {
            "type": "tool_error",
            "tool_name": tool_name,
            "message": f"Tool execution failed: {str(e)}",
            "conversation_id": conversation_id
        })
        return None

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "mcp-web-interface"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8082))
    uvicorn.run(app, host="0.0.0.0", port=port)