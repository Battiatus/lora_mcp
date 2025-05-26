"""
Script de test pour l'API MCP Server
Démontre comment utiliser l'API avec des exemples pratiques
"""

import asyncio
import aiohttp
import json
import base64
from typing import Dict, Any, Optional
from datetime import datetime

class MCPAPIClient:
    """Client pour interagir avec l'API MCP Server"""
    
    def __init__(self, base_url: str = "http://localhost:8080", token: str = "test-token"):
        self.base_url = base_url
        self.token = token
        self.session_id = None
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.session.close()
    
    async def _request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Effectue une requête HTTP à l'API"""
        url = f"{self.base_url}{endpoint}"
        
        async with self.session.request(method, url, headers=self.headers, json=data) as response:
            response_data = await response.json()
            
            if response.status >= 400:
                raise Exception(f"API Error {response.status}: {response_data}")
            
            return response_data
    
    async def create_session(self) -> str:
        """Crée une nouvelle session de navigation"""
        response = await self._request("POST", "/sessions")
        self.session_id = response["session_id"]
        print(f"✅ Session créée: {self.session_id}")
        return self.session_id
    
    async def navigate(self, url: str) -> Dict[str, Any]:
        """Navigue vers une URL"""
        data = {
            "url": url,
            "session_id": self.session_id
        }
        response = await self._request("POST", "/tools/navigate", data)
        print(f"✅ Navigation vers {url}")
        return response["result"]
    
    async def screenshot(self) -> str:
        """Prend une capture d'écran"""
        response = await self._request("POST", f"/tools/screenshot?session_id={self.session_id}")
        print(f"✅ Screenshot pris: {response['filename']}")
        return response["image_base64"]
    
    async def click(self, x: int, y: int) -> Dict[str, Any]:
        """Clique à des coordonnées spécifiques"""
        data = {
            "x": x,
            "y": y,
            "session_id": self.session_id
        }
        response = await self._request("POST", "/tools/click", data)
        print(f"✅ Clic effectué à ({x}, {y})")
        return response["result"]
    
    async def type_text(self, text: str, submit: bool = False) -> Dict[str, Any]:
        """Tape du texte"""
        data = {
            "text": text,
            "submit": submit,
            "session_id": self.session_id
        }
        response = await self._request("POST", "/tools/type", data)
        print(f"✅ Texte tapé: '{text}'" + (" [ENTER]" if submit else ""))
        return response["result"]
    
    async def find_element(self, selector: str) -> Dict[str, Any]:
        """Trouve un élément par sélecteur CSS"""
        data = {
            "selector": selector,
            "session_id": self.session_id
        }
        response = await self._request("POST", "/tools/element/find", data)
        print(f"✅ Élément trouvé: {selector}")
        return response["result"]
    
    async def click_element(self, selector: str) -> Dict[str, Any]:
        """Clique sur un élément"""
        data = {
            "selector": selector,
            "session_id": self.session_id
        }
        response = await self._request("POST", "/tools/element/click", data)
        print(f"✅ Clic sur élément: {selector}")
        return response["result"]
    
    async def extract_text(self, selector: str) -> Dict[str, Any]:
        """Extrait le texte d'éléments"""
        data = {
            "selector": selector,
            "session_id": self.session_id
        }
        response = await self._request("POST", "/tools/element/extract-text", data)
        print(f"✅ Texte extrait de: {selector}")
        return response["result"]
    
    async def find_videos(self) -> Dict[str, Any]:
        """Trouve les vidéos sur la page"""
        response = await self._request("POST", f"/tools/video/find?session_id={self.session_id}")
        print(f"✅ Vidéos trouvées: {response['result']['count']}")
        return response["result"]
    
    async def close_session(self) -> None:
        """Ferme la session actuelle"""
        if self.session_id:
            await self._request("DELETE", f"/sessions/{self.session_id}")
            print(f"✅ Session fermée: {self.session_id}")
            self.session_id = None


async def test_basic_navigation():
    """Test de navigation basique"""
    print("\n🧪 Test 1: Navigation basique")
    print("=" * 50)
    
    async with MCPAPIClient() as client:
        # Créer une session
        await client.create_session()
        
        # Naviguer vers une page
        result = await client.navigate("https://example.com")
        print(f"  - Titre: {result['title']}")
        print(f"  - URL: {result['url']}")
        print(f"  - Status: {result['status_code']}")
        
        # Prendre une capture d'écran
        screenshot_base64 = await client.screenshot()
        print(f"  - Screenshot length: {len(screenshot_base64)} chars")
        
        # Fermer la session
        await client.close_session()


async def test_form_interaction():
    """Test d'interaction avec un formulaire"""
    print("\n🧪 Test 2: Interaction avec formulaire")
    print("=" * 50)
    
    async with MCPAPIClient() as client:
        await client.create_session()
        
        # Naviguer vers une page avec formulaire
        await client.navigate("https://httpbin.org/forms/post")
        
        # Trouver et remplir les champs
        await client.click_element("input[name='custname']")
        await client.type_text("John Doe")
        
        await client.click_element("input[name='custtel']")
        await client.type_text("555-1234")
        
        await client.click_element("textarea[name='comments']")
        await client.type_text("Ceci est un test automatisé")
        
        # Soumettre le formulaire
        await client.click_element("button[type='submit']")
        
        # Attendre et extraire le résultat
        await asyncio.sleep(2)
        result = await client.extract_text("pre")
        print(f"  - Résultat: {result}")
        
        await client.close_session()


async def test_video_detection():
    """Test de détection de vidéos"""
    print("\n🧪 Test 3: Détection de vidéos")
    print("=" * 50)
    
    async with MCPAPIClient() as client:
        await client.create_session()
        
        # Naviguer vers YouTube
        await client.navigate("https://www.youtube.com")
        
        # Attendre le chargement
        await asyncio.sleep(3)
        
        # Chercher des vidéos
        videos = await client.find_videos()
        print(f"  - Nombre de vidéos trouvées: {videos['count']}")
        
        for i, video in enumerate(videos['videos'][:3]):
            print(f"  - Vidéo {i+1}: {video['type']} - {video.get('platform', 'N/A')}")
        
        await client.close_session()


async def test_search_workflow():
    """Test d'un workflow de recherche complet"""
    print("\n🧪 Test 4: Workflow de recherche")
    print("=" * 50)
    
    async with MCPAPIClient() as client:
        await client.create_session()
        
        # Aller sur Google
        await client.navigate("https://www.google.com")
        
        # Accepter les cookies si nécessaire
        try:
            await client.click_element("button[id*='accept']")
            print("  - Cookies acceptés")
        except:
            print("  - Pas de bannière de cookies")
        
        # Chercher quelque chose
        await client.click_element("input[name='q']")
        await client.type_text("OpenAI GPT", submit=True)
        
        # Attendre les résultats
        await asyncio.sleep(2)
        
        # Extraire les titres des résultats
        results = await client.extract_text("h3")
        print(f"  - Résultats trouvés: {results['count']}")
        
        for i, result in enumerate(results['elements'][:5]):
            print(f"  - Résultat {i+1}: {result['text']}")
        
        await client.close_session()


async def test_javascript_execution():
    """Test d'exécution JavaScript"""
    print("\n🧪 Test 5: Exécution JavaScript")
    print("=" * 50)
    
    async with MCPAPIClient() as client:
        await client.create_session()
        
        await client.navigate("https://example.com")
        
        # Exécuter du JavaScript
        data = {
            "script": "return document.title + ' - ' + window.location.href;",
            "session_id": client.session_id
        }
        response = await client._request("POST", "/tools/javascript", data)
        print(f"  - Résultat JS: {response['result']['result']}")
        
        # Modifier la page
        data = {
            "script": """
                document.body.style.backgroundColor = 'lightblue';
                document.querySelector('h1').textContent = 'Modifié par JavaScript!';
                return 'Page modifiée';
            """,
            "session_id": client.session_id
        }
        response = await client._request("POST", "/tools/javascript", data)
        print(f"  - Modification: {response['result']['result']}")
        
        # Prendre un screenshot pour voir le changement
        await client.screenshot()
        
        await client.close_session()


async def test_error_handling():
    """Test de gestion des erreurs"""
    print("\n🧪 Test 6: Gestion des erreurs")
    print("=" * 50)
    
    async with MCPAPIClient() as client:
        # Test sans session
        try:
            await client.click(100, 200)
        except Exception as e:
            print(f"  ✅ Erreur attendue (pas de session): {e}")
        
        # Créer une session
        await client.create_session()
        
        # Test avec sélecteur invalide
        try:
            await client.click_element("selector.qui.nexiste.pas")
        except Exception as e:
            print(f"  ✅ Erreur attendue (sélecteur invalide): {e}")
        
        # Test avec URL invalide
        try:
            await client.navigate("pas-une-url")
        except Exception as e:
            print(f"  ✅ Erreur attendue (URL invalide): {e}")
        
        await client.close_session()


async def test_concurrent_sessions():
    """Test de sessions concurrentes"""
    print("\n🧪 Test 7: Sessions concurrentes")
    print("=" * 50)
    
    async def navigate_and_screenshot(client: MCPAPIClient, url: str, name: str):
        await client.create_session()
        await client.navigate(url)
        await client.screenshot()
        print(f"  - {name} terminé")
        await client.close_session()
    
    # Créer plusieurs clients
    async with MCPAPIClient() as client1, MCPAPIClient() as client2, MCPAPIClient() as client3:
        # Lancer des navigations en parallèle
        await asyncio.gather(
            navigate_and_screenshot(client1, "https://example.com", "Client 1"),
            navigate_and_screenshot(client2, "https://httpbin.org", "Client 2"),
            navigate_and_screenshot(client3, "https://www.google.com", "Client 3")
        )


async def main():
    """Exécute tous les tests"""
    print("🚀 Démarrage des tests de l'API MCP Server")
    print("=" * 70)
    print(f"📍 URL de base: http://localhost:8080")
    print(f"🔑 Token: test-token")
    print(f"⏰ Heure: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    try:
        # Tests de base
        await test_basic_navigation()
        await test_form_interaction()
        await test_video_detection()
        await test_search_workflow()
        await test_javascript_execution()
        await test_error_handling()
        await test_concurrent_sessions()
        
        print("\n✅ Tous les tests sont terminés avec succès!")
        
    except Exception as e:
        print(f"\n❌ Erreur lors des tests: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Lancer les tests
    asyncio.run(main())