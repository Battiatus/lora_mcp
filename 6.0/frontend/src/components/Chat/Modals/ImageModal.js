import React from 'react';
import './Modal.css';

function ImageModal({ image, onClose }) {
  const handleOverlayClick = (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay show" onClick={handleOverlayClick}>
      <div className="modal" id="imageModal">
        <div className="modal-header">
          <h3>Screenshot</h3>
          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-content">
          <img 
            id="modalImage" 
            src={image.src} 
            alt={image.alt || 'Screenshot'} 
          />
        </div>
      </div>
    </div>
  );
}

export default ImageModal;