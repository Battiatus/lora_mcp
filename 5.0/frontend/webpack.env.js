const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env files
function loadEnv() {
  const NODE_ENV = process.env.NODE_ENV || 'development';
  
  // Order of priority: .env.local, .env.development/.env.production, .env
  const envFiles = [
    `.env.${NODE_ENV}.local`,
    `.env.local`,
    `.env.${NODE_ENV}`,
    '.env'
  ];
  
  const envVars = {};
  
  // Load environment variables from each file if it exists
  envFiles.forEach(file => {
    const envPath = path.resolve(process.cwd(), file);
    
    if (fs.existsSync(envPath)) {
      const parsed = dotenv.parse(fs.readFileSync(envPath));
      
      // Add to environment variables
      Object.keys(parsed).forEach(key => {
        if (key.startsWith('REACT_APP_')) {
          envVars[key] = parsed[key];
        }
      });
      
      console.log(`Loaded environment variables from ${file}`);
    }
  });
  
  // Also include NODE_ENV
  envVars.NODE_ENV = NODE_ENV;
  
  return envVars;
}

module.exports = loadEnv();