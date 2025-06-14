import React, { useEffect } from 'react';
import './Modal.css';

function ImageModal({ image, onClose }) {
  // Prevent body scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    
    // Add ESC key listener to close modal
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      onClose();
    }
  };

  // Function to handle image download
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = image.src;
    link.download = `screenshot-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="modal-overlay show" onClick={handleOverlayClick}>
      <div className="modal" id="imageModal">
        <div className="modal-header">
          <h3>
            <i className="fas fa-image"></i>
            Screenshot
          </h3>
          <div className="modal-actions">
            <button className="modal-action-btn" onClick={handleDownload} title="Download">
              <i className="fas fa-download"></i>
            </button>
            <button className="modal-close" onClick={onClose} title="Close">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div className="modal-content">
          <div className="image-container">
            <img 
              id="modalImage" 
              src={image.src} 
              alt={image.alt || 'Screenshot'} 
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageModal;