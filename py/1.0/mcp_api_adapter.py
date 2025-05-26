import asyncio
import json
import uuid
import os
from typing import Dict, Any, Optional
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException, WebSocket, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# Import des composants MCP existants
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.types import CallToolResult

# Import du client existant avec TOUTE son intelligence
from client import (
    LLMClient, 
    ConversationManager,
    Configuration,
    Server as MCPServer,
    Tool
)

# Modèles Pydantic
class TaskRequest(BaseModel):
    """Requête pour exécuter une tâche complexe via le client MCP intelligent"""
    task_description: str = Field(..., description="Description de la tâche à accomplir")
    model: str = Field("gemini-2.0-flash", description="Modèle LLM à utiliser")
    session_id: Optional[str] = Field(None, description="ID de session pour réutiliser un contexte")
    
    class Config:
        schema_extra = {
            "example": {
                "task_description": "Navigue vers TikTok, trouve une vidéo populaire et télécharge-la",
                "model": "gemini-2.0-flash"
            }
        }

class ToolExecutionRequest(BaseModel):
    """Requête directe pour exécuter un outil MCP spécifique"""
    tool_name: str = Field(..., description="Nom de l'outil MCP")
    arguments: Dict[str, Any] = Field(..., description="Arguments pour l'outil")
    session_id: Optional[str] = Field(None, description="ID de session")

@dataclass
class MCPSessionContext:
    """Contexte d'une session MCP active"""
    session_id: str
    mcp_server: MCPServer
    llm_client: LLMClient
    conversation: ConversationManager
    tools: Dict[str, Tool]
    active: bool = True

class MCPApiAdapter:
    """Adaptateur qui expose le client MCP intelligent via API HTTP"""
    
    def __init__(self):
        self.sessions: Dict[str, MCPSessionContext] = {}
        self.config = self._load_configuration()
        
    def _load_configuration(self) -> Dict[str, Any]:
        """Charge la configuration depuis les fichiers"""
        Configuration.load_env()
        return Configuration.load_config("servers_config.json")
    
    async def create_session(self, model_name: str = "gemini-2.0-flash") -> MCPSessionContext:
        """Crée une nouvelle session MCP avec serveur et client"""
        session_id = str(uuid.uuid4())
        
        # Configurer le serveur MCP
        gemini_server_config = self.config.get("geminiServer", {})
        mcp_server = MCPServer(
            name=gemini_server_config.get("name", "gemini_llm_server"),
            config=gemini_server_config["config"]
        )
        
        # Initialiser le serveur
        await mcp_server.initialize()
        
        # Lister les outils disponibles
        tools = await mcp_server.list_tools()
        tools_dict = {tool.name: tool for tool in tools}
        
        # Configurer le client LLM
        llm_client = LLMClient(
            model_name=model_name,
            project=os.getenv("GOOGLE_CLOUD_PROJECT", ""),
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        )
        
        # Préparer le système prompt avec les outils
        tools_description = "\n".join([tool.format_for_llm() for tool in tools])
        system_instruction = f"""You are an advanced research assistant with web navigation and vision capabilities.

Available tools:
{tools_description}

When you need to use a tool, you must ONLY respond with the exact format below, nothing else:
{{
    "tool": "tool-name",
    "arguments": {{
        "argument-name": "value"
    }}
}}"""
        
        # Configurer le LLM
        llm_client.set_system_instruction(system_instruction)
        
        # Créer le gestionnaire de conversation
        conversation = ConversationManager(llm_client)
        conversation.add_message("system", system_instruction)
        
        # Créer le contexte de session
        context = MCPSessionContext(
            session_id=session_id,
            mcp_server=mcp_server,
            llm_client=llm_client,
            conversation=conversation,
            tools=tools_dict
        )
        
        self.sessions[session_id] = context
        return context
    
    async def execute_task(self, task_description: str, session_id: Optional[str] = None, model: str = "gemini-2.0-flash") -> AsyncIterator[Dict[str, Any]]:
        """Exécute une tâche complexe en utilisant l'intelligence du client MCP"""
        
        # Obtenir ou créer une session
        if session_id and session_id in self.sessions:
            context = self.sessions[session_id]
        else:
            context = await self.create_session(model)
            session_id = context.session_id
        
        try:
            # Ajouter la tâche à la conversation
            context.conversation.add_message("user", task_description)
            
            # Obtenir la première réponse du LLM
            llm_response = context.llm_client.get_response(task_description)
            
            # Vérifier si c'est un appel d'outil
            parsed_tool_call = LLMClient.extract_tool_call_json(llm_response)
            
            if not parsed_tool_call:
                # Réponse simple sans outil
                context.conversation.add_message("assistant", llm_response)
                yield {
                    "type": "assistant_response",
                    "content": llm_response,
                    "session_id": session_id
                }
                return
            
            # C'est une tâche nécessitant des outils - boucle d'exécution
            context.conversation.add_message("assistant", llm_response)
            yield {
                "type": "assistant_response",
                "content": llm_response,
                "session_id": session_id
            }
            
            # Boucle d'automatisation des tâches
            while parsed_tool_call:
                # Exécuter l'outil
                tool_name = parsed_tool_call.get("tool")
                arguments = parsed_tool_call.get("arguments", {})
                tool_id = str(uuid.uuid4())
                
                yield {
                    "type": "tool_execution",
                    "tool": tool_name,
                    "arguments": arguments,
                    "tool_id": tool_id
                }
                
                # Exécuter réellement l'outil
                result = await context.mcp_server.execute_tool(tool_name, arguments, tool_id)
                
                yield {
                    "type": "tool_result",
                    "tool": tool_name,
                    "tool_id": tool_id,
                    "result": result
                }
                
                # Ajouter le résultat à la conversation
                if "toolResult" in result:
                    context.conversation.add_message("user", result["toolResult"]["content"])
                
                # Vérifier si la conversation doit être résumée
                if context.conversation.should_summarize():
                    context.conversation.summarize_conversation()
                    yield {
                        "type": "conversation_summarized",
                        "message": "Conversation summarized to reduce token usage"
                    }
                
                # Obtenir la prochaine action du LLM
                next_prompt = "Continue with the task. What's the next step?"
                llm_response = context.llm_client.get_response(next_prompt)
                
                # Vérifier si c'est encore un appel d'outil
                parsed_tool_call = LLMClient.extract_tool_call_json(llm_response)
                
                context.conversation.add_message("assistant", llm_response)
                yield {
                    "type": "assistant_response",
                    "content": llm_response,
                    "session_id": session_id
                }
                
                if not parsed_tool_call:
                    # Tâche terminée
                    yield {
                        "type": "task_complete",
                        "message": "Task completed successfully",
                        "session_id": session_id
                    }
                    
                    # Télécharger les artifacts si disponibles
                    if context.mcp_server.artifact_uris:
                        downloaded = await context.mcp_server.download_artifacts()
                        yield {
                            "type": "artifacts_downloaded",
                            "artifacts": downloaded
                        }
                    
                    break
                    
        except Exception as e:
            yield {
                "type": "error",
                "error": str(e),
                "session_id": session_id
            }
    
    async def execute_tool_direct(self, tool_name: str, arguments: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
        """Exécute directement un outil MCP sans passer par le LLM"""
        
        # Obtenir ou créer une session
        if session_id and session_id in self.sessions:
            context = self.sessions[session_id]
        else:
            context = await self.create_session()
            session_id = context.session_id
        
        # Vérifier que l'outil existe
        if tool_name not in context.tools:
            raise ValueError(f"Tool '{tool_name}' not found")
        
        # Exécuter l'outil
        result = await context.mcp_server.execute_tool(tool_name, arguments)
        
        return {
            "session_id": session_id,
            "tool": tool_name,
            "result": result
        }
    
    async def list_tools(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        """Liste tous les outils MCP disponibles"""
        if session_id and session_id in self.sessions:
            context = self.sessions[session_id]
        else:
            context = await self.create_session()
            session_id = context.session_id
        
        tools_info = []
        for tool_name, tool in context.tools.items():
            tools_info.append({
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema.get("properties", {})
            })
        
        return {
            "session_id": session_id,
            "tools": tools_info
        }
    
    async def cleanup_session(self, session_id: str):
        """Nettoie une session MCP"""
        if session_id in self.sessions:
            context = self.sessions[session_id]
            await context.mcp_server.cleanup()
            del self.sessions[session_id]

# Création de l'API FastAPI
app = FastAPI(
    title="MCP Intelligent Web Automation API",
    description="API qui expose le client MCP intelligent avec orchestration LLM",
    version="1.0.0"
)

# Instance de l'adaptateur
adapter = MCPApiAdapter()

# Points d'accès API

@app.post("/api/v1/tasks/execute")
async def execute_task(request: TaskRequest):
    """
    Exécute une tâche complexe en utilisant l'intelligence du client MCP
    
    Le LLM va orchestrer automatiquement l'utilisation des outils pour accomplir la tâche.
    """
    async def event_generator():
        async for event in adapter.execute_task(
            request.task_description, 
            request.session_id,
            request.model
        ):
            yield f"data: {json.dumps(event)}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

@app.post("/api/v1/tools/{tool_name}/execute")
async def execute_tool(tool_name: str, request: ToolExecutionRequest):
    """
    Exécute directement un outil MCP spécifique
    
    Utile pour des opérations simples sans orchestration LLM.
    """
    try:
        result = await adapter.execute_tool_direct(
            tool_name,
            request.arguments,
            request.session_id
        )
        return JSONResponse(content=result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/tools")
async def list_tools(session_id: Optional[str] = None):
    """Liste tous les outils MCP disponibles"""
    return await adapter.list_tools(session_id)

@app.websocket("/ws/session")
async def websocket_session(websocket: WebSocket):
    """Session WebSocket pour interaction temps réel avec le client MCP"""
    await websocket.accept()
    session_id = None
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "execute_task":
                async for event in adapter.execute_task(
                    data["task_description"],
                    session_id,
                    data.get("model", "gemini-2.0-flash")
                ):
                    await websocket.send_json(event)
                    if "session_id" in event:
                        session_id = event["session_id"]
            
            elif data["type"] == "execute_tool":
                result = await adapter.execute_tool_direct(
                    data["tool_name"],
                    data["arguments"],
                    session_id
                )
                await websocket.send_json(result)
                
    except Exception as e:
        await websocket.send_json({"type": "error", "error": str(e)})
    finally:
        if session_id:
            await adapter.cleanup_session(session_id)
        await websocket.close()

@app.delete("/api/v1/sessions/{session_id}")
async def close_session(session_id: str):
    """Ferme une session MCP et libère les ressources"""
    await adapter.cleanup_session(session_id)
    return {"message": "Session closed successfully"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)