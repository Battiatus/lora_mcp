import React, { useState } from 'react';
import { useTools } from '../../hooks/useTools';
import ToolCard from '../../components/tools/ToolCard';
import ToolExecutor from '../../components/tools/ToolExecutor';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import Button from '../../components/common/Button';

const ToolsList = () => {
  const { tools, loading, error, refreshTools } = useTools();
  const [selectedTool, setSelectedTool] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Ouvrir la modal d'exécution d'outil
  const handleExecuteTool = (tool) => {
    setSelectedTool(tool);
    setIsModalOpen(true);
  };
  
  // Fermer la modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outils</h1>
          <p className="text-gray-600">Découvrez et utilisez les outils disponibles</p>
        </div>
        <Button
          variant="outline"
          onClick={refreshTools}
          disabled={loading}
        >
          {loading ? <Loader size="sm" className="mr-2" /> : (
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Actualiser
        </Button>
      </div>
      
      {error && (
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
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader size="lg" />
        </div>
      ) : tools.length === 0 ? (
        <div className="text-center py-12">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun outil disponible</h3>
          <p className="mt-1 text-sm text-gray-500">Veuillez réessayer ultérieurement ou contacter l'administrateur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <ToolCard
              key={tool.name}
              tool={tool}
              onExecute={handleExecuteTool}
            />
          ))}
        </div>
      )}
      
      {/* Modal d'exécution d'outil */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedTool ? `Outil: ${selectedTool.name}` : 'Exécuter un outil'}
        size="lg"
      >
        {selectedTool && (
          <ToolExecutor
            tool={selectedTool}
            onSuccess={() => {
               // TODO: La modal sera fermée automatiquement après l'exécution réussie. Vous pouvez ajouter d'autres actions ici si nécessaire
            }}
          />
        )}
      </Modal>
    </div>
  );
};

export default ToolsList;