import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Loader from '../common/Loader';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useNotification } from '../../contexts/NotificationContext';

/**
 * Composant pour exécuter un outil MCP
 */
const ToolExecutor = ({ tool, onSuccess }) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm();
  const { executeToolInSession, sessionId, loading, error } = useSessionManager();
  const { success, error: showError } = useNotification();
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);

  // Exécuter l'outil avec les arguments fournis
  const onSubmit = async (data) => {
    try {
      const response = await executeToolInSession(tool.name, data);
      
      setResult(response);
      setShowResult(true);
      success(`L'outil ${tool.name} a été exécuté avec succès`);
      
      if (onSuccess) {
        onSuccess(response);
      }
    } catch (err) {
      console.error(`Erreur lors de l'exécution de l'outil ${tool.name}:`, err);
      showError(err.message || `Erreur lors de l'exécution de l'outil ${tool.name}`);
    }
  };

  // Générer les champs de formulaire en fonction du schéma de l'outil
  const renderFormFields = () => {
    if (!tool.input_schema?.properties) {
      return (
        <div className="text-gray-600 italic">
          Cet outil ne nécessite pas d'arguments.
        </div>
      );
    }

    return Object.entries(tool.input_schema.properties).map(([key, value]) => {
      const isRequired = tool.input_schema.required?.includes(key);
      
      // Déterminer le type de champ en fonction du type de données
      let inputType = 'text';
      if (value.type === 'integer' || value.type === 'number') {
        inputType = 'number';
      } else if (key === 'password') {
        inputType = 'password';
      } else if (key === 'email') {
        inputType = 'email';
      } else if (key === 'url') {
        inputType = 'url';
      }
      
      // Gérer les champs enum (select)
      if (value.enum) {
        return (
          <div key={key} className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={key}>
              {key} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <select
              id={key}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors[key] ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
              {...register(key, { required: isRequired ? `Le champ ${key} est requis` : false })}
            >
              <option value="">Sélectionner...</option>
              {value.enum.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {errors[key] && (
              <p className="text-red-500 text-xs mt-1">{errors[key].message}</p>
            )}
            {value.description && (
              <p className="text-gray-600 text-xs mt-1">{value.description}</p>
            )}
          </div>
        );
      }
      
      // Gérer les champs boolean (checkbox)
      if (value.type === 'boolean') {
        return (
          <div key={key} className="mb-4">
            <div className="flex items-center">
              <input
                id={key}
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                {...register(key)}
              />
              <label className="ml-2 block text-gray-700 text-sm font-medium" htmlFor={key}>
                {key} {isRequired && <span className="text-red-500">*</span>}
              </label>
            </div>
            {value.description && (
              <p className="text-gray-600 text-xs mt-1">{value.description}</p>
            )}
          </div>
        );
      }
      
      // Champs texte (par défaut)
      return (
        <div key={key} className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor={key}>
            {key} {isRequired && <span className="text-red-500">*</span>}
          </label>
          <input
            id={key}
            type={inputType}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors[key] ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
            {...register(key, { required: isRequired ? `Le champ ${key} est requis` : false })}
          />
          {errors[key] && (
            <p className="text-red-500 text-xs mt-1">{errors[key].message}</p>
          )}
          {value.description && (
            <p className="text-gray-600 text-xs mt-1">{value.description}</p>
          )}
        </div>
      );
    });
  };

  // Afficher le résultat de l'exécution de l'outil
  const renderResult = () => {
    if (!result || !result.result) {
      return <p>Aucun résultat à afficher.</p>;
    }

    // Gérer les différents types de résultats
    if (typeof result.result === 'object') {
      // Cas spécial: capture d'écran
      if (result.result.base64 && (
        result.result.filename?.endsWith('.png') || 
        result.result.filename?.endsWith('.jpg') || 
        result.result.filename?.endsWith('.jpeg')
      )) {
        return (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Capture d'écran enregistrée: {result.result.filename}</p>
            <div className="border rounded-md overflow-hidden">
              <img 
                src={`data:image/png;base64,${result.result.base64}`} 
                alt="Capture d'écran" 
                className="max-w-full h-auto"
              />
            </div>
          </div>
        );
      }
      
      // Objet JSON standard
      return (
        <pre className="bg-gray-100 p-4 rounded-md overflow-auto text-sm">
          {JSON.stringify(result.result, null, 2)}
        </pre>
      );
    }
    
    // Texte simple
    return <p className="text-gray-800">{result.result}</p>;
  };

  // Fermer la modal de résultat
  const handleCloseResult = () => {
    setShowResult(false);
    setResult(null);
    reset(); // Réinitialiser le formulaire
  };

  return (
    <>
      <Card title={`Exécuter: ${tool.name}`}>
        <div className="mb-4">
          <p className="text-gray-600">{tool.description}</p>
          {sessionId && (
            <p className="text-xs text-gray-500 mt-2">Session ID: {sessionId}</p>
          )}
        </div>
        
        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit(onSubmit)}>
          {renderFormFields()}
          
          <div className="mt-6">
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
            >
              {loading ? <Loader size="sm" className="mr-2" /> : null}
              {loading ? 'Exécution en cours...' : 'Exécuter'}
            </Button>
          </div>
        </form>
      </Card>
      
      {/* Modal pour afficher le résultat */}
      <Modal
        isOpen={showResult}
        onClose={handleCloseResult}
        title={`Résultat: ${tool.name}`}
        footer={
          <Button variant="primary" onClick={handleCloseResult}>Fermer</Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center text-sm text-gray-600 mb-2">
            <svg className="w-5 h-5 mr-1 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
            Exécuté avec succès
          </div>
          
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Résultat:</h4>
            {renderResult()}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ToolExecutor;