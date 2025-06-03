const winston = require('winston');
const { format, transports } = winston;

// Format personnalisé pour les journaux
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Format console pour le développement
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...metadata }) => {
    let metaStr = '';
    
    if (Object.keys(metadata).length > 0 && metadata.stack !== undefined) {
      metaStr = `\n${metadata.stack}`;
    } else if (Object.keys(metadata).length > 0) {
      metaStr = `\n${JSON.stringify(metadata, null, 2)}`;
    }
    
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Créer un logger Winston
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'mcp-server-api' },
  transports: [
    // Écrire les logs d'erreur dans error.log
    new transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Écrire tous les logs dans combined.log
    new transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// En développement, ajouter la sortie console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: consoleFormat
  }));
}

// Créer un stream pour Morgan
const stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

module.exports = {
  logger,
  stream
};