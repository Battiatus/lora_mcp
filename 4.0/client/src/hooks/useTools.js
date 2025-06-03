import { useState, useEffect, useCallback } from 'react';
import { getTools } from '../api/tools';

/**
 * Hook pour gérer les outils MCP
 * @returns {Object} Méthodes et état des outils
 */
export const useTools = () => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Charger la liste des outils
  const loadTools = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getTools();
      setTools(response.data.tools || []);
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement des outils');
    } finally {
      setLoading(false);
    }
  }, []);

  // Charger les outils au montage du composant
  useEffect(() => {
    loadTools();
  }, [loadTools]);

  return {
    tools,
    loading,
    error,
    refreshTools: loadTools
  };
};