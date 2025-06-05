import React from 'react';

function ToolMessage({ message }) {
  const { toolName, args, status, message: toolMessage, result } = message;
  
  const statusText = {
    preparing: 'Preparing',
    executing: 'Executing',
    success: 'Completed',
    error: 'Failed'
  }[status] || status;
  
  const argsText = args && Object.keys(args).length > 0
    ? Object.entries(args)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ')
    : 'No parameters';

  return (
    <div className="tool-message" data-tool-name={toolName}>
      <div className="tool-header">
        <div className="tool-icon">
          <i className="fas fa-cog"></i>
        </div>
        <div className="tool-name">{toolName}</div>
        <div className={`tool-status ${status}`}>{statusText}</div>
      </div>
      <div className="tool-result">
        <strong>Parameters:</strong> {argsText}
        {(toolMessage || result) && (
          <div className="tool-output">
            {toolMessage && <div><br /><strong>Status:</strong> {toolMessage}</div>}
            {result && <div><br /><strong>Result:</strong> {result}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default ToolMessage;