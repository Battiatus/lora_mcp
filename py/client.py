import asyncio
from contextlib import AsyncExitStack
import json
import logging
import os
import re
import shutil
import sys
import base64
import copy
import uuid
from typing import Any, Dict, List, Optional, Union
import traceback

# Import necessary components
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic.networks import AnyUrl

# Ensure MCP library is installed: pip install mcp
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import ListToolsResult, Tool as MCPTool, CallToolResult, ReadResourceResult, TextResourceContents

# Configure logging - Set default level to INFO
logging.basicConfig(
    level=logging.ERROR, format="%(asctime)s - %(levelname)s - %(message)s"
)

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

# --- Configuration Class ---
class Configuration:
    """Handles configuration loading from environment and files."""

    @staticmethod
    def load_env() -> None:
        """Loads environment variables from .env file."""
        load_dotenv()

    @staticmethod
    def load_config(file_path: str) -> Dict[str, Any]:
        """Loads configuration from a JSON file.

        Args:
            file_path: Path to the configuration file.

        Returns:
            A dictionary containing the configuration.

        Raises:
            FileNotFoundError: If the configuration file is not found.
            json.JSONDecodeError: If the configuration file is not valid JSON.
        """
        try:
            with open(file_path, "r") as f:
                return json.load(f)
        except FileNotFoundError:
            logging.error(f"Configuration file not found: {file_path}")
            raise
        except json.JSONDecodeError:
            logging.error(f"Invalid JSON in configuration file: {file_path}")
            raise


# --- Server Class (Manages connection to one server process) ---
class Server:
    """Manages the connection to a server process."""

    def __init__(self, name: str, config: Dict[str, Any]) -> None:
        """Initializes the Server instance.

        Args:
            name: The name of the server.
            config: The configuration for the server.
        """
        self.name: str = name
        self.config: Dict[str, Any] = config
        self.stdio_context: Optional[Any] = None
        self.session: Optional[ClientSession] = None
        self._cleanup_lock: asyncio.Lock = asyncio.Lock()
        self.exit_stack: AsyncExitStack = AsyncExitStack()
        self.artifact_uris: List[AnyUrl] = []  # Track artifact URIs

    async def initialize(self) -> None:
        """Initializes the server connection."""
        command = shutil.which("python") or shutil.which("python3")
        if not command:
            raise EnvironmentError(
                "Please ensure Python is installed "
                "and available in your system's PATH."
            )
        server_script_path = self.config.get("script_path")
        if not server_script_path:
            raise ValueError(
                f"Server config for '{self.name}' " "missing 'script_path'"
            )

        server_params = StdioServerParameters(
            command=command,
            args=[server_script_path],
            env={**os.environ, **self.config.get("env", {})},
        )
        try:
            logging.debug(f"Starting server '{self.name}'")
            stdio_transport = await self.exit_stack.enter_async_context(
                stdio_client(server_params)
            )
            read, write = stdio_transport
            session = await self.exit_stack.enter_async_context(
                ClientSession(read, write)
            )
            await session.initialize()
            self.session = session
            logging.info(f"Server '{self.name}' initialized successfully.")
        # Errors during subprocess creation
        # (by stdio_client or underlying OS calls)
        except FileNotFoundError as e:
            logging.error(
                f"Error initializing server {self.name}: "
                "Command or script file not found. "
                f"Command: {command}, Script: {server_script_path}. "
                f"Error: {e}"
            )
            await self.cleanup()
            raise
        except PermissionError as e:
            logging.error(
                f"Error initializing server {self.name}: "
                f"Permission denied for "
                f"command '{command}' or script"
                f" '{server_script_path}'. Error: {e}"
            )
            await self.cleanup()
            raise
        # Pipe/Connection errors if the server
        # process dies unexpectedly or closes streams
        except (BrokenPipeError, ConnectionResetError, EOFError) as e:
            logging.error(
                f"Error initializing server {self.name}: "
                "Communication pipe broken, connection reset, or EOF. "
                f"The server process for '{server_script_path}' "
                "may have crashed or exited prematurely. "
                f"Error: {type(e).__name__}: {e}"
            )
            await self.cleanup()
            raise

    async def list_tools(self) -> List["Tool"]:
        """List available tools from the server.

        Returns:
            A list of Tool objects.

        Raises:
            RuntimeError: If the server is not initialized.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        tools_response = await self.session.list_tools()
        tools: List["Tool"] = []
        logging.debug(
            f"Raw tools response from server: {tools_response}"
        )

        for item in tools_response:
            if isinstance(item, tuple) and item[0] == "tools":
                tool_spec_list = item[1]
                if not isinstance(tool_spec_list, list):
                    logging.warning(
                        "Expected a list of tools, " f"but got: {type(tool_spec_list)}"
                    )
                    continue

                for tool_spec in tool_spec_list:
                    # Access attributes directly using dot notation
                    tool_name = getattr(tool_spec, "name", None)
                    tool_desc = getattr(tool_spec, "description", None)
                    # input_schema might be named differently
                    tool_schema = getattr(
                        tool_spec,
                        "input_schema",
                        getattr(tool_spec, "inputSchema", {}),
                    )

                    if tool_name:  # Only add if we could get a name
                        tools.append(Tool(tool_name, tool_desc, tool_schema))
                    else:
                        logging.warning(
                            f"Could not extract name from tool "
                            f"spec object: {tool_spec}"
                        )

        logging.debug(f"Parsed tools: {[t.name for t in tools]}")
        return tools

    async def execute_tool(
        self,
        tool_name: Optional[str],
        arguments: Dict[str, Any],
        tool_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute a tool with retry mechanism.

        Args:
            tool_name: The name of the tool to execute.
            arguments: The arguments to pass to the tool.
            tool_id: Optional unique ID for the tool call.

        Returns:
            The result of the tool execution in a format suitable for the LLM.

        Raises:
            RuntimeError: If the server is not initialized or
                if the tool execution fails after retries.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")

        # Generate a tool ID if not provided
        if tool_id is None:
            tool_id = str(uuid.uuid4())

        retryable_call_exceptions = (
            asyncio.TimeoutError,
            BrokenPipeError,
            ConnectionResetError,
            EOFError,
        )

        logging.debug(f"Executing tool: {tool_name} with arguments: {arguments}")
        try:
            # Execute the tool
            result = await self.session.call_tool(tool_name, arguments)
            
            # Process the result based on content types
            response_content = []
            
            # Check if we have a proper CallToolResult with content
            if hasattr(result, 'content') and isinstance(result.content, list):
                for content_item in result.content:
                    # Check content type
                    if hasattr(content_item, 'type'):
                        # Handle ImageContent
                        if content_item.type == 'image' and hasattr(content_item, 'data'):
                            image_data = base64.b64decode(content_item.data)
                            response_content.append({"json": {"filename": "screenshot.jpeg"}})
                            # Add image data
                            response_content.append({
                                "image": {
                                    "format": "jpeg",
                                    "data": base64.b64encode(image_data).decode('utf-8')
                                }
                            })
                        
                        # Handle TextContent
                        elif content_item.type == 'text' and hasattr(content_item, 'text'):
                            response_content.append({"json": {"text": content_item.text}})
                        
                        # Handle EmbeddedResource
                        elif content_item.type == 'resource' and hasattr(content_item, 'resource'):
                            resource = content_item.resource
                            if hasattr(resource, 'uri'):
                                response_content.append({"json": {"resource": resource.uri.unicode_string()}})
                                self.artifact_uris.append(resource.uri)
                                logging.info(f"Tracked artifact URI: {resource.uri}")
                            if hasattr(resource, 'text'):
                                response_content.append({"json": {"resource": resource.text}})
            else:
                # Fallback for simple results
                response_content.append({"text": str(result)})
                
            # Get page info for context
            try:
                page_info_result = await self.session.call_tool("get_page_info", {})
                page_info_text = "Page info not available"
                
                if hasattr(page_info_result, 'content') and isinstance(page_info_result.content, list):
                    for content_item in page_info_result.content:
                        if hasattr(content_item, 'type') and content_item.type == 'text' and hasattr(content_item, 'text'):
                            page_info_text = content_item.text
                            break
                
                response_content.append({"text": f"Current page: {page_info_text}"})
            except Exception as e:
                logging.warning(f"Error getting page info: {e}")
            
            return {
                "toolResult": {
                    "toolUseId": tool_id,
                    "content": response_content
                }
            }

        except Exception as e:
            error_msg = f"Error executing tool {tool_name}: {str(e)}"
            logging.error(error_msg)
            return {
                "toolResult": {
                    "toolUseId": tool_id,
                    "content": [{"text": error_msg}]
                }
            }

    async def download_artifacts(self, download_dir: str = "downloads") -> List[str]:
        """Download all tracked artifacts.
        
        Args:
            download_dir: The directory to save artifacts to.
            
        Returns:
            A list of paths to the downloaded artifacts.
        """
        if not self.session:
            raise RuntimeError(f"Server {self.name} not initialized")
            
        downloaded_paths = []
        
        if not self.artifact_uris:
            logging.info("No artifacts to download")
            return downloaded_paths
            
        logging.info(f"Downloading {len(self.artifact_uris)} artifacts...")
        
        # Create downloads directory if it doesn't exist
        os.makedirs(download_dir, exist_ok=True)
        
        for uri in self.artifact_uris:
            try:
                # Extract filename from URI
                filename = uri.path
                if not filename:
                    logging.warning(f"Failed to parse artifact URI: {uri}")
                    continue
                    
                # Read the artifact using the resource
                resource_contents = await self.session.read_resource(uri)
                
                if resource_contents:
                    contents = resource_contents.contents
                    for content in contents:
                        if isinstance(content, TextResourceContents):
                            text_content = content
                            # The content might be JSON-encoded
                            try:
                                text = json.loads(text_content.text)[0]["text"]
                            except (json.JSONDecodeError, IndexError, KeyError):
                                text = text_content.text
                                
                            # Create a local directory for downloads
                            artifact_dir = f"{download_dir}/{uri.host}"
                            os.makedirs(artifact_dir, exist_ok=True)
                            
                            # Save the artifact
                            download_path = f"{artifact_dir}{filename}"
                            with open(download_path, 'w', encoding="utf-8") as f:
                                f.write(text)
                                
                            downloaded_paths.append(download_path)
                            logging.info(f"Downloaded artifact: {uri} to {download_path}")
                else:
                    logging.warning(f"Failed to download artifact: {uri} - No content returned")
            except Exception as e:
                logging.error(f"Error downloading artifact {uri}: {str(e)}")
                
        return downloaded_paths

    async def cleanup(self) -> None:
        """Clean up server resources."""
        async with self._cleanup_lock:
            if self.session:
                logging.debug(f"Cleaning up server {self.name}...")
                await self.exit_stack.aclose()
                self.session = None
                self.stdio_context = None
                logging.debug(f"Server {self.name} cleaned up.")


# --- Tool Class (Simple local representation) ---
class Tool:
    """Represents a tool listed by the server."""

    def __init__(
        self,
        name: Optional[str],
        description: Optional[str],
        input_schema: Optional[Dict[str, Any]],
    ) -> None:
        """Initializes the Tool instance.

        Args:
            name: The name of the tool.
            description: The description of the tool.
            input_schema: The input schema of the tool.
        """
        self.name: str = name or "Unknown Tool"
        self.description: str = description or "No description"
        self.input_schema: Dict[str, Any] = input_schema or {}

    def format_for_llm(self) -> str:
        """Format tool information for LLM.

        Returns:
            A formatted string describing the tool.
        """
        args_desc: List[str] = []
        properties = self.input_schema.get("properties", {})
        required_args = self.input_schema.get("required", [])

        for param_name, param_info in properties.items():
            description = param_info.get("description", "No description")
            arg_desc = f"- {param_name}: {description}"
            if param_name in required_args:
                arg_desc += " (required)"
            args_desc.append(arg_desc)

        # Ensure there's always an "Arguments:" line, even if empty
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

    def format_for_bedrock(self) -> Dict[str, Any]:
        """Format tool for Bedrock-style tool configuration.
        
        Returns:
            A dictionary with the tool specification.
        """
        return {
            "toolSpec": {
                "name": self.name,
                "description": self.description,
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": self.input_schema.get("properties", {}),
                        "required": self.input_schema.get("required", [])
                    }
                }
            }
        }


# --- LLMClient Class (Enhanced) ---
class LLMClient:
    """Manages communication with the LLM provider."""

    def __init__(self, model_name: str, project: str, location: str) -> None:
        """Initializes the LLMClient instance.

        Args:
            model_name: The name of the LLM model.
            project: The Google Cloud project ID.
            location: The Google Cloud location.
        """
        self.model_name: str = model_name
        self.project: str = project
        self.location: str = location
        self._client: Optional[genai.Client] = None
        self._chat_session: Optional[genai.ChatSession] = None
        self._generation_config: Optional[types.GenerateContentConfig] = None
        self._system_instruction: Optional[str] = None
        self.total_tokens_used: int = 0  # Track token usage

    def _initialize_client(self) -> None:
        """Initializes the Gen AI client if not already done."""
        if not self._client:
            default_api_error = (
                "--Missing API Key. "
                "Add API key here or in .env file. "
                "Use Secret Manager for production.--"
            )
            self._client = genai.Client(
                vertexai=False,
                api_key=os.getenv("GOOGLE_API_KEY", default_api_error),
            )
            logging.info(
                f"Gen AI client initialized for project "
                f"'{self.project}' in '{self.location}'."
            )

    def set_generation_config(self, config: types.GenerateContentConfig) -> None:
        """Sets the generation configuration for subsequent calls.

        Args:
            config: The generation configuration.
        """
        self._generation_config = config
        logging.debug(f"Generation config set: {config}")

    def set_system_instruction(self, system_instruction: str) -> None:
        """Sets the system instruction and initializes the chat session.

        Args:
            system_instruction: The system instruction.

        Raises:
            ConnectionError: If the LLM client is not initialized or
                if the chat session cannot be created.
        """
        self._initialize_client()  # Ensure client is ready
        if not self._client:
            raise ConnectionError("LLM Client not initialized.")

        self._chat_session = self._client.chats.create(model=self.model_name)
        self._chat_session.send_message(system_instruction)
        self._system_instruction = system_instruction
        logging.info("LLM chat session initialized.")

    def estimate_token_count(self, text: str) -> int:
        """Estimate the number of tokens in the text.
        
        Args:
            text: The text to estimate tokens for.
            
        Returns:
            Estimated token count.
        """
        # Simple estimation: ~4 characters per token for English text
        return len(text) // 4

    @staticmethod
    def extract_tool_call_json(text: str) -> Optional[Dict[str, Any]]:
        """
        Extracts a JSON object formatted for tool
        calls from markdown code blocks.

        Specifically looks for ```json { "tool": ..., "arguments": ... } ```

        Args:
            text: The input string potentially containing
            the JSON tool call.

        Returns:
            The loaded Python dictionary representing the tool call,
            or None if extraction/parsing fails or
            if it's not a valid tool call structure.
        """
        # Regex to find ```json ... ``` block
        # Using non-greedy matching .*? for the content
        match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
        json_string = None

        if match:
            json_string = match.group(1).strip()
            logging.debug(
                "Extracted JSON string " f"from ```json block:\n{json_string}"
            )
        else:
            # Fallback: If no ```json block, maybe the entire text is the JSON?
            text_stripped = text.strip()
            if text_stripped.startswith("{") and text_stripped.endswith("}"):
                json_string = text_stripped
                logging.debug(
                    "No ```json block found, attempting to "
                    "parse entire stripped text as JSON."
                )

        if not json_string:
            if text.strip():
                logging.debug(
                    "Could not extract a JSON string from "
                    f"the LLM response: >>>{text}<<<"
                )
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
                logging.debug("Successfully validated JSON ")
                return loaded_json

            logging.debug(
                "Parsed JSON but it does not " + "match expected tool call structure."
            )
            return None  # Not a valid tool call structure
        except json.JSONDecodeError as e:
            logging.warning(
                f"Error decoding JSON: {e}. String was: >>>{json_string}<<<"
            )
            return None

    def get_response(self, current_message: str) -> str:
        """
        Sends the current conversation history to the LLM and
            returns the response text.

        Args:
            current_messages: A list of message dictionaries
                representing the conversation history
                (including the latest user message).

        Returns:
            The LLM's raw response text.

        Raises:
            ConnectionError: If the chat session is
                not initialized or the API call fails.
            Exception: For other potential LLM API errors.
        """
        if not self._chat_session:
            raise ConnectionError(
                "LLM chat session is not initialized. "
                "Call set_system_instruction first."
            )
        if not self._client:  # Should be initialized if session exists
            raise ConnectionError("LLM Client not initialized.")

        logging.debug(f"Sending messages to LLM: {current_message}")
        logging.debug(f"Using generation config: {self._generation_config}")

        # Pass generation_config if it's set
        response = self._chat_session.send_message(
            current_message  # Pass the whole history
        )

        # Update token usage estimate
        estimated_input_tokens = self.estimate_token_count(current_message)
        estimated_output_tokens = self.estimate_token_count(response.text)
        self.total_tokens_used += estimated_input_tokens + estimated_output_tokens
        
        response_text = response.text
        logging.debug(f"Received raw LLM response: {response_text}")
        return response_text
        
    def recreate_session(self) -> None:
        """Recreate the chat session with the same system instruction.
        
        This is useful after summarizing the conversation.
        """
        if not self._system_instruction:
            logging.warning("Cannot recreate session: No system instruction set")
            return
            
        self._initialize_client()
        if not self._client:
            raise ConnectionError("LLM Client not initialized.")
            
        self._chat_session = self._client.chats.create(model=self.model_name)
        self._chat_session.send_message(self._system_instruction)
        logging.info("LLM chat session recreated")


# --- ConversationManager Class ---
class ConversationManager:
    """Manages the conversation history and provides optimization functions."""
    
    def __init__(self, llm_client: LLMClient):
        """Initialize the conversation manager.
        
        Args:
            llm_client: The LLM client to use for summarization.
        """
        self.llm_client = llm_client
        self.messages: List[Dict[str, Any]] = []
        
    def add_message(self, role: str, content: Union[str, List[Dict[str, Any]]]) -> None:
        """Add a message to the conversation history.
        
        Args:
            role: The role of the message sender (user/assistant/system).
            content: The content of the message (string or structured content).
        """
        self.messages.append({"role": role, "content": content})
        
    def get_message_count(self) -> int:
        """Get the number of messages in the conversation.
        
        Returns:
            The number of messages.
        """
        return len(self.messages)
        
    def get_conversation_text(self) -> str:
        """Get the full conversation as text.
        
        Returns:
            The conversation text.
        """
        text = ""
        for msg in self.messages:
            role = msg["role"].upper()
            content = msg["content"]
            if isinstance(content, str):
                text += f"{role}: {content}\n\n"
            else:
                # Handle structured content
                text += f"{role}: [Structured content]\n\n"
        return text
        
    def should_summarize(self) -> bool:
        """Check if the conversation should be summarized.
        
        Returns:
            True if the conversation should be summarized, False otherwise.
        """
        # Check token usage against threshold
        return self.llm_client.total_tokens_used > SUMMARIZATION_TOKEN_THRESHOLD
        
    def summarize_conversation(self) -> None:
        """Summarize the conversation to reduce token usage."""
        if len(self.messages) <= KEEP_LAST_TURNS * 2 + 1:
            # Not enough messages to summarize
            logging.info("Not enough messages to summarize")
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
                # Handle structured content
                summarization_prompt += f"{role}: [Structured content]\n\n"
            
        # Get summary from LLM
        try:
            # Use a temporary chat session for summarization
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
                
            # Add summary as assistant message
            new_messages.append({
                "role": "assistant", 
                "content": f"[CONVERSATION SUMMARY: {summary_text}]"
            })
            
            # Add recent turns
            new_messages.extend(last_turns)
            
            # Update messages
            self.messages = new_messages
            
            # Reset the LLM client to start a fresh conversation
            self.llm_client.recreate_session()
            
            # Reset token count estimate
            self.llm_client.total_tokens_used = 0
            for msg in self.messages:
                if isinstance(msg["content"], str):
                    self.llm_client.total_tokens_used += self.llm_client.estimate_token_count(msg["content"])
                    
            logging.info(f"Conversation summarized. New message count: {len(self.messages)}")
        except Exception as e:
            logging.error(f"Error summarizing conversation: {e}")
            traceback.print_exc()
    
    def filter_empty_text_content(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Filter out empty text content from message.
        
        Args:
            message: The message to filter.
            
        Returns:
            Filtered message.
        """
        if not message or 'content' not in message:
            return message
        
        if isinstance(message['content'], str):
            return message
            
        filtered_content = []
        for content_item in message.get('content', []):
            # Keep items that don't have 'text' key or have non-empty text
            if 'text' not in content_item or content_item['text'].strip():
                filtered_content.append(content_item)
        
        # Create a new message with filtered content
        filtered_message = message.copy()
        filtered_message['content'] = filtered_content
        return filtered_message
        
    def remove_media_except_last_turn(self) -> None:
        """Remove images/documents from all messages except for the last turn."""
        if len(self.messages) < 2:
            return
            
        # Find the last user message index
        last_user_index = None
        for i in range(len(self.messages) - 1, -1, -1):
            if self.messages[i]['role'] == 'user':
                last_user_index = i
                break
                
        if last_user_index is None:
            return
            
        # Process all messages except the last turn
        for i in range(last_user_index):
            message = self.messages[i]
            if 'content' not in message or isinstance(message['content'], str):
                continue
                
            new_content = []
            for content_item in message['content']:
                # Keep text content
                if 'text' in content_item:
                    new_content.append(content_item)
                # Remove images and other media
                elif 'image' in content_item or 'json' in content_item:
                    pass
                else:
                    new_content.append(content_item)
                    
            # If no content left, add a placeholder
            if not new_content:
                new_content.append({
                    "text": "An image or document was removed for brevity."
                })
                
            message['content'] = new_content


# --- Chat Session (Orchestrates interaction - Enhanced) ---
class ChatSession:
    """Orchestrates the interaction between user
    and Gemini tools via MCP server."""

    def __init__(self, gemini_server: Server, llm_client: LLMClient) -> None:
        """Initializes the ChatSession instance.

        Args:
            gemini_server: The server instance.
            llm_client: The LLM client instance.
        """
        self.gemini_server: Server = gemini_server
        self.llm_client: LLMClient = llm_client
        # Store available tools once fetched
        self.available_tools: List[Tool] = []
        # Use conversation manager
        self.conversation = ConversationManager(llm_client)
        self.llm_model_name = llm_client.model_name
        self.download_dir = "downloads"
        
        # Create directory for downloads
        os.makedirs(self.download_dir, exist_ok=True)

    async def cleanup_servers(self) -> None:
        """Clean up the Gemini server properly."""
        if self.gemini_server:
            logging.info(f"Cleaning up server: {self.gemini_server.name}")
            await self.gemini_server.cleanup()

    async def _prepare_llm(self) -> bool:
        """Initializes the server, lists tools,
        and sets up the LLM client.

        Returns:
            True if initialization was successful,
            False otherwise.
        """
        try:
            # 1. Initialize the server
            await self.gemini_server.initialize()

            # 2. List available tools
            self.available_tools = await self.gemini_server.list_tools()
            if not self.available_tools:
                logging.warning(
                    f"No tools found on server {self.gemini_server.name}. "
                    "Interaction will be limited."
                )
            else:
                logging.info(
                    "Available tools: "
                    f"{[tool.name for tool in self.available_tools]}"
                )

            # 3. Set system instruction (using the SYSTEM_PROMPT constant)
            # Add tools description
            tools_description = "\n".join(
                [tool.format_for_llm() for tool in self.available_tools]
            )
            system_instruction = SYSTEM_PROMPT + "\n\nAvailable tools:\n" + tools_description

            # 4. Configure LLM Client with Gemini-specific generation config
            generate_content_config = types.GenerateContentConfig(
                temperature=0.9,
                top_p=0.8,
                max_output_tokens=4048,
                response_modalities=["TEXT"],
                safety_settings=[
                    types.SafetySetting(
                        category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_DANGEROUS_CONTENT",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        threshold="OFF",
                    ),
                    types.SafetySetting(
                        category="HARM_CATEGORY_HARASSMENT", threshold="OFF"
                    ),
                ],
            )

            # 5. Configure LLM Client
            self.llm_client.set_generation_config(generate_content_config)
            self.llm_client.set_system_instruction(system_instruction)

            # 6. Initialize message history with system instruction
            self.conversation.add_message("system", system_instruction)

            logging.info("LLM client and system prompt prepared successfully.")
            return True

        except (
            FileNotFoundError,
            json.JSONDecodeError,
            ValueError,
            EnvironmentError,
            ConnectionError,
        ) as e:
            logging.error(f"Initialization failed: {e}")
            return False

    async def process_tool_requests(self, tool_calls: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Process all tool calls in a response.
        
        Args:
            tool_calls: List of tool call requests.
            
        Returns:
            A consolidated result with all tool results.
        """
        consolidated_result = {
            "role": "user",
            "content": []
        }
        
        for tool_call in tool_calls:
            tool_name = tool_call.get("tool")
            tool_id = tool_call.get("toolUseId", str(uuid.uuid4()))
            arguments = tool_call.get("arguments", {})
            
            # Execute the tool
            result = await self.gemini_server.execute_tool(tool_name, arguments, tool_id)
            
            # Add the result to the consolidated result
            if "toolResult" in result and "content" in result["toolResult"]:
                consolidated_result["content"].extend(result["toolResult"]["content"])
        
        # Get page info for additional context
        try:
            page_info = await self.gemini_server.execute_tool("get_page_info", {})
            if "toolResult" in page_info and "content" in page_info["toolResult"]:
                consolidated_result["content"].extend(page_info["toolResult"]["content"])
        except Exception as e:
            logging.warning(f"Error getting page info: {e}")
            
        return consolidated_result

    async def execute_task(self, task_description: str) -> None:
        """Execute a complex task using the web automation tools.
        
        Args:
            task_description: The description of the task to execute.
        """
        # Add the task to conversation
        self.conversation.add_message("user", task_description)
        
        # Initial request to model
        llm_raw_response = self.llm_client.get_response(task_description)
        
        # Check if it's a tool call
        parsed_tool_call = self.llm_client.extract_tool_call_json(llm_raw_response)
        
        if not parsed_tool_call:
            # Not a tool call, just a regular response
            self.conversation.add_message("assistant", llm_raw_response)
            print(f"\nAssistant: {llm_raw_response} - Response by Default Model: {self.llm_model_name}")
            return
            
        # It's a tool call - enter the tool execution loop
        self.conversation.add_message("assistant", llm_raw_response)
        print(f"\nAssistant: {llm_raw_response} - MCP Client Model: {self.llm_model_name}")
        
        # Task automation loop
        stop_reason = "tool_use"  # Assume we need to use tools initially
        nb_request = 1
        
        while stop_reason == "tool_use":
            nb_request += 1
            
            # Extract tool calls
            tool_calls = []
            tool_call = {
                "tool": parsed_tool_call.get("tool"),
                "arguments": parsed_tool_call.get("arguments", {}),
                "toolUseId": str(uuid.uuid4())
            }
            tool_calls.append(tool_call)
            
            print(f"\nExecuting tool: {tool_call['tool']}")
            print(f"Tool arguments: {json.dumps(tool_call['arguments'], indent=2)}")
            
            # Execute all tools
            tool_results = await self.process_tool_requests(tool_calls)
            
            # Add tool results to conversation
            self.conversation.add_message("user", tool_results["content"])
            
            # Check if conversation needs summarization
            if self.conversation.should_summarize():
                logging.info("Summarizing conversation...")
                self.conversation.summarize_conversation()
                
            # Remove media from old messages to reduce token usage
            self.conversation.remove_media_except_last_turn()
            
            # Get next response from model
            print(f"Sending request {nb_request} to model...")
            
            # Create a simple text prompt for the next request
            next_prompt = "Continue with the task. What's the next step?"
            llm_raw_response = self.llm_client.get_response(next_prompt)
            
            # Parse next tool call
            parsed_tool_call = self.llm_client.extract_tool_call_json(llm_raw_response)
            
            # Add response to conversation
            self.conversation.add_message("assistant", llm_raw_response)
            print(f"\nAssistant: {llm_raw_response}")
            
            # Check if we should continue with tool execution
            if parsed_tool_call:
                stop_reason = "tool_use"
            else:
                stop_reason = "content_stopped"
                print("\nTask completed or awaiting further instructions.")

    async def start(self) -> None:
        """Main chat session handler."""
        # Prepare LLM and tools first
        if not await self._prepare_llm():
            print("Failed to initialize the chat session. Exiting.")
            await self.cleanup_servers()  # Ensure cleanup even on init failure
            return

        print("\nChat session started. Type 'quit' or 'exit' to end.")

        while True:
            try:
                user_input = input("You: ").strip()
                if user_input.lower() in ["quit", "exit"]:
                    logging.info("\nExiting...")
                    break
                if not user_input:
                    continue

                # Regular chat vs. task execution
                if "search" in user_input.lower() or any(tool_keyword in user_input.lower() for tool_keyword in ["navigate", "browse", "screenshot", "click"]):
                    # This is likely a task requiring tools, use the task execution mode
                    await self.execute_task(user_input)
                else:
                    # Regular chat without task automation
                    # Add user message to history
                    self.conversation.add_message("user", user_input)

                    # Check if conversation needs summarization
                    if self.conversation.should_summarize():
                        logging.info("Summarizing conversation...")
                        self.conversation.summarize_conversation()

                    # Get LLM response
                    llm_raw_response = self.llm_client.get_response(user_input)
                    parsed_tool_call = self.llm_client.extract_tool_call_json(llm_raw_response)

                    if parsed_tool_call:
                        # It's a tool call
                        tool_name = parsed_tool_call.get("tool")
                        arguments = parsed_tool_call.get("arguments", {})

                        # Add assistant's response to history
                        self.conversation.add_message("assistant", llm_raw_response)
                        print(f"\nAssistant: {llm_raw_response} - MCP Client Model: {self.llm_model_name}")

                        # Ask if the user wants to execute the tool
                        execute = input("\nExecute this tool? (y/n): ").strip().lower()
                        if execute == 'y':
                            # Switch to task execution mode
                            await self.execute_task(user_input)
                    else:
                        # Regular response
                        self.conversation.add_message("assistant", llm_raw_response)
                        print(f"\nAssistant: {llm_raw_response} - Response by Default Model: {self.llm_model_name}")

            except KeyboardInterrupt:
                logging.info("\nExiting...")
                break
            except ConnectionError as e:
                logging.error(f"Connection Error: {e}. Cannot continue.")
                print(
                    "Assistant: Sorry, I'm having "
                    "trouble connecting to the service. "
                    "Please try again later."
                )
                break  # Exit loop on connection errors

        # Try to download any artifacts before cleanup
        try:
            if self.gemini_server.artifact_uris:
                print(f"\nDownloading {len(self.gemini_server.artifact_uris)} artifacts...")
                downloaded_paths = await self.gemini_server.download_artifacts(self.download_dir)
                if downloaded_paths:
                    print(f"Downloaded {len(downloaded_paths)} artifacts to {self.download_dir}:")
                    for path in downloaded_paths:
                        print(f"  - {path}")
        except Exception as e:
            logging.error(f"Error downloading artifacts: {e}")
            
        # Cleanup after the loop finishes
        await self.cleanup_servers()


async def main() -> None:
    """Initialize and run the chat session."""
    config_loader = Configuration()
    try:
        # Load .env variables (like API keys)
        config_loader.load_env()
        # Load server configurations
        server_configs = config_loader.load_config("servers_config.json")
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logging.error(f"Failed to load configuration: {e}. Exiting.")
        return

    gemini_server_config_data = server_configs.get("geminiServer")
    if not gemini_server_config_data or "config" not in gemini_server_config_data:
        logging.error("Configuration for 'geminiServer' is missing")
        return

    # Extract LLM specific config (adjust keys as needed in your config)
    llm_project = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    llm_location = os.getenv(
        "GOOGLE_CLOUD_LOCATION", "us-central1"
    )  # Default if not set
    llm_model = os.getenv(
        "LLM_MODEL_NAME", "gemini-2.0-flash"
    )  # Default model, more flexible

    if not llm_project or not llm_location:
        logging.error(
            "Environment variables"
            " `GOOGLE_CLOUD_PROJECT` and "
            "`GOOGLE_CLOUD_LOCATION` must be set in client."
        )
        sys.exit(1)

    # --- Initialize Components ---
    gemini_server = Server(
        gemini_server_config_data.get("name", "gemini_llm_server"),
        gemini_server_config_data["config"],
    )

    llm_client = LLMClient(
        model_name=llm_model, project=llm_project, location=llm_location
    )

    # --- Start Chat ---
    chat_session = ChatSession(gemini_server, llm_client)
    await chat_session.start()

    # Perform cleanup if possible, although server might not be initialized
    if "gemini_server" in locals() and gemini_server.session:
        await gemini_server.cleanup()


if __name__ == "__main__":
    # load_dotenv() is called inside main() now for better encapsulation
    asyncio.run(main())