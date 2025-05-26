import asyncio
import aiohttp
import json

async def test_intelligent_task():
    """Test une tâche complexe avec orchestration LLM"""
    
    url = "http://localhost:8000/api/v1/tasks/execute"
    
    # Tâche complexe qui nécessite plusieurs outils
    task = {
        "task_description": """
        Recherche sur Google les dernières actualités sur l'IA générative.
        Prends des captures d'écran des 3 premiers résultats.
        Crée un rapport markdown avec les principales informations trouvées.
        """,
        "model": "gemini-2.0-flash"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=task) as response:
            async for line in response.content:
                if line:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        event = json.loads(line[6:])
                        print(f"\nEvent: {event['type']}")
                        
                        if event['type'] == 'assistant_response':
                            print(f"Assistant: {event['content']}")
                        elif event['type'] == 'tool_execution':
                            print(f"Executing tool: {event['tool']} with {event['arguments']}")
                        elif event['type'] == 'tool_result':
                            print(f"Tool result received")
                        elif event['type'] == 'task_complete':
                            print("Task completed!")
                        elif event['type'] == 'artifacts_downloaded':
                            print(f"Artifacts: {event['artifacts']}")

async def test_direct_tool():
    """Test l'exécution directe d'un outil"""
    
    # D'abord, lister les outils disponibles
    async with aiohttp.ClientSession() as session:
        async with session.get("http://localhost:8000/api/v1/tools") as response:
            tools = await response.json()
            print("Available tools:")
            for tool in tools['tools']:
                print(f"- {tool['name']}: {tool['description']}")
        
        # Ensuite, naviguer vers une URL
        navigate_url = "http://localhost:8000/api/v1/tools/navigate/execute"
        navigate_data = {
            "arguments": {
                "url": "https://example.com"
            }
        }
        
        async with session.post(navigate_url, json=navigate_data) as response:
            result = await response.json()
            print(f"\nNavigation result: {result}")

async def test_websocket_session():
    """Test une session WebSocket interactive"""
    
    import websockets
    
    uri = "ws://localhost:8000/ws/session"
    
    async with websockets.connect(uri) as websocket:
        # Envoyer une tâche
        await websocket.send(json.dumps({
            "type": "execute_task",
            "task_description": "Prends une capture d'écran de la page actuelle et dis-moi ce que tu vois",
            "model": "gemini-2.0-flash"
        }))
        
        # Recevoir les événements
        while True:
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=30)
                event = json.loads(message)
                print(f"\nWebSocket Event: {event}")
                
                if event.get('type') == 'task_complete':
                    break
            except asyncio.TimeoutError:
                print("Timeout waiting for response")
                break

# Exécuter les tests
async def main():
    print("=== Test 1: Tâche intelligente ===")
    await test_intelligent_task()
    
    print("\n\n=== Test 2: Outil direct ===")
    await test_direct_tool()
    
    print("\n\n=== Test 3: Session WebSocket ===")
    await test_websocket_session()

if __name__ == "__main__":
    asyncio.run(main())