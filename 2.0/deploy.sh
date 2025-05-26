#!/bin/bash

set -e

PROJECT_ID=${1:-"your-project-id"}
REGION="europe-west1"

echo "🚀 Deploying MCP Server and Client to Google Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"

# Enable required APIs
echo "📋 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID
gcloud services enable run.googleapis.com --project=$PROJECT_ID
gcloud services enable containerregistry.googleapis.com --project=$PROJECT_ID

# Deploy Server
echo "🖥️ Deploying MCP Server..."
gcloud builds submit --config=deploy/cloudbuild-server.yaml --project=$PROJECT_ID

# Get server URL
SERVER_URL=$(gcloud run services describe mcp-server --region=$REGION --project=$PROJECT_ID --format="value(status.url)")
echo "✅ Server deployed at: $SERVER_URL"

# Update client configuration with server URL
sed -i "s|MCP_SERVER_URL=.*|MCP_SERVER_URL=$SERVER_URL|" deploy/cloudbuild-client.yaml

# Deploy Client
echo "🌐 Deploying MCP Client..."
gcloud builds submit --config=deploy/cloudbuild-client.yaml --project=$PROJECT_ID

# Get client URL
CLIENT_URL=$(gcloud run services describe mcp-client --region=$REGION --project=$PROJECT_ID --format="value(status.url)")
echo "✅ Client deployed at: $CLIENT_URL"

echo ""
echo "🎉 Deployment completed!"
echo "📋 Summary:"
echo "   MCP Server: $SERVER_URL"
echo "   MCP Client: $CLIENT_URL"
echo ""
echo "🔗 Access your web interface at: $CLIENT_URL"