// Application configuration
const config = {
  // API configuration
  api: {
    baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:8080',
    timeout: 30000, // 30 seconds
  },
  
  // Firebase configuration
  firebase: {
    apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
    authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
    storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.REACT_APP_FIREBASE_APP_ID
  },
  
  // LLM configuration
  llm: {
    modelName: process.env.REACT_APP_LLM_MODEL_NAME || 'gemini-1.5-pro',
    apiKey: process.env.REACT_APP_GOOGLE_API_KEY
  },
  
  // WebSocket configuration
  websocket: {
    reconnectAttempts: 5,
    reconnectInterval: 3000, // 3 seconds
    pingInterval: 30000 // 30 seconds
  },
  
  // Feature flags
  features: {
    enableLocalStorage: false, // Disabled as per requirements
    enableTaskAutomation: true,
    enableResearch: true,
    enableDebugMode: process.env.NODE_ENV === 'development'
  }
};

export default config;