import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// API error handler
const handleApiError = (error) => {
  if (error.response) {
    // Handle specific error codes
    if (error.response.status === 401 || error.response.status === 403) {
      // Unauthorized or Forbidden - clear local storage and redirect to login
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      window.location.href = '/';
    }
    
    // Return the error response data
    return Promise.reject(error.response.data);
  }
  
  if (error.request) {
    // The request was made but no response was received
    return Promise.reject({ error: 'No response from server. Please check your internet connection.' });
  }
  
  // Something happened in setting up the request
  return Promise.reject({ error: error.message });
};

// API service object
const apiService = {
  // Tool-related endpoints
  async getTools() {
    try {
      const response = await api.get('/tools');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  async executeTool(toolName, args, sessionId) {
    try {
      const response = await api.post('/tools/execute', {
        tool_name: toolName,
        arguments: args,
        session_id: sessionId
      });
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  // Resource-related endpoints
  async getResource(sessionId, filename) {
    try {
      const response = await api.get(`/resources/${sessionId}/${filename}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  async getScreenshot(sessionId, filename) {
    try {
      const response = await api.get(`/screenshots/${sessionId}/${filename}`, {
        responseType: 'blob'
      });
      return URL.createObjectURL(response.data);
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  // Session management
  async cleanupSession(sessionId) {
    try {
      const response = await api.delete(`/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  },
  
  // Health check
  async checkHealth() {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      return handleApiError(error);
    }
  }
};

export default apiService;