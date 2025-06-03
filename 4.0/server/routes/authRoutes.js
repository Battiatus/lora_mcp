const express = require('express');
const router = express.Router();
const { authenticate, checkRole } = require('../middleware/auth');
const authController = require('../controllers/authController');

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obtient le profil de l'utilisateur actuellement authentifié
 *     tags: [Authentification]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Profil utilisateur récupéré avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     uid:
 *                       type: string
 *                     email:
 *                       type: string
 *                     displayName:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/me', authenticate, authController.getCurrentUser);

/**
 * @swagger
 * /api/auth/users:
 *   post:
 *     summary: Crée un nouvel utilisateur
 *     tags: [Authentification]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - displayName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               displayName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *                 default: user
 *     responses:
 *       201:
 *         description: Utilisateur créé avec succès
 *       400:
 *         $ref: '#/components/responses/BadRequestError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Non autorisé à créer des utilisateurs avec des rôles privilégiés
 */
router.post('/users', authenticate, authController.createUser);

/**
 * @swagger
 * /api/auth/users/{uid}:
 *   put:
 *     summary: Met à jour un utilisateur
 *     tags: [Authentification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [user, admin]
 *     responses:
 *       200:
 *         description: Utilisateur mis à jour avec succès
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Non autorisé à modifier d'autres utilisateurs
 */
router.put('/users/:uid', authenticate, authController.updateUser);

/**
 * @swagger
 * /api/auth/users/{uid}:
 *   delete:
 *     summary: Supprime un utilisateur
 *     tags: [Authentification]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Utilisateur supprimé avec succès
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Non autorisé à supprimer d'autres utilisateurs
 */
router.delete('/users/:uid', authenticate, authController.deleteUser);

module.exports = router;