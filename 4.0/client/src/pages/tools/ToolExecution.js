import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import ToolExecutor from '../../components/tools/ToolExecutor';
import ScreenshotViewer from '../../components/tools/ScreenshotViewer';
import { useTools } from '../../hooks/useTools';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useNotification } from '../../contexts/NotificationContext';

/**
 * Page dédiée à l'exécution d'un outil spécifique
 */
const ToolExecution = () => {
  const { toolName } = useParams();
  const navigate = useNavigate();
  const { tools, loading: toolsLoading, error: toolsError } = useTools();
  const { sessionId, results, createSession, endSession } = useSessionManager();
  const { success, error: showError } = useNotification();
  const [selectedTool, setSelectedTool] = useState(null);
  const [executionResults, setExecutionResults] = useState([]);
  const [activeTab, setActiveTab] = useState('tool');

  // Trouver l'outil correspondant au nom dans l'URL
  useEffect(() => {
    if (tools.length > 0 && toolName) {
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        setSelectedTool(tool);
      } else {
        showError(`L'outil "${toolName}" n'a pas été trouvé`);
        navigate('/tools');
      }
    }
  }, [tools, toolName, navigate, showError]);

  // Mettre à jour les résultats d'exécution
  useEffect(() => {
    setExecutionResults(results);
  }, [results]);

  // Gérer la création d'une nouvelle session
  const handleNewSession = () => {
    if (sessionId) {
      // Demander confirmation
      if (window.confirm('Êtes-vous sûr de vouloir terminer la session actuelle et en créer une nouvelle ?')) {
        endSession().then(() => {
          const newSessionId = createSession();
          success(`Nouvelle session créée avec l'ID: ${newSessionId}`);
          setExecutionResults([]);
        });
      }
    } else {
      const newSessionId = createSession();
      success(`Nouvelle session créée avec l'ID: ${newSessionId}`);
    }
  };

  // Gérer la fin de session
  const handleEndSession = () => {
    if (sessionId && window.confirm('Êtes-vous sûr de vouloir terminer cette session ?')) {
      endSession().then(() => {
        success('Session terminée avec succès');
        setExecutionResults([]);
      });
    }
  };

  // Gérer le succès de l'exécution d'un outil
  const handleToolSuccess = (result) => {
    success(`L'outil ${selectedTool.name} a été exécuté avec succès`);
    setActiveTab('results');
  };

  if (toolsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader size="lg" />
      </div>
    );
  }

  if (toolsError) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-md mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Erreur lors du chargement des outils</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{toolsError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedTool) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">Outil non trouvé</h3>
        <p className="mt-1 text-sm text-gray-500">L'outil que vous recherchez n'existe pas ou n'est pas disponible.</p>
        <div className="mt-6">
          <Link to="/tools">
            <Button>
              Retour à la liste des outils
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exécution d'Outil</h1>
          <p className="text-gray-600">{selectedTool.name} - {selectedTool.description}</p>
        </div>
        <div className="flex space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Nouvelle Session
          </Button>
          {sessionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleEndSession}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Terminer Session
            </Button>
          )}
        </div>
      </div>

      {/* Indicateur de session */}
      {sessionId && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md mb-6 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Session active: <span className="font-mono font-medium">{sessionId}</span></span>
        </div>
      )}

      {/* Onglets */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('tool')}
            className={`${
              activeTab === 'tool'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
          >
            Outil
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`${
              activeTab === 'results'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm`}
          >
            Résultats d'Exécution
            {executionResults.length > 0 && (
              <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {executionResults.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Contenu de l'onglet */}
      {activeTab === 'tool' ? (
        <div>
          <ToolExecutor
            tool={selectedTool}
            onSuccess={handleToolSuccess}
          />
        </div>
      ) : (
        <div>
          {executionResults.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun résultat</h3>
                <p className="mt-1 text-sm text-gray-500">Il n'y a pas encore de résultats d'exécution pour cette session.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-6">
              {executionResults.map((result, index) => {
                // Déterminer le type de résultat
                const isScreenshot = result.result && 
                  typeof result.result === 'object' && 
                  result.result.base64 && 
                  (result.result.filename?.endsWith('.png') || 
                   result.result.filename?.endsWith('.jpg') || 
                   result.result.filename?.endsWith('.jpeg'));

                if (isScreenshot) {
                  return (
                    <ScreenshotViewer
                      key={result.id}
                      screenshot={result.result}
                      title={`Capture d'écran ${index + 1}`}
                      timestamp={result.timestamp}
                    />
                  );
                }

                // Résultat standard
                return (
                  <Card 
                    key={result.id}
                    title={`Résultat: ${result.toolName}`}
                  >
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-gray-500">
                          Exécuté le {new Date(result.timestamp).toLocaleString()}
                        </p>
                      </div>
                      
                      <div className="border-t border-gray-200 pt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Arguments:</h4>
                        {Object.keys(result.args).length > 0 ? (
                          <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
                            {JSON.stringify(result.args, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-gray-500 text-sm italic">Aucun argument</p>
                        )}
                      </div>
                      
                      <div className="border-t border-gray-200 pt-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Résultat:</h4>
                        {typeof result.result === 'object' ? (
                          <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto">
                            {JSON.stringify(result.result, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-gray-800">{String(result.result)}</p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolExecution;