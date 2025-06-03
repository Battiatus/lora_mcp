const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { logger } = require('../utils/logger');

// Stockage global des contextes de navigateur
const contexts = {};

// Créer les répertoires nécessaires
['screenshots', 'artifacts'].forEach(dir => {
  const dirPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

/**
 * Obtient ou crée un contexte de navigateur pour une session donnée
 * @param {string} sessionId - ID de session unique
 * @param {string} userId - ID de l'utilisateur Firebase
 * @returns {Object} Contexte du navigateur
 */
const getOrCreateContext = async (sessionId, userId) => {
  try {
    if (!contexts[sessionId]) {
      logger.info(`Création d'un nouveau contexte pour la session: ${sessionId} (Utilisateur: ${userId})`);

      // Initialiser Playwright avec des options sécurisées
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080'
        ]
      });

      // Créer un contexte de navigateur avec un agent utilisateur réaliste
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        bypassCSP: true,
        // Désactiver la persistance des cookies et du stockage en mode incognito
        storageState: {}
      });

      // Créer une page
      const page = await context.newPage();

      // Stocker le contexte
      contexts[sessionId] = {
        browser,
        context,
        page,
        sessionId,
        userId,
        createdAt: new Date(),
        lastAccessed: new Date()
      };

      logger.info(`Contexte créé avec succès pour la session: ${sessionId}`);
    } else {
      // Mettre à jour le timestamp de dernier accès
      contexts[sessionId].lastAccessed = new Date();
    }

    return contexts[sessionId];
  } catch (error) {
    logger.error(`Erreur lors de la création du contexte: ${error.message}`);
    throw error;
  }
};

/**
 * Nettoie un contexte de navigateur pour une session donnée
 * @param {string} sessionId - ID de session à nettoyer
 */
const cleanupContext = async (sessionId) => {
  if (contexts[sessionId]) {
    try {
      const { page, context, browser } = contexts[sessionId];
      
      if (page) await page.close().catch(e => logger.warn(`Erreur fermeture page: ${e.message}`));
      if (context) await context.close().catch(e => logger.warn(`Erreur fermeture contexte: ${e.message}`));
      if (browser) await browser.close().catch(e => logger.warn(`Erreur fermeture navigateur: ${e.message}`));
      
      delete contexts[sessionId];
      logger.info(`Contexte ${sessionId} nettoyé avec succès`);
    } catch (error) {
      logger.error(`Erreur lors du nettoyage du contexte ${sessionId}: ${error.message}`);
      throw error;
    }
  }
};

/**
 * Nettoie les contextes inactifs depuis plus d'un certain temps
 * @param {number} maxIdleTime - Temps d'inactivité maximal en millisecondes
 */
const cleanupIdleContexts = async (maxIdleTime = 30 * 60 * 1000) => { // 30 minutes par défaut
  const now = new Date();
  
  for (const sessionId in contexts) {
    const context = contexts[sessionId];
    const idleTime = now - context.lastAccessed;
    
    if (idleTime > maxIdleTime) {
      logger.info(`Nettoyage du contexte inactif ${sessionId} (inactif depuis ${Math.round(idleTime/1000/60)} minutes)`);
      await cleanupContext(sessionId);
    }
  }
};

/**
 * Nettoie tous les contextes de navigateur
 */
const cleanupAllContexts = async () => {
  const sessionIds = Object.keys(contexts);
  
  for (const sessionId of sessionIds) {
    await cleanupContext(sessionId);
  }
  
  logger.info(`Tous les contextes ont été nettoyés (${sessionIds.length} au total)`);
};

// Définir un intervalle pour nettoyer régulièrement les contextes inactifs
setInterval(() => {
  cleanupIdleContexts().catch(err => {
    logger.error(`Erreur lors du nettoyage des contextes inactifs: ${err.message}`);
  });
}, 15 * 60 * 1000); // Vérifier toutes les 15 minutes

// Exporter les fonctions du service
module.exports = {
  getOrCreateContext,
  cleanupContext,
  cleanupIdleContexts,
  cleanupAllContexts
};