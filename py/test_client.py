# test_client.py
import requests
import json
import time
from typing import Optional, Dict, Any

class MCPAPIClient:
    """Client Python pour tester l'API MCP"""
    
    def __init__(self, base_url: str, api_token: str):
        self.base_url = base_url.rstrip('/')
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
        self.session_id = None
    
    def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """Effectue une requête HTTP vers l'API"""
        url = f"{self.base_url}{endpoint}"
        
        # Ajouter session_id si disponible et non fourni
        if data is None:
            data = {}
        if self.session_id and "session_id" not in data:
            data["session_id"] = self.session_id
        
        response = requests.request(
            method=method,
            url=url,
            headers=self.headers,
            json=data if method != "GET" else None,
            params=data if method == "GET" else None
        )
        
        response.raise_for_status()
        return response.json()
    
    def navigate(self, url: str, wait_for: str = "networkidle") -> Dict[str, Any]:
        """Navigue vers une URL"""
        result = self._make_request("POST", "/navigate", {
            "url": url,
            "wait_for": wait_for
        })
        
        # Sauvegarder session_id pour les prochaines requêtes
        if "session_id" in result:
            self.session_id = result["session_id"]
        
        return result
    
    def screenshot(self, full_page: bool = False) -> Dict[str, Any]:
        """Prend une capture d'écran"""
        return self._make_request("POST", "/screenshot", {
            "full_page": full_page
        })
    
    def click(self, x: int, y: int) -> Dict[str, Any]:
        """Clique à des coordonnées"""
        return self._make_request("POST", "/click", {
            "x": x,
            "y": y
        })
    
    def click_element(self, selector: str) -> Dict[str, Any]:
        """Clique sur un élément par sélecteur CSS"""
        return self._make_request("POST", "/click_element", {
            "selector": selector
        })
    
    def type_text(self, text: str, submit: bool = False) -> Dict[str, Any]:
        """Tape du texte"""
        return self._make_request("POST", "/type", {
            "text": text,
            "submit": submit
        })
    
    def type_in_element(self, selector: str, text: str, submit: bool = False) -> Dict[str, Any]:
        """Tape du texte dans un élément spécifique"""
        return self._make_request("POST", "/type_in_element", {
            "selector": selector,
            "text": text,
            "submit": submit
        })
    
    def extract_text(self, selector: str) -> Dict[str, Any]:
        """Extrait le texte d'éléments"""
        return self._make_request("POST", "/extract_text", {
            "selector": selector
        })
    
    def scroll(self, direction: str, amount: int) -> Dict[str, Any]:
        """Fait défiler la page"""
        return self._make_request("POST", "/scroll", {
            "direction": direction,
            "amount": amount
        })
    
    def download_video(self, url: str, filename: Optional[str] = None) -> Dict[str, Any]:
        """Télécharge une vidéo"""
        data = {"url": url}
        if filename:
            data["filename"] = filename
        return self._make_request("POST", "/download_video", data)
    
    def find_videos(self) -> Dict[str, Any]:
        """Trouve les vidéos sur la page actuelle"""
        return self._make_request("GET", "/find_videos")
    
    def get_page_info(self) -> Dict[str, Any]:
        """Obtient les informations de la page actuelle"""
        return self._make_request("GET", "/page_info")
    
    def list_sessions(self) -> Dict[str, Any]:
        """Liste toutes les sessions"""
        return self._make_request("GET", "/sessions")
    
    def close_session(self) -> Dict[str, Any]:
        """Ferme la session actuelle"""
        if not self.session_id:
            raise ValueError("No active session")
        
        result = self._make_request("DELETE", f"/sessions/{self.session_id}")
        self.session_id = None
        return result


# Script de test
if __name__ == "__main__":
    # Configuration
    API_URL = "http://localhost:8000/api/v1"
    API_TOKEN = "your-test-token"
    
    # Créer le client
    client = MCPAPIClient(API_URL, API_TOKEN)
    
    try:
        # Test 1: Navigation simple
        print("Test 1: Navigation...")
        result = client.navigate("https://example.com")
        print(f"✓ Navigation réussie: {result}")
        
        # Test 2: Screenshot
        print("\nTest 2: Screenshot...")
        result = client.screenshot()
        print(f"✓ Screenshot pris: {result}")
        
        # Test 3: Recherche d'éléments
        print("\nTest 3: Extraction de texte...")
        result = client.extract_text("h1")
        print(f"✓ Texte extrait: {result}")
        
        # Test 4: Interaction
        print("\nTest 4: Clic sur élément...")
        result = client.click_element("a")
        print(f"✓ Clic effectué: {result}")
        
        # Test 5: Saisie de texte
        print("\nTest 5: Saisie de texte...")
        result = client.type_in_element("input[type='text']", "Test API")
        print(f"✓ Texte saisi: {result}")
        
        # Test 6: Défilement
        print("\nTest 6: Défilement...")
        result = client.scroll("down", 500)
        print(f"✓ Défilement effectué: {result}")
        
        # Test 7: Info page
        print("\nTest 7: Info page...")
        result = client.get_page_info()
        print(f"✓ Info page: {result}")
        
        # Test 8: Vidéo TikTok
        print("\nTest 8: Téléchargement vidéo...")
        result = client.download_video(
            "https://www.tiktok.com/@test/video/123456",
            "test_video.mp4"
        )
        print(f"✓ Téléchargement lancé: {result}")
        
        # Test 9: Fermeture session
        print("\nTest 9: Fermeture session...")
        result = client.close_session()
        print(f"✓ Session fermée: {result}")
        
        print("\n✅ Tous les tests passés avec succès!")
        
    except Exception as e:
        print(f"\n❌ Erreur lors des tests: {e}")
        # Nettoyer la session si erreur
        if client.session_id:
            try:
                client.close_session()
            except:
                pass