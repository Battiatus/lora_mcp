import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import Modal from '../common/Modal';

/**
 * Composant pour afficher une capture d'écran
 */
const ScreenshotViewer = ({ screenshot, title, timestamp }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  if (!screenshot) {
    return null;
  }

  return (
    <>
      <Card 
        title={title || "Capture d'écran"} 
        className="overflow-hidden"
      >
        <div className="space-y-2">
          {timestamp && (
            <p className="text-xs text-gray-500">
              Prise le {new Date(timestamp).toLocaleString()}
            </p>
          )}
          
          <div className="overflow-hidden border border-gray-200 rounded-md">
            <img 
              src={`data:image/png;base64,${screenshot.base64}`} 
              alt="Capture d'écran" 
              className="max-w-full h-auto cursor-pointer"
              onClick={() => setIsModalOpen(true)}
            />
          </div>
          
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsModalOpen(true)}
            >
              Agrandir
            </Button>
          </div>
        </div>
      </Card>
      
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={title || "Capture d'écran"}
        size="xl"
      >
        <div className="flex justify-center">
          <img 
            src={`data:image/png;base64,${screenshot.base64}`} 
            alt="Capture d'écran" 
            className="max-w-full max-h-[calc(100vh-200px)]"
          />
        </div>
      </Modal>
    </>
  );
};

export default ScreenshotViewer;