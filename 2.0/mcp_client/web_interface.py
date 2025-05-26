import asyncio
import json
import logging
import os
import sys
import uuid
from typing import Dict, Any, Optional
import traceback
from datetime import datetime

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Import your existing HTTP MCP client
from main import ChatSession, HTTPServer, LLMClient, Configuration

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Pydantic models
class ChatMessage(BaseModel):
    message: str
    session_id: Optional[str] = None

class TaskMessage(BaseModel):
    task_description: str
    session_id: Optional[str] = None

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        
    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket
        
    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]
            
    async def send_message(self, session_id: str, message: Dict[str, Any]):
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {session_id}: {e}")
                self.disconnect(session_id)

# Global instances
manager = ConnectionManager()
chat_sessions: Dict[str, ChatSession] = {}

# FastAPI app
app = FastAPI(title="MCP Advanced Interface", description="Professional interface for MCP automation")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def get_or_create_chat_session(session_id: str) -> ChatSession:
    """Get or create a chat session"""
    if session_id not in chat_sessions:
        # Load configuration
        config_loader = Configuration()
        config_loader.load_env()
        
        # Create HTTP server config
        http_server_config = {
            "name": "gemini_http_server",
            "config": {
                "base_url": os.getenv("MCP_SERVER_URL", "http://localhost:8080")
            }
        }
        
        # LLM configuration
        llm_project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
        llm_location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        llm_model = os.getenv("LLM_MODEL_NAME", "gemini-2.0-flash")
        
        # Initialize components
        gemini_server = HTTPServer(
            http_server_config["name"],
            http_server_config["config"],
        )
        
        llm_client = LLMClient(
            model_name=llm_model, project=llm_project, location=llm_location
        )
        
        # Create chat session
        chat_session = ChatSession(gemini_server, llm_client)
        
        # Initialize the session
        await chat_session._prepare_llm()
        
        chat_sessions[session_id] = chat_session
        
    return chat_sessions[session_id]

@app.get("/", response_class=HTMLResponse)
async def get_interface():
    """Serve the main interface"""
    return FileResponse("static/index.html")

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            
            # Get or create chat session
            chat_session = await get_or_create_chat_session(session_id)
            
            if message_data["type"] == "chat":
                await handle_chat_message(session_id, message_data["message"], chat_session)
            elif message_data["type"] == "task":
                await handle_task_execution(session_id, message_data["task"], chat_session)
                
    except WebSocketDisconnect:
        manager.disconnect(session_id)
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        await manager.send_message(session_id, {
            "type": "error",
            "message": f"An error occurred: {str(e)}"
        })

async def handle_chat_message(session_id: str, message: str, chat_session: ChatSession):
    """Handle a chat message"""
    try:
        # Send typing indicator
        await manager.send_message(session_id, {
            "type": "typing",
            "message": "Assistant is thinking..."
        })
        
        # Add user message to conversation
        chat_session.conversation.add_message("user", message)
        
        # Get LLM response
        llm_response = chat_session.llm_client.get_response(message)
        parsed_tool_call = chat_session.llm_client.extract_tool_call_json(llm_response)
        
        if parsed_tool_call:
            # Tool call detected
            await manager.send_message(session_id, {
                "type": "assistant_tool_call",
                "message": llm_response,
                "tool_name": parsed_tool_call.get("tool"),
                "tool_args": parsed_tool_call.get("arguments", {})
            })
            
            # Execute the tool
            await execute_tool_with_feedback(session_id, parsed_tool_call, chat_session)
            
        else:
            # Regular response
            chat_session.conversation.add_message("assistant", llm_response)
            await manager.send_message(session_id, {
                "type": "assistant_message",
                "message": llm_response
            })
            
    except Exception as e:
        logger.error(f"Error handling chat message: {e}")
        await manager.send_message(session_id, {
            "type": "error",
            "message": f"Error processing message: {str(e)}"
        })

async def handle_task_execution(session_id: str, task_description: str, chat_session: ChatSession):
    """Handle complex task execution"""
    try:
        await manager.send_message(session_id, {
            "type": "task_started",
            "message": f"Starting task: {task_description}"
        })
        
        # Add task to conversation
        chat_session.conversation.add_message("user", task_description)
        
        # Initial LLM response
        llm_response = chat_session.llm_client.get_response(task_description)
        parsed_tool_call = chat_session.llm_client.extract_tool_call_json(llm_response)
        
        if not parsed_tool_call:
            await manager.send_message(session_id, {
                "type": "task_completed",
                "message": llm_response,
                "steps": 0
            })
            return
        
        chat_session.conversation.add_message("assistant", llm_response)
        
        # Task execution loop
        step_count = 0
        max_steps = 20
        
        while parsed_tool_call and step_count < max_steps:
            step_count += 1
            
            await manager.send_message(session_id, {
                "type": "task_step",
                "step": step_count,
                "tool_name": parsed_tool_call.get("tool"),
                "tool_args": parsed_tool_call.get("arguments", {}),
                "message": f"Step {step_count}: Executing {parsed_tool_call.get('tool')}"
            })
            
            # Execute tool
            tool_result = await execute_tool_with_feedback(session_id, parsed_tool_call, chat_session)
            
            # Check if conversation needs summarization
            if chat_session.conversation.should_summarize():
                await manager.send_message(session_id, {
                    "type": "system_message",
                    "message": "Optimizing conversation memory..."
                })
                chat_session.conversation.summarize_conversation()
            
            # Get next step
            next_prompt = "Continue with the task. What's the next step?"
            llm_response = chat_session.llm_client.get_response(next_prompt)
            parsed_tool_call = chat_session.llm_client.extract_tool_call_json(llm_response)
            
            chat_session.conversation.add_message("assistant", llm_response)
            
            if not parsed_tool_call:
                await manager.send_message(session_id, {
                    "type": "task_completed",
                    "message": llm_response,
                    "steps": step_count
                })
                break
        
        if step_count >= max_steps:
            await manager.send_message(session_id, {
                "type": "task_completed",
                "message": "Task execution reached maximum steps limit. Please review the results.",
                "steps": step_count
            })
            
    except Exception as e:
        logger.error(f"Error handling task execution: {e}")
        await manager.send_message(session_id, {
            "type": "error",
            "message": f"Error executing task: {str(e)}"
        })

async def execute_tool_with_feedback(session_id: str, tool_call: Dict[str, Any], chat_session: ChatSession):
    """Execute a tool and provide real-time feedback"""
    try:
        tool_name = tool_call.get("tool")
        arguments = tool_call.get("arguments", {})
        tool_id = str(uuid.uuid4())
        
        # Send tool execution start
        await manager.send_message(session_id, {
            "type": "tool_executing",
            "tool_name": tool_name,
            "message": f"Executing {tool_name}..."
        })
        
        # Execute the tool
        result = await chat_session.gemini_server.execute_tool(tool_name, arguments, tool_id)
        
        # Process result
        if "toolResult" in result and "content" in result["toolResult"]:
            content = result["toolResult"]["content"]
            
            # Check for different types of content
            has_image = any("image" in item for item in content if isinstance(item, dict))
            has_error = any("error" in str(item).lower() for item in content if isinstance(item, dict))
            
            if has_error:
                await manager.send_message(session_id, {
                    "type": "tool_error",
                    "tool_name": tool_name,
                    "message": f"Tool execution failed: {content}"
                })
            elif has_image:
                await manager.send_message(session_id, {
                    "type": "tool_success_image",
                    "tool_name": tool_name,
                    "message": f"✅ {tool_name} completed successfully - Screenshot captured",
                    "content": content
                })
            else:
                # Extract meaningful text from content
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
                    "result": " | ".join(text_content) if text_content else "Operation completed"
                })
            
            # Add tool result to conversation
            chat_session.conversation.add_message("user", content)
            
        return result
        
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {e}")
        await manager.send_message(session_id, {
            "type": "tool_error",
            "tool_name": tool_name,
            "message": f"Tool execution failed: {str(e)}"
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