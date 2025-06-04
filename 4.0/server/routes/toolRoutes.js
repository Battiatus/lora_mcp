const express = require('express');
const router = express.Router();
const { authenticate, checkRole } = require('../middleware/auth');
const toolController = require('../controllers/toolController');
const { rateLimit } = require('express-rate-limit');

// Limiteur de débit spécifique aux outils
const toolLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limite chaque IP à 30 requêtes par minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Trop de requêtes, veuillez réessayer après un moment'
  }
});

/**
 * @swagger
 * /api/tools:
 *   get:
 *     summary: Liste tous les outils disponibles
 *     tags: [Outils]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Liste des outils récupérée avec succès
 */
router.get('/', toolController.listTools);

/**
 * @swagger
 * /api/tools/execute:
 *   post:
 *     summary: Exécute un outil spécifique
 *     tags: [Outils]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tool_name
 *             properties:
 *               tool_name:
 *                 type: string
 *                 description: Nom de l'outil à exécuter
 *               arguments:
 *                 type: object
 *                 description: Arguments de l'outil
 *               session_id:
 *                 type: string
 *                 description: ID de session (optionnel, généré automatiquement si non fourni)
 *     responses:
 *       200:
 *         description: Outil exécuté avec succès
 *       400:
 *         description: Outil inconnu ou arguments invalides
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/execute',  toolLimiter, toolController.executeTool);

/**
 * @swagger
 * /api/tools/sessions/{sessionId}:
 *   delete:
 *     summary: Nettoie une session spécifique
 *     tags: [Outils]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session nettoyée avec succès
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.delete('/sessions/:sessionId',  toolController.cleanupSession);

module.exports = router;