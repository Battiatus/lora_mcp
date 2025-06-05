import React from 'react';

function ImageMessage({ image, onClick }) {
  return (
    <div className="message-image">
      <img 
        src={`data:image/${image.format};base64,${image.data}`}
        alt="Screenshot" 
        style={{ maxWidth: '300px', borderRadius: '8px', cursor: 'pointer' }}
        onClick={() => onClick && onClick()}
      />
    </div>
  );
}

export default ImageMessage;