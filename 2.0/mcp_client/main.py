import os
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str

class MCPClient:
    """Client for communicating with MCP Server"""
    
    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip('/')
        self.session_id = None
        
    async def list_tools(self) -> List[Dict[str, Any]]:
        """List available tools from MCP server"""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.server_url}/tools")
            response.raise_for_status()
            return response.json()["tools"]
            
    async def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool on the MCP server"""
        async with httpx.AsyncClient(timeout=300.0) as client:
            payload = {
                "tool_name": tool_name,
                "arguments": arguments,
                "session_id": self.session_id
            }
            response = await client.post(f"{self.server_url}/tools/execute", json=payload)
            response.raise_for_status()
            return response.json()

class LLMProcessor:
    """Processes messages and determines if tools should be used"""
    
    def __init__(self, mcp_client: MCPClient):
        self.mcp_client = mcp_client
        self.tools = []
        
    async def initialize(self):
        """Initialize by loading available tools"""
        self.tools = await self.mcp_client.list_tools()
        logger.info(f"Loaded {len(self.tools)} tools")
        
    def extract_tool_request(self, message: str) -> Optional[Dict[str, Any]]:
        """Extract tool request from message"""
        # Simple keyword-based detection
        message_lower = message.lower()
        
        if "navigate" in message_lower and ("http" in message_lower or "www" in message_lower):
            # Extract URL
            words = message.split()
            url = None
            for word in words:
                if word.startswith(("http://", "https://", "www.")):
                    url = word
                    break
            if url:
                return {"tool": "navigate", "arguments": {"url": url}}
                
        elif "screenshot" in message_lower:
            return {"tool": "screenshot", "arguments": {}}
            
        elif "click" in message_lower:
            # Try to extract coordinates
            import re
            coords = re.findall(r'\d+', message)
            if len(coords) >= 2:
                return {"tool": "click", "arguments": {"x": int(coords[0]), "y": int(coords[1])}}
                
        elif "scroll" in message_lower:
            direction = "down" if "down" in message_lower else "up"
            amount = 300  # Default
            import re
            numbers = re.findall(r'\d+', message)
            if numbers:
                amount = int(numbers[0])
            return {"tool": "scroll", "arguments": {"direction": direction, "amount": amount}}
            
        elif "type" in message_lower:
            # Extract text to type
            if '"' in message:
                text = message.split('"')[1]
                return {"tool": "type", "arguments": {"text": text}}
                
        return None
        
    async def process_message(self, message: str) -> str:
        """Process a user message and return response"""
        # Check if this is a tool request
        tool_request = self.extract_tool_request(message)
        
        if tool_request:
            try:
                result = await self.mcp_client.execute_tool(
                    tool_request["tool"],
                    tool_request["arguments"]
                )
                
                if result["success"]:
                    return f"✅ Tool '{tool_request['tool']}' executed successfully. Result: {result['result']}"
                else:
                    return f"❌ Tool execution failed: {result.get('error', 'Unknown error')}"
                    
            except Exception as e:
                logger.error(f"Error executing tool: {e}")
                return f"❌ Error executing tool: {str(e)}"
        else:
            # Regular chat response
            return f"I understand you want to: {message}. I can help with web automation tasks like navigation, screenshots, clicking, scrolling, and typing. Try commands like 'navigate to https://example.com' or 'take a screenshot'."

# FastAPI app
app = FastAPI(title="MCP Client", description="Web interface for MCP automation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize MCP client
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8080")
mcp_client = MCPClient(MCP_SERVER_URL)
llm_processor = LLMProcessor(mcp_client)

@app.on_event("startup")
async def startup_event():
    """Initialize the LLM processor on startup"""
    await llm_processor.initialize()

@app.get("/", response_class=HTMLResponse)
async def get_chat_interface():
    """Serve the chat interface"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>MCP Web Automation Chat</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {
                font-family: Arial, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .chat-container {
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .chat-messages {
                height: 400px;
                overflow-y: auto;
                border: 1px solid #ddd;
                padding: 10px;
                margin-bottom: 20px;
                background-color: #fafafa;
            }
            .message {
                margin-bottom: 10px;
                padding: 8px 12px;
                border-radius: 6px;
            }
            .user-message {
                background-color: #007bff;
                color: white;
                text-align: right;
            }
            .assistant-message {
                background-color: #e9ecef;
                color: #333;
            }
            .input-container {
                display: flex;
                gap: 10px;
            }
            #messageInput {
                flex: 1;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 5px;
                font-size: 16px;
            }
            #sendButton {
                padding: 10px 20px;
                background-color: #007bff;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            }
            #sendButton:hover {
                background-color: #0056b3;
            }
            #sendButton:disabled {
                background-color: #6c757d;
                cursor: not-allowed;
            }
            .examples {
                margin-top: 20px;
                padding: 15px;
                background-color: #e7f3ff;
                border-radius: 5px;
            }
            .examples h3 {
                margin-top: 0;
                color: #0056b3;
            }
            .example {
                background-color: white;
                padding: 8px;
                margin: 5px 0;
                border-radius: 3px;
                cursor: pointer;
                border: 1px solid #ddd;
            }
            .example:hover {
                background-color: #f8f9fa;
            }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <h1>🤖 MCP Web Automation Chat</h1>
            <div id="chatMessages" class="chat-messages"></div>
            <div class="input-container">
                <input type="text" id="messageInput" placeholder="Type your message here..." />
                <button id="sendButton">Send</button>
            </div>
            
            <div class="examples">
                <h3>Example Commands:</h3>
                <div class="example" onclick="setMessage('navigate to https://example.com')">
                    📍 navigate to https://example.com
                </div>
                <div class="example" onclick="setMessage('take a screenshot')">
                    📸 take a screenshot
                </div>
                <div class="example" onclick="setMessage('click at 100 200')">
                    👆 click at 100 200
                </div>
                <div class="example" onclick="setMessage('scroll down 300')">
                    📜 scroll down 300
                </div>
                <div class="example" onclick="setMessage('type \"hello world\"')">
                    ⌨️ type "hello world"
                </div>
            </div>
        </div>

        <script>
            let sessionId = null;

            function addMessage(content, isUser) {
                const messagesDiv = document.getElementById('chatMessages');
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;
                messageDiv.textContent = content;
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            function setMessage(text) {
                document.getElementById('messageInput').value = text;
            }

            async function sendMessage() {
                const input = document.getElementById('messageInput');
                const button = document.getElementById('sendButton');
                const message = input.value.trim();
                
                if (!message) return;

                // Disable input while processing
                input.disabled = true;
                button.disabled = true;
                button.textContent = 'Sending...';

                // Add user message to chat
                addMessage(message, true);
                input.value = '';

                try {
                    const response = await fetch('/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: message,
                            session_id: sessionId
                        })
                    });

                    const data = await response.json();
                    sessionId = data.session_id;
                    
                    // Add assistant response to chat
                    addMessage(data.response, false);
                    
                } catch (error) {
                    addMessage('Error: ' + error.message, false);
                }

                // Re-enable input
                input.disabled = false;
                button.disabled = false;
                button.textContent = 'Send';
                input.focus();
            }

            // Event listeners
            document.getElementById('sendButton').addEventListener('click', sendMessage);
            document.getElementById('messageInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    sendMessage();
                }
            });

            // Focus input on load
            document.getElementById('messageInput').focus();
            
            // Add welcome message
            addMessage('👋 Welcome! I can help you automate web tasks. Try the example commands below or type your own.', false);
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Handle chat messages"""
    try:
        # Set session ID for MCP client
        if request.session_id:
            mcp_client.session_id = request.session_id
        else:
            import uuid
            mcp_client.session_id = str(uuid.uuid4())
            
        # Process the message
        response = await llm_processor.process_message(request.message)
        
        return ChatResponse(
            response=response,
            session_id=mcp_client.session_id
        )
        
    except Exception as e:
        logger.error(f"Error processing chat message: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mcp-client"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    uvicorn.run(app, host="0.0.0.0", port=port)