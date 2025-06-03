const swaggerJsdoc = require('swagger-jsdoc');
const packageJson = require('../package.json');

// Définition des options Swagger
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MCP Server API',
      version: packageJson.version,
      description: 'API RESTful pour MCP Server avec authentification Firebase',
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      contact: {
        name: 'Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:8080',
        description: 'Serveur de développement',
      },
      {
        url: process.env.PRODUCTION_API_URL || 'https://api.mcp-server.example.com',
        description: 'Serveur de production',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Token d\'authentification Firebase'
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Accès non autorisé - Token invalide ou expiré',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'error' },
                  message: { type: 'string', example: 'Non autorisé' },
                  error: { type: 'string', example: 'Token invalide ou expiré' }
                }
              }
            }
          }
        },
        BadRequestError: {
          description: 'Requête invalide',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'error' },
                  message: { type: 'string', example: 'Requête invalide' },
                  errors: { 
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        message: { type: 'string' }
                      }
                    },
                    example: [
                      { field: 'email', message: 'Email invalide' }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      { BearerAuth: [] }
    ]
  },
  // Chemins vers les fichiers contenant les annotations JSDoc
  apis: [
    './routes/*.js',
    './controllers/*.js',
    './models/*.js'
  ],
};

// Générer les spécifications Swagger
const specs = swaggerJsdoc(options);

module.exports = specs;