# Dockerfile pour le backend MCP Server API
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=8080

# Créer et définir le répertoire de travail
WORKDIR /app

# Copier les fichiers package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production

# Copier le reste des fichiers
COPY . .

# Créer les répertoires nécessaires avec les bons droits
RUN mkdir -p logs screenshots artifacts \
    && chmod -R 755 logs screenshots artifacts

# Exposer le port
EXPOSE 8080

# Commande pour démarrer l'application
CMD ["node", "server.js"]