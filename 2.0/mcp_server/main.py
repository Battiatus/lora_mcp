#!/usr/bin/env python
import os
import sys
import logging
import json
import uuid
import asyncio
import traceback
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s [%(name)s] - %(message)s",
)

logger = logging.getLogger(__name__)

# Pydantic models for API
class ToolRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    session_id: Optional[str] = None

class ToolResponse(BaseModel):
    success: bool
    result: Any
    error: Optional[str] = None

class ListToolsResponse(BaseModel):
    tools: List[Dict[str, Any]]

# Global context storage
contexts: Dict[str, Any] = {}

# Import dependencies
try:
    from playwright.async_api import async_playwright, Browser, BrowserContext, Page
    import nest_asyncio
    nest_asyncio.apply()
    logger.info("Dependencies imported successfully")
except ImportError as e:
    logger.error(f"Failed to import dependencies: {e}")
    sys.exit(1)

# Simplified context management
class SimpleAppContext:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.session_id = None

async def get_or_create_context(session_id: str) -> SimpleAppContext:
    """Get or create a context for the session"""
    if session_id not in contexts:
        logger.info(f"Creating new context for session: {session_id}")
        
        context = SimpleAppContext()
        context.session_id = session_id
        
        # Initialize Playwright
        context.playwright = await async_playwright().start()
        
        # Launch browser
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
        contexts[session_id] = context
        
        logger.info(f"Context created successfully for session: {session_id}")
        
    return contexts[session_id]

async def cleanup_context(session_id: str):
    """Cleanup a specific context"""
    if session_id in contexts:
        context = contexts[session_id]
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
            logger.error(f"Error cleaning up context {session_id}: {e}")
        finally:
            del contexts[session_id]
            logger.info(f"Context {session_id} cleaned up")

# Mock context class for tool functions
class MockContext:
    def __init__(self, app_context: SimpleAppContext):
        self.app_context = app_context
        
    def info(self, message: str):
        logger.info(f"[{self.app_context.session_id}] {message}")
        
    def error(self, message: str):
        logger.error(f"[{self.app_context.session_id}] {message}")
        
    def warning(self, message: str):
        logger.warning(f"[{self.app_context.session_id}] {message}")

# Tool implementations
async def navigate_tool(url: str, ctx: MockContext) -> Dict[str, Any]:
    """Navigate to a specified URL"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Navigating to: {url}")
        
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
        return {"error": f"Failed to navigate to {url}: {str(e)}"}

async def screenshot_tool(ctx: MockContext) -> Dict[str, Any]:
    """Take a screenshot of the current page"""
    try:
        page = ctx.app_context.page
        session_id = ctx.app_context.session_id
        
        # Create screenshot directory
        os.makedirs(f"screenshot/{session_id}", exist_ok=True)
        
        filename = f"screenshot/{session_id}/screenshot_{uuid.uuid4()}.png"
        await page.screenshot(path=filename, full_page=True)
        
        ctx.info(f"Screenshot saved: {filename}")
        return {"filename": filename, "path": filename}
    except Exception as e:
        ctx.error(f"Error taking screenshot: {str(e)}")
        return {"error": f"Failed to take screenshot: {str(e)}"}

async def click_tool(x: int, y: int, ctx: MockContext) -> Dict[str, Any]:
    """Click at specific coordinates"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Clicking at coordinates: ({x}, {y})")
        
        await page.mouse.click(x, y)
        await asyncio.sleep(1)
        
        return {"clicked_at": {"x": x, "y": y}}
    except Exception as e:
        ctx.error(f"Error clicking at ({x}, {y}): {str(e)}")
        return {"error": f"Failed to click at ({x}, {y}): {str(e)}"}

async def scroll_tool(direction: str, amount: int, ctx: MockContext) -> Dict[str, Any]:
    """Scroll the page"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Scrolling {direction} by {amount} pixels")
        
        if direction.lower() == "down":
            await page.evaluate(f"window.scrollBy(0, {amount})")
        elif direction.lower() == "up":
            await page.evaluate(f"window.scrollBy(0, -{amount})")
        else:
            return {"error": f"Invalid direction: {direction}"}
        
        await asyncio.sleep(1)
        
        return {"scrolled": True, "direction": direction, "amount": amount}
    except Exception as e:
        ctx.error(f"Error scrolling {direction}: {str(e)}")
        return {"error": f"Failed to scroll {direction}: {str(e)}"}

async def type_tool(text: str, ctx: MockContext, submit: bool = False) -> Dict[str, Any]:
    """Type text"""
    try:
        page = ctx.app_context.page
        ctx.info(f"Typing text: '{text}'")
        
        await page.keyboard.type(text)
        
        if submit:
            ctx.info("Pressing Enter to submit")
            await page.keyboard.press('Enter')
            await asyncio.sleep(2)
            
        return {"typed": True, "text": text, "submitted": submit}
    except Exception as e:
        ctx.error(f"Error typing text: {str(e)}")
        return {"error": f"Failed to type text: {str(e)}"}

async def get_page_info_tool(ctx: MockContext) -> str:
    """Get current page information"""
    try:
        page = ctx.app_context.page
        title = await page.title()
        return f"Current page: Title='{title}', URL='{page.url}'"
    except Exception as e:
        ctx.error(f"Error getting page info: {str(e)}")
        return f"Error getting page info: {str(e)}"

def write_file_tool(filename: str, content: str, ctx: MockContext) -> Dict[str, Any]:
    """Write content to a file"""
    try:
        session_id = ctx.app_context.session_id
        os.makedirs(f"artefacts/{session_id}", exist_ok=True)
        
        full_path = f"artefacts/{session_id}/{filename}"
        ctx.info(f"Writing to file: {full_path}")
        
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        return {"filename": filename, "path": full_path, "written": True}
    except Exception as e:
        ctx.error(f"Error writing file: {str(e)}")
        return {"error": f"Failed to write file: {str(e)}"}

# Create FastAPI app WITHOUT middleware initially
# app = FastAPI(
#     title="MCP Server HTTP API",
#     description="HTTP API for MCP Server with Playwright automation",
#     version="1.0.0"
# )

# Add CORS headers manually via middleware function
# @app.middleware("http")
# async def add_cors_header(request, call_next):
#     response = await call_next(request)
#     response.headers["Access-Control-Allow-Origin"] = "*"
#     response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
#     response.headers["Access-Control-Allow-Headers"] = "*"
#     response.headers["Access-Control-Allow-Credentials"] = "true"
#     return response

# # Handle OPTIONS requests for CORS
# @app.options("/{full_path:path}")
# async def options_handler():
#     return JSONResponse(
#         content={"message": "OK"},
#         headers={
#             "Access-Control-Allow-Origin": "*",
#             "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
#             "Access-Control-Allow-Headers": "*",
#         }
#     )
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="MCP Server HTTP API",
    description="HTTP API for MCP Server with Playwright automation",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "mcp-server"}

@app.get("/tools", response_model=ListToolsResponse)
async def list_tools():
    """List all available tools"""
    tools = [
        {
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
        {
            "name": "screenshot", 
            "description": "Take a screenshot of the current page",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
            "name": "click",
            "description": "Click at specific coordinates on the page",
            "input_schema": {
                "type": "object",
                "properties": {
                    "x": {"type": "integer", "description": "X coordinate"},
                    "y": {"type": "integer", "description": "Y coordinate"}
                },
                "required": ["x", "y"]
            }
        },
        {
            "name": "scroll",
            "description": "Scroll the page up or down",
            "input_schema": {
                "type": "object", 
                "properties": {
                    "direction": {"type": "string", "enum": ["up", "down"]},
                    "amount": {"type": "integer", "description": "Amount to scroll in pixels"}
                },
                "required": ["direction", "amount"]
            }
        },
        {
            "name": "type",
            "description": "Type text",
            "input_schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Text to type"},
                    "submit": {"type": "boolean", "description": "Whether to press Enter", "default": False}
                },
                "required": ["text"]
            }
        },
        {
            "name": "get_page_info",
            "description": "Get information about the current page",
            "input_schema": {"type": "object", "properties": {}}
        },
        {
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
    ]
    
    return ListToolsResponse(tools=tools)

@app.post("/tools/execute", response_model=ToolResponse)
async def execute_tool(request: ToolRequest):
    """Execute a tool"""
    try:
        session_id = request.session_id or str(uuid.uuid4())
        logger.info(f"Executing tool '{request.tool_name}' for session {session_id}")
        
        # Get or create context
        context = await get_or_create_context(session_id)
        ctx = MockContext(context)
        
        # Route to appropriate tool function
        tool_name = request.tool_name
        arguments = request.arguments
        
        if tool_name == "navigate":
            result = await navigate_tool(arguments["url"], ctx)
        elif tool_name == "screenshot":
            result = await screenshot_tool(ctx)
        elif tool_name == "click":
            result = await click_tool(arguments["x"], arguments["y"], ctx)
        elif tool_name == "scroll":
            result = await scroll_tool(arguments["direction"], arguments["amount"], ctx)
        elif tool_name == "type":
            result = await type_tool(arguments["text"], ctx, arguments.get("submit", False))
        elif tool_name == "get_page_info":
            result = await get_page_info_tool(ctx)
        elif tool_name == "write_file":
            result = write_file_tool(arguments["filename"], arguments["content"], ctx)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown tool: {tool_name}")
            
        logger.info(f"Tool '{tool_name}' executed successfully for session {session_id}")
        return ToolResponse(success=True, result=result)
        
    except Exception as e:
        logger.error(f"Error executing tool {request.tool_name}: {e}")
        traceback.print_exc()
        return ToolResponse(success=False, error=str(e))

@app.get("/resources/{session_id}/{filename}")
async def get_resource(session_id: str, filename: str):
    """Get a resource file"""
    try:
        path = f"artefacts/{session_id}/{filename}"
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Resource not found")
            
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        return {"uri": f"artifact://{session_id}/{filename}", "content": content}
        
    except Exception as e:
        logger.error(f"Error getting resource: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/sessions/{session_id}")
async def cleanup_session(session_id: str):
    """Cleanup a session"""
    try:
        await cleanup_context(session_id)
        return {"message": f"Session {session_id} cleaned up successfully"}
    except Exception as e:
        logger.error(f"Error cleaning up session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)