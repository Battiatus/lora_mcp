# MCP Server & Client - Cloud Run Deployment

Ce projet déploie un serveur MCP (Model Context Protocol) et un client web sur Google Cloud Run, permettant l'automatisation web via une interface simple.

## Architecture

```
┌─────────────────┐    HTTP API    ┌─────────────────┐
│   MCP Client    │ ──────────────> │   MCP Server    │
│  (Cloud Run)    │                 │  (Cloud Run)    │
│                 │                 │                 │
│ - Interface Web │                 │ - Playwright    │
│ - Chat Bot      │                 │ - Automation    │
│ - API REST      │                 │ - Tools         │
└─────────────────┘                 └─────────────────┘
```

## Fonctionnalités

### MCP Server
- **Navigation web** : Accès à n'importe quel site web
- **Captures d'écran** : Screenshots automatiques
- **Interactions** : Clics, saisie de texte, défilement
- **Téléchargement vidéo** : Support TikTok et autres plateformes
- **Anti-détection** : Contournement des CAPTCHAs et mesures anti-bot
- **Traduction** : API Google Translate intégrée

### MCP Client
- **Interface web intuitive** : Chat en temps réel
- **Commandes naturelles** : Compréhension du langage naturel
- **Exemples intégrés** : Commandes pré-définies
- **Session management** : Gestion des sessions utilisateur

## Déploiement

### Prérequis
- Compte Google Cloud Platform
- gcloud CLI installé et configuré
- Permissions Cloud Build, Cloud Run, Container Registry

### Déploiement automatique
```bash
# Cloner le repository
git clone <your-repo>
cd mcp-cloud-deployment

# Rendre le script exécutable
chmod +x deploy.sh

# Déployer (remplacer par votre PROJECT_ID)
./deploy.sh your-project-id
```

### Déploiement manuel

#### 1. Déployer le serveur MCP
```bash
# Build et deploy du serveur
gcloud builds submit --config=deploy/cloudbuild-server.yaml --project=your-project-id

# Récupérer l'URL du serveur
gcloud run services describe mcp-server --region=europe-west1 --format="value(status.url)"
```

#### 2. Déployer le client MCP
```bash
# Mettre à jour l'URL du serveur dans cloudbuild-client.yaml
# Puis build et deploy du client
gcloud builds submit --config=deploy/cloudbuild-client.yaml --project=your-project-id
```

## Utilisation

### Interface Web
Accédez à l'URL du client Cloud Run pour utiliser l'interface web.

### Exemples de commandes
- `navigate to https://example.com` - Naviguer vers un site
- `take a screenshot` - Prendre une capture d'écran
- `click at 100 200` - Cliquer aux coordonnées (100, 200)
- `scroll down 300` - Faire défiler vers le bas de 300px
- `type "hello world"` - Saisir du texte

### API REST

#### Lister les outils disponibles
```bash
curl https://your-mcp-server-url/tools
```

#### Exécuter un outil
```bash
curl -X POST https://your-mcp-server-url/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "navigate",
    "arguments": {"url": "https://example.com"},
    "session_id": "optional-session-id"
  }'
```

## Configuration

### Variables d'environnement

#### MCP Server
- `GOOGLE_CLOUD_PROJECT` : ID du projet GCP
- `GOOGLE_CLOUD_LOCATION` : Région GCP (défaut: europe-west1)
- `GOOGLE_API_KEY` : Clé API Google (optionnel)
- `CAPTCHA_SERVICE_API_KEY` : Clé API service CAPTCHA (optionnel)

#### MCP Client
- `MCP_SERVER_URL` : URL du serveur MCP
- `PORT` : Port d'écoute (défaut: 8081)

## Sécurité

### Recommandations de production
1. **Authentification** : Ajouter l'authentification Cloud IAM
2. **CORS** : Configurer les origines autorisées
3. **Rate limiting** : Implémenter la limitation de débit
4. **Monitoring** : Activer Cloud Monitoring et Logging
5. **Secrets** : Utiliser Secret Manager pour les clés API

### Configuration IAM
```bash
# Restreindre l'accès au serveur MCP (exemple)
gcloud run services set-iam-policy mcp-server policy.yaml --region=europe-west1
```

## Monitoring

### Logs
```bash
# Logs du serveur
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=mcp-server" --limit=50

# Logs du client
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=mcp-client" --limit=50
```

### Métriques
- Consultez Cloud Monitoring pour les métriques de performance
- Configurez des alertes pour les erreurs et la latence

## Dépannage

### Problèmes courants

#### Le serveur ne démarre pas
- Vérifiez les logs Cloud Run
- Assurez-vous que les APIs sont activées
- Vérifiez les variables d'environnement

#### Erreurs de timeout
- Augmentez le timeout Cloud Run (max 60 minutes)
- Optimisez les opérations Playwright

#### Problèmes de mémoire
- Augmentez la mémoire allouée (jusqu'à 8Gi)
- Implémentez la gestion des sessions

### Support
Pour obtenir de l'aide :
1. Consultez les logs Cloud Run
2. Vérifiez la documentation Playwright
3. Testez les endpoints API individuellement

## Développement

### Structure du projet
```
├── mcp_server/          # Serveur MCP
│   ├── main.py         # API FastAPI
│   ├── server.py       # Logic métier (votre code existant)
│   ├── requirements.txt
│   └── Dockerfile
├── mcp_client/         # Client web
│   ├── main.py        # Interface web
│   ├── requirements.txt
│   └── Dockerfile
├── deploy/            # Configuration déploiement
│   ├── cloudbuild-server.yaml
│   └── cloudbuild-client.yaml
└── deploy.sh         # Script de déploiement
```

### Tests locaux
```bash
# Tester le serveur
cd mcp_server
python main.py

# Tester le client (dans un autre terminal)
cd mcp_client
MCP_SERVER_URL=http://localhost:8080 python main.py
```