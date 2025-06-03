#!/usr/bin/env bash
set -e

################################################################################
# Script de déploiement “manuel” du mcp-server sur Cloud Run, sans passer par
# Cloud Build : tout se fait avec votre compte utilisateur gcloud.
#
# Usage :
#   1. Remplacez PROJECT_ID par l’ID de votre projet GCP.
#   2. Placez ce script à la racine de votre dépôt (au même niveau que le dossier
#      ./mcp_server).
#   3. Rendez-le exécutable puis lancez-le :
#        chmod +x deploy-mcp-server.sh
#        ./deploy-mcp-server.sh
#
# Ce qu’il fait en une seule passe :
#   • gcloud auth login (authentification de votre user)
#   • gcloud config set project/region
#   • docker build de l’image
#   • docker push vers Container Registry
#   • gcloud run deploy du service sur Cloud Run
################################################################################

# 1. Variables à personnaliser
PROJECT_ID="io-genai-mcp-adk"            # ← Remplacez par votre ID de projet GCP
REGION="europe-west1"                    # Région Cloud Run souhaitée
IMAGE_NAME="mcp-server"                  # Nom du service / de l’image
IMAGE_TAG="latest"                       # Tag de l’image
SOURCE_DIR="./mcp_server"                # Chemin vers le dossier contenant le Dockerfile
GCR_HOST="gcr.io"                        # Host du registry (modifier si Artifact Registry)
MEMORY="2Gi"                             # Mémoire allouée au conteneur
CPU="2"                                  # vCPU alloués au conteneur
TIMEOUT="900"                            # Timeout en secondes
ALLOW_UNAUTH="--allow-unauthenticated"   # Autoriser l’accès public (modifier si besoin)
ENV_VARS="GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION}"

################################################################################
# 2. Authentification gcloud (ouvre le navigateur pour login)
################################################################################
echo "1️⃣  Authentification GCP en cours…"
gcloud auth login

################################################################################
# 3. Configuration du projet et de la région
################################################################################
echo "2️⃣  Configuration du projet et de la région Cloud Run…"
gcloud config set project "${PROJECT_ID}"
gcloud config set run/region "${REGION}"
# Optionnel : vérifier que le core account est bien le vôtre
echo "   → Compte gcloud actif : $(gcloud config get-value account)"
echo "   → Projet gcloud actif : $(gcloud config get-value project)"
echo "   → Région Cloud Run : $(gcloud config get-value run/region)"

################################################################################
# 4. Construction de l’image Docker
################################################################################
echo "3️⃣  Construction de l’image Docker :"
echo "   • Chemin source : ${SOURCE_DIR}"
echo "   • Tag image   : ${GCR_HOST}/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"
docker build -t "${GCR_HOST}/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}" "${SOURCE_DIR}"

################################################################################
# 5. Authentification Docker auprès de Container Registry
################################################################################
echo "4️⃣  Authentification Docker auprès de ${GCR_HOST}…"
gcloud auth configure-docker

################################################################################
# 6. Push de l’image dans Container Registry
################################################################################
echo "5️⃣  Push de l’image vers ${GCR_HOST}/${PROJECT_ID}/…"
docker push "${GCR_HOST}/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"

################################################################################
# 7. Déploiement sur Cloud Run
################################################################################
echo "6️⃣  Déploiement du service sur Cloud Run…"
gcloud run deploy "${IMAGE_NAME}" \
    --image "${GCR_HOST}/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}" \
    --platform managed \
    --region "${REGION}" \
    ${ALLOW_UNAUTH} \
    --memory "${MEMORY}" \
    --cpu "${CPU}" \
    --timeout "${TIMEOUT}" \
    --set-env-vars "${ENV_VARS}"

################################################################################
# 8. Récapitulatif final
################################################################################
echo
echo "✅ Déploiement terminé !"
echo "   • Service Cloud Run : ${IMAGE_NAME}"
echo "   • URL accessible :"
gcloud run services describe "${IMAGE_NAME}" \
    --platform managed \
    --region "${REGION}" \
    --format="value(status.url)"
echo
echo "N’oubliez pas de vérifier dans la console Cloud Run que le service est bien actif."
