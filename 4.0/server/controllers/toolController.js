const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const browserService = require('../services/browserService');
const { logger } = require('../utils/logger');

/**
 * Liste tous les outils disponibles
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const listTools = async (req, res) => {
  try {
    /**
     * @swagger
     * components:
     *   schemas:
     *     Tool:
     *       type: object
     *       required:
     *         - name
     *         - description
     *       properties:
     *         name:
     *           type: string
     *           description: Nom de l'outil
     *         description:
     *           type: string
     *           description: Description de l'outil
     *         input_schema:
     *           type: object
     *           description: Schéma des arguments de l'outil
     */

    const tools = [
      {
        name: 'navigate',
        description: 'Navigue vers une URL spécifiée',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL de destination' }
          },
          required: ['url']
        }
      },
      {
        name: 'screenshot',
        description: 'Prend une capture d\'écran de la page actuelle',
        input_schema: { type: 'object', properties: {} }
      },
      {
        name: 'click',
        description: 'Clique à des coordonnées spécifiques sur la page',
        input_schema: {
          type: 'object',
          properties: {
            x: { type: 'integer', description: 'Coordonnée X' },
            y: { type: 'integer', description: 'Coordonnée Y' }
          },
          required: ['x', 'y']
        }
      },
      {
        name: 'scroll',
        description: 'Fait défiler la page vers le haut ou le bas',
        input_schema: {
          type: 'object',
          properties: {
            direction: { type: 'string', enum: ['up', 'down'] },
            amount: { type: 'integer', description: 'Quantité de défilement en pixels' }
          },
          required: ['direction', 'amount']
        }
      },
      {
        name: 'type',
        description: 'Saisit du texte',
        input_schema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Texte à saisir' },
            submit: { type: 'boolean', description: 'Appuyer sur Entrée après la saisie', default: false }
          },
          required: ['text']
        }
      },
      {
        name: 'get_page_info',
        description: 'Obtient des informations sur la page actuelle',
        input_schema: { type: 'object', properties: {} }
      },
      {
        name: 'write_file',
        description: 'Écrit du contenu dans un fichier',
        input_schema: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Nom du fichier' },
            content: { type: 'string', description: 'Contenu à écrire' }
          },
          required: ['filename', 'content']
        }
      }
    ];

    res.json({ 
      status: 'success', 
      data: { tools } 
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des outils: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des outils',
      error: error.message
    });
  }
};

/**
 * Exécute un outil spécifique
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const executeTool = async (req, res) => {
  try {
    const { tool_name, arguments: args } = req.body;
    const sessionId = req.body.session_id || uuidv4();
    const userId = req.user.uid;

    logger.info(`Exécution de l'outil '${tool_name}' pour la session ${sessionId} (Utilisateur: ${userId})`);

    // Obtenir ou créer le contexte du navigateur
    const context = await browserService.getOrCreateContext(sessionId, userId);

    // Exécuter l'outil approprié
    let result;
    switch (tool_name) {
      case 'navigate':
        result = await navigateTool(args.url, context);
        break;
      case 'screenshot':
        result = await screenshotTool(context, userId);
        break;
      case 'click':
        result = await clickTool(args.x, args.y, context);
        break;
      case 'scroll':
        result = await scrollTool(args.direction, args.amount, context);
        break;
      case 'type':
        result = await typeTool(args.text, context, args.submit);
        break;
      case 'get_page_info':
        result = await getPageInfoTool(context);
        break;
      case 'write_file':
        result = await writeFileTool(args.filename, args.content, context, userId);
        break;
      default:
        return res.status(400).json({ 
          status: 'error', 
          message: `Outil inconnu: ${tool_name}` 
        });
    }

    logger.info(`Outil '${tool_name}' exécuté avec succès pour la session ${sessionId}`);
    return res.json({ 
      status: 'success', 
      data: { result, session_id: sessionId } 
    });
  } catch (error) {
    logger.error(`Erreur lors de l'exécution de l'outil: ${error.message}`);
    return res.status(500).json({ 
      status: 'error', 
      message: `Erreur lors de l'exécution de l'outil: ${error.message}` 
    });
  }
};

/**
 * Nettoie une session spécifique
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 */
const cleanupSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    await browserService.cleanupContext(sessionId);
    
    res.json({ 
      status: 'success', 
      message: `Session ${sessionId} nettoyée avec succès` 
    });
  } catch (error) {
    logger.error(`Erreur lors du nettoyage de la session: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du nettoyage de la session',
      error: error.message
    });
  }
};

// ======== Implémentations des outils ========

/**
 * Navigue vers une URL spécifiée
 * @param {string} url - URL de destination
 * @param {Object} ctx - Contexte du navigateur
 */
async function navigateTool(url, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Navigation vers: ${url}`);

    const response = await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    const title = await page.title();
    const currentUrl = page.url();

    return {
      title,
      url: currentUrl,
      status_code: response ? response.status() : null
    };
  } catch (error) {
    logger.error(`Erreur lors de la navigation vers ${url}: ${error.message}`);
    throw new Error(`Échec de la navigation vers ${url}: ${error.message}`);
  }
}

/**
 * Prend une capture d'écran de la page actuelle
 * @param {Object} ctx - Contexte du navigateur
 * @param {string} userId - ID de l'utilisateur
 */
async function screenshotTool(ctx, userId) {
  try {
    const page = ctx.page;
    const sessionId = ctx.sessionId;

    // Créer le répertoire des captures d'écran
    const screenshotDir = path.join('screenshots', userId, sessionId);
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const filename = path.join(screenshotDir, `screenshot_${uuidv4()}.png`);
    await page.screenshot({ path: filename, fullPage: true });

    logger.info(`Capture d'écran enregistrée: ${filename}`);
    
    // Lire l'image pour la retourner en base64
    const imageBuffer = fs.readFileSync(filename);
    const base64Image = imageBuffer.toString('base64');
    
    return { 
      filename, 
      path: filename,
      base64: base64Image
    };
  } catch (error) {
    logger.error(`Erreur lors de la prise de capture d'écran: ${error.message}`);
    throw new Error(`Échec de la prise de capture d'écran: ${error.message}`);
  }
}

/**
 * Clique à des coordonnées spécifiques sur la page
 * @param {number} x - Coordonnée X
 * @param {number} y - Coordonnée Y
 * @param {Object} ctx - Contexte du navigateur
 */
async function clickTool(x, y, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Clic aux coordonnées: (${x}, ${y})`);

    await page.mouse.click(x, y);
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { clicked_at: { x, y } };
  } catch (error) {
    logger.error(`Erreur lors du clic aux coordonnées (${x}, ${y}): ${error.message}`);
    throw new Error(`Échec du clic aux coordonnées (${x}, ${y}): ${error.message}`);
  }
}

/**
 * Fait défiler la page vers le haut ou le bas
 * @param {string} direction - Direction de défilement ('up' ou 'down')
 * @param {number} amount - Quantité de défilement en pixels
 * @param {Object} ctx - Contexte du navigateur
 */
async function scrollTool(direction, amount, ctx) {
  try {
    const page = ctx.page;
    logger.info(`Défilement ${direction} de ${amount} pixels`);

    if (direction.toLowerCase() === 'down') {
      await page.evaluate(`window.scrollBy(0, ${amount})`);
    } else if (direction.toLowerCase() === 'up') {
      await page.evaluate(`window.scrollBy(0, -${amount})`);
    } else {
      throw new Error(`Direction invalide: ${direction}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    return { scrolled: true, direction, amount };
  } catch (error) {
    logger.error(`Erreur lors du défilement ${direction}: ${error.message}`);
    throw new Error(`Échec du défilement ${direction}: ${error.message}`);
  }
}

/**
 * Saisit du texte
 * @param {string} text - Texte à saisir
 * @param {Object} ctx - Contexte du navigateur
 * @param {boolean} submit - Appuyer sur Entrée après la saisie
 */
async function typeTool(text, ctx, submit = false) {
  try {
    const page = ctx.page;
    logger.info(`Saisie du texte: '${text}'`);

    await page.keyboard.type(text);

    if (submit) {
      logger.info('Appui sur Entrée pour soumettre');
      await page.keyboard.press('Enter');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return { typed: true, text, submitted: submit };
  } catch (error) {
    logger.error(`Erreur lors de la saisie du texte: ${error.message}`);
    throw new Error(`Échec de la saisie du texte: ${error.message}`);
  }
}

/**
 * Obtient des informations sur la page actuelle
 * @param {Object} ctx - Contexte du navigateur
 */
async function getPageInfoTool(ctx) {
  try {
    const page = ctx.page;
    const title = await page.title();
    return `Titre='${title}', URL='${page.url()}'`;
  } catch (error) {
    logger.error(`Erreur lors de la récupération des informations de page: ${error.message}`);
    throw new Error(`Échec de la récupération des informations de page: ${error.message}`);
  }
}

/**
 * Écrit du contenu dans un fichier
 * @param {string} filename - Nom du fichier
 * @param {string} content - Contenu à écrire
 * @param {Object} ctx - Contexte du navigateur
 * @param {string} userId - ID de l'utilisateur
 */
async function writeFileTool(filename, content, ctx, userId) {
  try {
    const sessionId = ctx.sessionId;
    const artifactsDir = path.join('artifacts', userId, sessionId);
    
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    // Sécurisation du nom de fichier
    const sanitizedFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(artifactsDir, sanitizedFilename);
    
    logger.info(`Écriture dans le fichier: ${fullPath}`);

    fs.writeFileSync(fullPath, content, 'utf-8');

    return { 
      filename: sanitizedFilename, 
      path: fullPath, 
      written: true 
    };
  } catch (error) {
    logger.error(`Erreur lors de l'écriture du fichier: ${error.message}`);
    throw new Error(`Échec de l'écriture du fichier: ${error.message}`);
  }
}

module.exports = {
  listTools,
  executeTool,
  cleanupSession
};