#!/usr/bin/env python
import asyncio
import uuid
import os
import sys
import logging

from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, List, Dict, Any

from dotenv import load_dotenv
load_dotenv()

import nest_asyncio
nest_asyncio.apply()

# --- Playwright (Puppeteer for Python) ---
from playwright.async_api import async_playwright, Playwright, Browser, Page

# --- Google GenAI & Traduction ---
from google import genai
from google.api_core import exceptions as google_exceptions
import google.auth
from google.cloud import translate_v3 as translate
from google.genai import types as genai_types

# --- FastMCP ---
from mcp.server.fastmcp import FastMCP, Context
from mcp.server.fastmcp.utilities.types import Image
from mcp.types import ResourceContents, TextResourceContents, EmbeddedResource

# Configure logging - Set default level to INFO
logging.basicConfig(
    level=logging.ERROR,
    format="%(asctime)s - %(levelname)s [%(name)s] - %(message)s",
)

# --- Suppress Verbose Google API Logs ---
for name in (
    "google.api_core",
    "google.auth",
    "google.generativeai",
    "google.cloud",
    "urllib3",
    "httpcore",
    "httpx",
):
    logging.getLogger(name).setLevel(logging.WARNING)

# --- Configuration (unchanged) ---
GOOGLE_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_LOCATION   = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

if not GOOGLE_PROJECT_ID or not GOOGLE_LOCATION:
    logging.error(
        "Environment variables"
        " `GOOGLE_CLOUD_PROJECT` and "
        "`GOOGLE_CLOUD_LOCATION` must be set."
    )
    sys.exit(1)

# --- Initialize Gemini Client (unchanged) ---
try:
    GENAI_CLIENT = genai.Client(
        vertexai=True, project=GOOGLE_PROJECT_ID, location=GOOGLE_LOCATION
    )
    logging.info(
        "Gemini Client initialized for "
        f"project `{GOOGLE_PROJECT_ID}` in "
        f"location `{GOOGLE_LOCATION}`"
    )
except google.auth.exceptions.DefaultCredentialsError as e:
    logging.error(
        "Failed to initialize Gemini Client " f"due to authentication issues: {e}"
    )
    GENAI_CLIENT = None
except google_exceptions.PermissionDenied as e:
    logging.error(
        "Failed to initialize Gemini Client" f" due to permission issues: {e}"
    )
    GENAI_CLIENT = None
except google_exceptions.GoogleAPIError as e:
    logging.error(
        "Failed to initialize Gemini Client " f"due to a Google API error: {e}"
    )
    GENAI_CLIENT = None
except RuntimeError as e:
    logging.error(f"Failed to initialize Gemini Client " f"due to a runtime error: {e}")
    GENAI_CLIENT = None

if GENAI_CLIENT:
    logging.info("GENAI_CLIENT is ready.")
else:
    logging.warning(
        "GENAI_CLIENT could not be initialized. "
        "Further operations depending on it may fail."
    )

# --- Playwright Lifespan & Context ---
SESSION_ID = str(uuid.uuid4())
os.makedirs(f"screenshot/{SESSION_ID}", exist_ok=True)
os.makedirs(f"artefacts/{SESSION_ID}", exist_ok=True)

@dataclass
class AppContext:
    playwright: Playwright
    browser: Browser
    page: Page

@asynccontextmanager
async def app_lifespan(server: FastMCP) -> AsyncIterator[AppContext]:
    """Initialize and clean up Playwright browser resources"""
    pw      = await async_playwright().start()
    browser = await pw.chromium.launch()
    page    = await browser.new_page()
    await page.goto("https://example.com", wait_until="networkidle")
    print(f"*** Playwright ready (session {SESSION_ID}) ***")
    try:
        yield AppContext(playwright=pw, browser=browser, page=page)
    finally:
        await browser.close()
        await pw.stop()
        print("*** Playwright stopped ***")

# --- Instantiate High-Level MCP Server (with lifespan) ---
try:
    mcp_host = FastMCP(
        "gemini-complexity-server",
        lifespan=app_lifespan,
        description="GenAI + Traduction + Playwright Automation"
    )
except NameError:
    logging.error("MCPHost class not available. Cannot create MCP server.")
    sys.exit(1)

# --- Resource endpoints for artifacts ---
@mcp_host.resource("artifact://{session_id}/{filename}")
async def get_artifact(session_id: str, filename: str) -> List[ResourceContents]:
    path = f"artefacts/{session_id}/{filename}"
    if not os.path.exists(path):
        return [TextResourceContents(
            uri=f"artifact://{session_id}/{filename}",
            text=f"Error: Artifact not found: {filename}",
            mimeType="text/plain"
        )]
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    mime = "text/plain"
    if filename.endswith(".md"):   mime = "text/markdown"
    if filename.endswith(".html"): mime = "text/html"
    if filename.endswith(".json"): mime = "application/json"
    return [TextResourceContents(
        uri=f"artifact://{session_id}/{filename}",
        text=content,
        mimeType=mime
    )]

@mcp_host.resource("artifact://list")
async def list_artifacts() -> List[ResourceContents]:
    dirpath = f"artefacts/{SESSION_ID}"
    if not os.path.isdir(dirpath):
        return [TextResourceContents(
            uri="artifact://list",
            text="No artifacts found for this session",
            mimeType="text/plain"
        )]
    files = os.listdir(dirpath)
    lines = ["Available artifacts:"]
    for fn in files:
        lines.append(f"- {fn}: artifact://{SESSION_ID}/{fn}")
    return [TextResourceContents(
        uri="artifact://list",
        text="\n".join(lines),
        mimeType="text/plain"
    )]

# --- Common Gemini API Call Function (unchanged) ---
async def call_gemini_model(model_name: str, prompt: str) -> str:
    if not GENAI_CLIENT:
        raise RuntimeError("Gemini client not initialized.")
    logging.debug(f"Calling model '{model_name}' for prompt: {prompt[:70]}...")
    contents = [genai_types.Content(role="user", parts=[genai_types.Part(text=prompt)])]
    generate_content_config = genai_types.GenerateContentConfig(
        temperature=0.2,
        top_p=0.8,
        max_output_tokens=1024,
        response_modalities=["TEXT"],
        safety_settings=[
            genai_types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
            genai_types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
            genai_types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
            genai_types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF"),
        ],
    )
    try:
        response = GENAI_CLIENT.models.generate_content(
            model=model_name, contents=contents, config=generate_content_config
        )
        if response:
            return response.text
        logging.warning(f"Model '{model_name}' response candidate has no text parts.")
        return "Error: Model returned a response structure without text content."
    except google_exceptions.GoogleAPIError as e:
        logging.error(f"Google API error calling model {model_name}: {e}")
        raise RuntimeError(f"Gemini API Error ({e.message or type(e).__name__})") from e

# --- Translation function (unchanged) ---
def translate_text(
    project_id: str,
    location: str,
    source_language_code: str,
    target_language_code: str,
    source_text: str,
) -> str | None:
    try:
        client = translate.TranslationServiceClient()
        parent = f"projects/{project_id}/locations/{location}"
        response = client.translate_text(
            request={
                "parent": parent,
                "contents": [source_text],
                "mime_type": "text/plain",
                "source_language_code": source_language_code,
                "target_language_code": target_language_code,
            }
        )
        if response.translations:
            return response.translations[0].translated_text
        logging.warning("Warning: No translations found in the response.")
        return None
    except google.auth.exceptions.DefaultCredentialsError as e:
        logging.error(f"Authentication failed: {e}")
        return None
    except google_exceptions.GoogleAPIError as e:
        logging.error(f"Translation API error: {e}")
        return None

# --- Puppeteer tools to integrate exactly as requested ---
@mcp_host.tool()
async def navigate(url: str, ctx: Context) -> Dict[str, Any]:
    page: Page = ctx.request_context.lifespan_context.page
    await page.goto(url, wait_until="domcontentloaded")
    await asyncio.sleep(1)
    return {"title": await page.title(), "url": page.url}

@mcp_host.tool()
async def screenshot(ctx: Context) -> Image:
    page: Page = ctx.request_context.lifespan_context.page
    fname = f"screenshot/{SESSION_ID}/screenshot_{uuid.uuid4()}.jpeg"
    await page.screenshot(path=fname, quality=80, type="jpeg")
    return Image(path=fname, format="jpeg")

@mcp_host.tool()
async def click(x: int, y: int, ctx: Context) -> Dict[str, Any]:
    page: Page = ctx.request_context.lifespan_context.page
    await page.mouse.click(x, y)
    await asyncio.sleep(1)
    return {"clicked_at": {"x": x, "y": y}}

@mcp_host.tool()
async def scroll(direction: str, amount: int, ctx: Context) -> Dict[str, Any]:
    page: Page = ctx.request_context.lifespan_context.page
    if direction.lower() == "down":
        await page.evaluate(f"window.scrollBy(0, {amount})")
    else:
        await page.evaluate(f"window.scrollBy(0, -{amount})")
    await asyncio.sleep(1)
    return {"scrolled": True, "direction": direction, "amount": amount}

@mcp_host.tool()
async def type(text: str, ctx: Context, submit: bool = False) -> Dict[str, Any]:
    page: Page = ctx.request_context.lifespan_context.page
    await page.keyboard.type(text)
    submitted = False
    if submit:
        await page.keyboard.press("Enter")
        submitted = True
    return {"typed": True, "text": text, "submitted": submitted}

@mcp_host.tool()
async def get_page_info(ctx: Context) -> str:
    page: Page = ctx.request_context.lifespan_context.page
    title = await page.title()
    return f"Current page: Title='{title}', URL='{page.url}'"

@mcp_host.tool()
def write_file(filename: str, content: str, ctx: Context) -> EmbeddedResource:
    full = f"artefacts/{SESSION_ID}/{filename}"
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    uri = f"artifact://{SESSION_ID}/{filename}"
    mime = "text/plain"
    if filename.endswith(".md"):   mime = "text/markdown"
    if filename.endswith(".html"): mime = "text/html"
    if filename.endswith(".json"): mime = "application/json"
    res = TextResourceContents(uri=uri, mimeType=mime, text=content[:100])
    return EmbeddedResource(type="resource", resource=res)

# --- Existing Gemini & Traduction tools (unchanged) ---
@mcp_host.tool(
    name="translate_llm",
    description=(
        "Calls this translate_llm tool for requests explicitly asking "
        "for language translation or meaning clarification of non-English text."
    ),
)
async def call_translate(text: str, source_language: str, target_language: str) -> str:
    translated_result = translate_text(
        project_id=GOOGLE_PROJECT_ID,
        location=GOOGLE_LOCATION,
        source_language_code=source_language,
        target_language_code=target_language,
        source_text=text,
    )
    return translated_result or "\nTranslation failed."

@mcp_host.tool(
    name="gemini_flash_lite_2_0",
    description="Calls the Gemini 2.0 Flash Lite model for poetry prompts.",
)
async def call_gemini_flash_lite(prompt: str) -> str:
    model_name = "gemini-2.0-flash-lite-001"
    return await call_gemini_model(model_name, prompt)

@mcp_host.tool(
    name="gemini_flash_2_0",
    description="Calls the Gemini 2.0 Flash Thinking model for science prompts.",
)
async def call_gemini_flash(prompt: str) -> str:
    model_name = "gemini-2.0-flash"
    return await call_gemini_model(model_name, prompt)

@mcp_host.tool(
    name="gemini_pro_2_5",
    description="Calls the Gemini 2.5 Pro Thinking model for complex prompts.",
)
async def call_gemini_pro(prompt: str) -> str:
    model_name = "gemini-2.5-pro-exp-03-25"
    return await call_gemini_model(model_name, prompt)

# --- Main Execution Function (synchronous) ---
def main() -> None:
    if not GENAI_CLIENT:
        logging.error("Cannot start server: Gemini client not initialized.")
        return
    logging.info(f"Starting MCP server '{mcp_host.name}'")
    mcp_host.run()

if __name__ == "__main__":
    main()
