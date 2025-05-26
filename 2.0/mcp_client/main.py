import asyncio
import json
import logging
import os
import re
import sys
import base64
import uuid
from typing import Any, Dict, List, Optional, Union
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import uvicorn
import httpx

# Import necessary components
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)

# Constants for conversation management
SUMMARIZATION_TOKEN_THRESHOLD = 50000  # Threshold for triggering summarization
KEEP_LAST_TURNS = 1  # Number of recent turns to keep intact during summarization

# System prompt that instructs the model how to use the tools
SYSTEM_PROMPT = """You are an advanced research assistant with web navigation and vision capabilities.

## RESEARCH METHODOLOGY
- Always begin by establishing a structured research plan with clear objectives
- Divide your research into relevant thematic categories (e.g., key figures, trends, competition, innovations)
- Use an iterative approach: initial research, analysis, then targeted searches to deepen understanding
- For each important topic, consult at least 3-5 different sources for cross-verification
- Prioritize official, institutional, and specialized industry sources
- Systematically document the exact URL, title, and date of each source consulted

## NAVIGATION AND INFORMATION GATHERING
- Carefully analyze screenshots to identify all relevant elements
- Interact with elements in a logical order: search fields → input → validation
- Take screenshots between each important step to document your journey
- For complex searches, use advanced operators (site:, filetype:, etc.)
- Systematically scroll to explore all available content
- When facing limited results, reformulate your queries with synonyms or related terms

## ANALYSIS AND SYNTHESIS
- Organize information by themes, trends, and relative importance
- Explicitly identify quantitative data (figures, percentages, changes)
- Clearly distinguish established facts from opinions or forecasts
- Note contradictions between sources and analyze their relative credibility
- Identify weak signals and emerging trends beyond obvious information
- Contextualize data in their temporal, geographical, and sectoral environment

## REPORT GENERATION
- Structure your reports with a clear hierarchy: table of contents, introduction, thematic sections, conclusion
- Systematically include: quantitative data, qualitative analyses, and practical implications
- Use markdown format for optimal presentation with titles, subtitles, and lists
- Precisely cite all your sources with appropriate tags according to the required format
- Limit direct quotations to fewer than 25 words and avoid reproducing protected content
- Present concise syntheses (2-3 sentences) rather than extensive summaries of sources
- Conclude with actionable recommendations or perspectives

## FUNDAMENTAL PRINCIPLES
- If you don't know something, DO NOT make assumptions - ask the user for clarification
- Scrupulously respect copyright by avoiding extensive reproduction of content
- Never use more than one short quotation (fewer than 25 words) per source
- When dealing with sensitive or confidential information, request confirmation before proceeding
- Systematically save your findings using the write_file tool in markdown format
- Think step by step and visually verify each action with screenshots

This system enables the production of comprehensive research and structured reports that meet the highest professional standards.

When you need to use a tool, you must ONLY respond with the exact format below, nothing else:
{
    "tool": "tool-name",
    "arguments": {
        "argument-name": "value"
    }
}
"""

# Pydantic models
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    session_id: str
    tool_executed: Optional[bool] = False
    tool_result: Optional[Dict[str, Any]] = None

class TaskRequest(BaseModel):
    task_description: str
    session_id: Optional[str] = None

class TaskResponse(BaseModel):
    status: str
    session_id: str
    steps_completed: int
    final_response: str

# --- HTTP MCP Server Client ---
class HTTPMCPClient:
    """Client for communicating with HTTP MCP Server"""
    
    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip('/')
        self.session_id = None
        self.artifact_uris: List[str] = []
        
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
    
    async def cleanup_session(self):
        """Cleanup the session on the server"""
        if self.session_id:
            try:
                async with httpx.AsyncClient() as client:
                    await client.delete(f"{self.server_url}/sessions/{self.session_id}")
            except Exception as e:
                logger.warning(f"Error cleaning up session: {e}")

# --- Tool Class (Simple local representation) ---
class Tool:
    """Represents a tool from the server."""

    def __init__(self, tool_data: Dict[str, Any]) -> None:
        """Initializes the Tool instance from server data."""
        self.name: str = tool_data.get("name", "Unknown Tool")
        self.description: str = tool_data.get("description", "No description")
        self.input_schema: Dict[str, Any] = tool_data.get("input_schema", {})

    def format_for_llm(self) -> str:
        """Format tool information for LLM."""
        args_desc: List[str] = []
        properties = self.input_schema.get("properties", {})
        required_args = self.input_schema.get("required", [])

        for param_name, param_info in properties.items():
            description = param_info.get("description", "No description")
            arg_desc = f"- {param_name}: {description}"
            if param_name in required_args:
                arg_desc += " (required)"
            args_desc.append(arg_desc)

        arguments_section = "Arguments:\n"
        if args_desc:
            arguments_section += "\n".join(args_desc)
        else:
            arguments_section += "  (No arguments defined)"

        return f"""
            Tool: {self.name}
            Description: {self.description}
            {arguments_section}
            """

# --- LLMClient Class (Enhanced) ---
class LLMClient:
    """Manages communication with the LLM provider."""

    def __init__(self, model_name: str, project: str, location: str) -> None:
        """Initializes the LLMClient instance."""
        self.model_name: str = model_name
        self.project: str = project
        self.location: str = location
        self._client: Optional[genai.Client] = None
        self._chat_session: Optional[genai.ChatSession] = None
        self._generation_config: Optional[types.GenerateContentConfig] = None
        self._system_instruction: Optional[str] = None
        self.total_tokens_used: int = 0

    def _initialize_client(self) -> None:
        """Initializes the Gen AI client if not already done."""
        if not self._client:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                raise ValueError("GOOGLE_API_KEY environment variable is required")
            
            self._client = genai.Client(
                vertexai=False,
                api_key=api_key,
            )
            logger.info(f"Gen AI client initialized for project '{self.project}' in '{self.location}'.")

    def set_generation_config(self, config: types.GenerateContentConfig) -> None:
        """Sets the generation configuration for subsequent calls."""
        self._generation_config = config
        logger.debug(f"Generation config set: {config}")

    def set_system_instruction(self, system_instruction: str) -> None:
        """Sets the system instruction and initializes the chat session."""
        self._initialize_client()
        if not self._client:
            raise ConnectionError("LLM Client not initialized.")

        self._chat_session = self._client.chats.create(model=self.model_name)
        self._chat_session.send_message(system_instruction)
        self._system_instruction = system_instruction
        logger.info("LLM chat session initialized.")

    def estimate_token_count(self, text: str) -> int:
        """Estimate the number of tokens in the text."""
        return len(text) // 4

    @staticmethod
    def extract_tool_call_json(text: str) -> Optional[Dict[str, Any]]:
        """Extracts a JSON object formatted for tool calls from markdown code blocks."""
        # Regex to find ```json ... ``` block
        match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
        json_string = None

        if match:
            json_string = match.group(1).strip()
            logger.debug(f"Extracted JSON string from ```json block:\n{json_string}")
        else:
            # Fallback: If no ```json block, maybe the entire text is the JSON?
            text_stripped = text.strip()
            if text_stripped.startswith("{") and text_stripped.endswith("}"):
                json_string = text_stripped
                logger.debug("No ```json block found, attempting to parse entire stripped text as JSON.")

        if not json_string:
            if text.strip():
                logger.debug(f"Could not extract a JSON string from the LLM response: >>>{text}<<<")
            return None

        # Load the extracted string into a Python JSON object
        try:
            loaded_json = json.loads(json_string)
            # Validate if it looks like a tool call
            if (
                isinstance(loaded_json, dict)
                and "tool" in loaded_json
                and "arguments" in loaded_json
            ):
                logger.debug("Successfully validated JSON")
                return loaded_json

            logger.debug("Parsed JSON but it does not match expected tool call structure.")
            return None
        except json.JSONDecodeError as e:
            logger.warning(f"Error decoding JSON: {e}. String was: >>>{json_string}<<<")
            return None

    def get_response(self, current_message: str) -> str:
        """Sends the current message to the LLM and returns the response text."""
        if not self._chat_session:
            raise ConnectionError("LLM chat session is not initialized. Call set_system_instruction first.")
        if not self._client:
            raise ConnectionError("LLM Client not initialized.")

        logger.debug(f"Sending message to LLM: {current_message}")
        response = self._chat_session.send_message(current_message)

        # Update token usage estimate
        estimated_input_tokens = self.estimate_token_count(current_message)
        estimated_output_tokens = self.estimate_token_count(response.text)
        self.total_tokens_used += estimated_input_tokens + estimated_output_tokens
        
        response_text = response.text
        logger.debug(f"Received raw LLM response: {response_text}")
        return response_text
        
    def recreate_session(self) -> None:
        """Recreate the chat session with the same system instruction."""
        if not self._system_instruction:
            logger.warning("Cannot recreate session: No system instruction set")
            return
            
        self._initialize_client()
        if not self._client:
            raise ConnectionError("LLM Client not initialized.")
            
        self._chat_session = self._client.chats.create(model=self.model_name)
        self._chat_session.send_message(self._system_instruction)
        logger.info("LLM chat session recreated")

# --- ConversationManager Class ---
class ConversationManager:
    """Manages the conversation history and provides optimization functions."""
    
    def __init__(self, llm_client: LLMClient):
        """Initialize the conversation manager."""
        self.llm_client = llm_client
        self.messages: List[Dict[str, Any]] = []
        
    def add_message(self, role: str, content: Union[str, List[Dict[str, Any]]]) -> None:
        """Add a message to the conversation history."""
        self.messages.append({"role": role, "content": content})
        
    def get_message_count(self) -> int:
        """Get the number of messages in the conversation."""
        return len(self.messages)
        
    def should_summarize(self) -> bool:
        """Check if the conversation should be summarized."""
        return self.llm_client.total_tokens_used > SUMMARIZATION_TOKEN_THRESHOLD
        
    def summarize_conversation(self) -> None:
        """Summarize the conversation to reduce token usage."""
        if len(self.messages) <= KEEP_LAST_TURNS * 2 + 1:
            logger.info("Not enough messages to summarize")
            return
            
        # Keep the system message and last few turns
        system_message = None
        if self.messages[0]["role"] == "system":
            system_message = self.messages[0]
            
        # Keep the last few turns
        last_turns = self.messages[-KEEP_LAST_TURNS*2:]
        
        # Create summarization prompt
        to_summarize = self.messages[1:-KEEP_LAST_TURNS*2] if system_message else self.messages[:-KEEP_LAST_TURNS*2]
        
        summarization_prompt = """Please summarize the following conversation while preserving key information, decisions, and context.
Focus on what's been accomplished and important findings. Provide a concise summary:

"""
        for msg in to_summarize:
            role = msg["role"].upper()
            if isinstance(msg["content"], str):
                content = msg["content"]
                summarization_prompt += f"{role}: {content}\n\n"
            else:
                summarization_prompt += f"{role}: [Structured content]\n\n"
            
        # Get summary from LLM
        try:
            temp_client = LLMClient(
                model_name=self.llm_client.model_name,
                project=self.llm_client.project,
                location=self.llm_client.location
            )
            temp_client._initialize_client()
            temp_session = temp_client._client.chats.create(model=self.llm_client.model_name)
            summary_response = temp_session.send_message(summarization_prompt)
            summary_text = summary_response.text
            
            # Create new conversation with summary
            new_messages = []
            if system_message:
                new_messages.append(system_message)
                
            new_messages.append({
                "role": "assistant", 
                "content": f"[CONVERSATION SUMMARY: {summary_text}]"
            })
            
            new_messages.extend(last_turns)
            
            # Update messages
            self.messages = new_messages
            
            # Reset the LLM client
            self.llm_client.recreate_session()
            self.llm_client.total_tokens_used = 0
            for msg in self.messages:
                if isinstance(msg["content"], str):
                    self.llm_client.total_tokens_used += self.llm_client.estimate_token_count(msg["content"])
                    
            logger.info(f"Conversation summarized. New message count: {len(self.messages)}")
        except Exception as e:
            logger.error(f"Error summarizing conversation: {e}")
            traceback.print_exc()

# --- IntelligentMCPProcessor Class ---
class IntelligentMCPProcessor:
    """Processes messages and orchestrates intelligent tool usage"""
    
    def __init__(self, mcp_client: HTTPMCPClient, llm_client: LLMClient):
        self.mcp_client = mcp_client
        self.llm_client = llm_client
        self.tools = []
        self.conversation = ConversationManager(llm_client)
        self.download_dir = "downloads"
        os.makedirs(self.download_dir, exist_ok=True)
        
    async def initialize(self):
        """Initialize by loading available tools and setting up LLM"""
        # Load tools from server
        tool_data_list = await self.mcp_client.list_tools()
        self.tools = [Tool(tool_data) for tool_data in tool_data_list]
        logger.info(f"Loaded {len(self.tools)} tools")
        
        # Setup LLM with system instruction and tools
        tools_description = "\n".join([tool.format_for_llm() for tool in self.tools])
        system_instruction = SYSTEM_PROMPT + "\n\nAvailable tools:\n" + tools_description
        
        # Configure LLM
        generate_content_config = types.GenerateContentConfig(
            temperature=0.9,
            top_p=0.8,
            max_output_tokens=4048,
            response_modalities=["TEXT"],
            safety_settings=[
                types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
            ],
        )
        
        self.llm_client.set_generation_config(generate_content_config)
        self.llm_client.set_system_instruction(system_instruction)
        
        # Initialize conversation with system instruction
        self.conversation.add_message("system", system_instruction)
        
        logger.info("Intelligent MCP Processor initialized successfully")
        
    async def process_message(self, message: str, session_id: str) -> Dict[str, Any]:
        """Process a user message with intelligent tool usage"""
        # Set session ID for MCP client
        self.mcp_client.session_id = session_id
        
        # Add user message to conversation
        self.conversation.add_message("user", message)
        
        # Get LLM response
        llm_response = self.llm_client.get_response(message)
        
        # Check if it's a tool call
        parsed_tool_call = self.llm_client.extract_tool_call_json(llm_response)
        
        if not parsed_tool_call:
            # Regular response
            self.conversation.add_message("assistant", llm_response)
            return {
                "response": llm_response,
                "tool_executed": False,
                "session_id": session_id
            }
        
        # It's a tool call - execute it
        self.conversation.add_message("assistant", llm_response)
        
        try:
            tool_name = parsed_tool_call.get("tool")
            arguments = parsed_tool_call.get("arguments", {})
            
            # Execute the tool
            result = await self.mcp_client.execute_tool(tool_name, arguments)
            
            if result.get("success"):
                tool_result = result.get("result")
                
                # Add tool result to conversation
                self.conversation.add_message("user", f"Tool result: {json.dumps(tool_result)}")
                
                # Get follow-up response from LLM
                follow_up_response = self.llm_client.get_response("Analyze the tool result and provide insights.")
                self.conversation.add_message("assistant", follow_up_response)
                
                return {
                    "response": f"{llm_response}\n\n✅ Tool executed successfully!\n\n{follow_up_response}",
                    "tool_executed": True,
                    "tool_result": tool_result,
                    "session_id": session_id
                }
            else:
                error_msg = result.get("error", "Unknown error")
                return {
                    "response": f"{llm_response}\n\n❌ Tool execution failed: {error_msg}",
                    "tool_executed": False,
                    "session_id": session_id
                }
                
        except Exception as e:
            logger.error(f"Error executing tool: {e}")
            return {
                "response": f"{llm_response}\n\n❌ Error executing tool: {str(e)}",
                "tool_executed": False,
                "session_id": session_id
            }
    
    async def execute_complex_task(self, task_description: str, session_id: str) -> Dict[str, Any]:
        """Execute a complex task with multiple tool calls"""
        self.mcp_client.session_id = session_id
        
        # Add task to conversation
        self.conversation.add_message("user", task_description)
        
        steps_completed = 0
        max_steps = 20  # Prevent infinite loops
        
        # Initial LLM response
        llm_response = self.llm_client.get_response(task_description)
        parsed_tool_call = self.llm_client.extract_tool_call_json(llm_response)
        
        if not parsed_tool_call:
            return {
                "status": "completed",
                "session_id": session_id,
                "steps_completed": 0,
                "final_response": llm_response
            }
        
        self.conversation.add_message("assistant", llm_response)
        
        # Task execution loop
        while parsed_tool_call and steps_completed < max_steps:
            steps_completed += 1
            
            try:
                tool_name = parsed_tool_call.get("tool")
                arguments = parsed_tool_call.get("arguments", {})
                
                logger.info(f"Step {steps_completed}: Executing {tool_name}")
                
                # Execute tool
                result = await self.mcp_client.execute_tool(tool_name, arguments)
                
                if result.get("success"):
                    tool_result = result.get("result")
                    
                    # Add tool result to conversation
                    self.conversation.add_message("user", f"Tool result: {json.dumps(tool_result)}")
                    
                    # Check if conversation needs summarization
                    if self.conversation.should_summarize():
                        logger.info("Summarizing conversation...")
                        self.conversation.summarize_conversation()
                    
                    # Get next step from LLM
                    next_prompt = "Continue with the task. What's the next step?"
                    llm_response = self.llm_client.get_response(next_prompt)
                    parsed_tool_call = self.llm_client.extract_tool_call_json(llm_response)
                    
                    self.conversation.add_message("assistant", llm_response)
                    
                else:
                    # Tool execution failed
                    error_msg = result.get("error", "Unknown error")
                    self.conversation.add_message("user", f"Tool execution failed: {error_msg}")
                    
                    # Try to recover or provide alternative
                    recovery_prompt = f"The tool execution failed with error: {error_msg}. Please suggest an alternative approach or conclude the task."
                    llm_response = self.llm_client.get_response(recovery_prompt)
                    parsed_tool_call = self.llm_client.extract_tool_call_json(llm_response)
                    
                    self.conversation.add_message("assistant", llm_response)
                    
            except Exception as e:
                logger.error(f"Error in task execution step {steps_completed}: {e}")
                break
        
        # Final response
        if steps_completed >= max_steps:
            final_response = "Task execution reached maximum steps limit. Please review the results."
        else:
            final_response = llm_response
        
        return {
            "status": "completed",
            "session_id": session_id,
            "steps_completed": steps_completed,
            "final_response": final_response
        }

# FastAPI app setup
app = FastAPI(title="Intelligent MCP Client", description="Intelligent web interface for MCP automation")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global components
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://localhost:8080")
mcp_client = HTTPMCPClient(MCP_SERVER_URL)

# LLM configuration
llm_project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
llm_location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
llm_model = os.getenv("LLM_MODEL_NAME", "gemini-2.0-flash")

llm_client = LLMClient(model_name=llm_model, project=llm_project, location=llm_location)
processor = IntelligentMCPProcessor(mcp_client, llm_client)

@app.on_event("startup")
async def startup_event():
    """Initialize the processor on startup"""
    try:
        await processor.initialize()
        logger.info("MCP Client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize MCP Client: {e}")

@app.get("/", response_class=HTMLResponse)
async def get_chat_interface():
    """Serve the enhanced chat interface"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>🤖 Intelligent MCP Web Automation</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
            }
            .container {
                background: white;
                border-radius: 15px;
                padding: 30px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                color: #333;
            }
            .chat-container {
                display: grid;
                grid-template-columns: 1fr 300px;
                gap: 20px;
                height: 600px;
            }
            .chat-messages {
                border: 2px solid #e1e5e9;
                border-radius: 10px;
                padding: 15px;
                overflow-y: auto;
                background-color: #f8f9fa;
            }
            .message {
                margin-bottom: 15px;
                padding: 12px 16px;
                border-radius: 10px;
                max-width: 80%;
                word-wrap: break-word;
            }
            .user-message {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin-left: auto;
                text-align: right;
            }
            .assistant-message {
                background-color: #e9ecef;
                color: #333;
                border-left: 4px solid #007bff;
            }
            .tool-message {
                background-color: #d4edda;
                color: #155724;
                border-left: 4px solid #28a745;
                font-family: monospace;
                font-size: 0.9em;
            }
            .error-message {
                background-color: #f8d7da;
                color: #721c24;
                border-left: 4px solid #dc3545;
            }
            .controls {
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .input-container {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }
            #messageInput {
                flex: 1;
                padding: 12px;
                border: 2px solid #e1e5e9;
                border-radius: 8px;
                font-size: 16px;
                transition: border-color 0.3s;
            }
            #messageInput:focus {
                outline: none;
                border-color: #667eea;
            }
            .btn {
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                transition: all 0.3s;
            }
            .btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            .btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
            }
            .btn-secondary {
                background-color: #6c757d;
                color: white;
            }
            .btn:disabled {
                background-color: #6c757d;
                cursor: not-allowed;
                transform: none;
            }
            .examples {
                background-color: #f8f9fa;
                border-radius: 10px;
                padding: 15px;
                border: 1px solid #e1e5e9;
            }
            .examples h3 {
                margin-top: 0;
                color: #495057;
            }
            .example {
                background-color: white;
                padding: 10px;
                margin: 8px 0;
                border-radius: 6px;
                cursor: pointer;
                border: 1px solid #dee2e6;
                transition: all 0.3s;
                font-size: 14px;
            }
            .example:hover {
                background-color: #e9ecef;
                transform: translateX(5px);
            }
            .mode-selector {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            .mode-btn {
                flex: 1;
                padding: 10px;
                border: 2px solid #e1e5e9;
                background: white;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s;
            }
            .mode-btn.active {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border-color: #667eea;
            }
            .status {
                padding: 10px;
                border-radius: 8px;
                margin-bottom: 15px;
                text-align: center;
                font-weight: 600;
            }
            .status.connected {
                background-color: #d4edda;
                color: #155724;
            }
            .status.error {
                background-color: #f8d7da;
                color: #721c24;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🤖 Intelligent MCP Web Automation</h1>
                <p>Advanced AI-powered web research and automation assistant</p>
            </div>
            
            <div class="chat-container">
                <div class="chat-area">
                    <div id="chatMessages" class="chat-messages"></div>
                    <div class="input-container">
                        <input type="text" id="messageInput" placeholder="Describe your research task or ask a question..." />
                        <button id="sendButton" class="btn btn-primary">Send</button>
                    </div>
                </div>
                
                <div class="controls">
                    <div id="status" class="status connected">🟢 Connected to MCP Server</div>
                    
                    <div class="mode-selector">
                        <div class="mode-btn active" data-mode="chat">💬 Chat</div>
                        <div class="mode-btn" data-mode="task">🎯 Task</div>
                    </div>
                    
                    <div class="examples">
                        <h3>🚀 Example Commands</h3>
                        <div class="example" onclick="setMessage('Research the latest trends in artificial intelligence and create a comprehensive report')">
                            📊 Research AI trends and create report
                        </div>
                        <div class="example" onclick="setMessage('Navigate to news websites and find articles about climate change')">
                            🌍 Find climate change news articles
                        </div>
                        <div class="example" onclick="setMessage('Take a screenshot of the current page')">
                            📸 Take a screenshot
                        </div>
                        <div class="example" onclick="setMessage('Navigate to https://example.com and analyze the page content')">
                            🔍 Navigate and analyze website
                        </div>
                        <div class="example" onclick="setMessage('Search for information about renewable energy and save findings to a file')">
                            💾 Research and save findings
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let sessionId = null;
            let currentMode = 'chat';

            function addMessage(content, type) {
                const messagesDiv = document.getElementById('chatMessages');
                const messageDiv = document.createElement('div');
                messageDiv.className = `message ${type}-message`;
                
                if (typeof content === 'object') {
                    messageDiv.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
                } else {
                    messageDiv.innerHTML = content.replace(/\\n/g, '<br>');
                }
                
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            function setMessage(text) {
                document.getElementById('messageInput').value = text;
            }

            function setStatus(message, isError = false) {
                const statusDiv = document.getElementById('status');
                statusDiv.textContent = message;
                statusDiv.className = `status ${isError ? 'error' : 'connected'}`;
            }

            async function sendMessage() {
                const input = document.getElementById('messageInput');
                const button = document.getElementById('sendButton');
                const message = input.value.trim();
                
                if (!message) return;

                // Disable input while processing
                input.disabled = true;
                button.disabled = true;
                button.textContent = 'Processing...';

                // Add user message to chat
                addMessage(message, 'user');
                input.value = '';

                try {
                    const endpoint = currentMode === 'task' ? '/execute-task' : '/chat';
                    const payload = currentMode === 'task' 
                        ? { task_description: message, session_id: sessionId }
                        : { message: message, session_id: sessionId };

                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();
                    sessionId = data.session_id;
                    
                    // Add assistant response to chat
                    if (currentMode === 'task') {
                        addMessage(`Task completed in ${data.steps_completed} steps`, 'tool');
                        addMessage(data.final_response, 'assistant');
                    } else {
                        addMessage(data.response, 'assistant');
                        
                        if (data.tool_executed && data.tool_result) {
                            addMessage('Tool Result: ' + JSON.stringify(data.tool_result, null, 2), 'tool');
                        }
                    }
                    
                    setStatus('🟢 Ready');
                    
                } catch (error) {
                    addMessage('Error: ' + error.message, 'error');
                    setStatus('❌ Error: ' + error.message, true);
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

            // Mode selector
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    currentMode = this.dataset.mode;
                    
                    const placeholder = currentMode === 'task' 
                        ? 'Describe a complex task to automate...'
                        : 'Ask a question or request assistance...';
                    document.getElementById('messageInput').placeholder = placeholder;
                });
            });

            // Focus input on load
            document.getElementById('messageInput').focus();
            
            // Add welcome message
            addMessage('👋 Welcome to the Intelligent MCP Web Automation Assistant! I can help you with web research, automation tasks, and analysis. Choose between Chat mode for conversations or Task mode for complex automated workflows.', 'assistant');
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Handle chat messages with intelligent processing"""
    try:
        session_id = request.session_id or str(uuid.uuid4())
        result = await processor.process_message(request.message, session_id)
        
        return ChatResponse(
            response=result["response"],
            session_id=result["session_id"],
            tool_executed=result.get("tool_executed", False),
            tool_result=result.get("tool_result")
        )
        
    except Exception as e:
        logger.error(f"Error processing chat message: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute-task", response_model=TaskResponse)
async def execute_task(request: TaskRequest):
    """Execute complex automated tasks"""
    try:
        session_id = request.session_id or str(uuid.uuid4())
        result = await processor.execute_complex_task(request.task_description, session_id)
        
        return TaskResponse(
            status=result["status"],
            session_id=result["session_id"],
            steps_completed=result["steps_completed"],
            final_response=result["final_response"]
        )
        
    except Exception as e:
        logger.error(f"Error executing task: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "intelligent-mcp-client"}

if __name__ == "__main__":
    # Load environment variables
    load_dotenv()
    
    port = int(os.environ.get("PORT", 8081))
    uvicorn.run(app, host="0.0.0.0", port=port)