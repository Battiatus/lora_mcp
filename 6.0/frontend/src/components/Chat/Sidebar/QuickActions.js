import React from 'react';

const QUICK_ACTIONS = {
  screenshot: "Take a screenshot of the current page",
  navigate: "Navigate to https://example.com",
  research: "Research the latest trends in artificial intelligence",
  analyze: "Analyze the current page content and provide insights"
};

function QuickActions({ setMessage }) {
  const handleAction = (action) => {
    if (QUICK_ACTIONS[action]) {
      setMessage(QUICK_ACTIONS[action]);
      
      // Focus the input
      setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) {
          input.focus();
        }
      }, 0);
    }
  };

  return (
    <div className="quick-actions">
      <h3>Quick Actions</h3>
      <div className="action-grid">
        <button className="action-btn" onClick={() => handleAction('screenshot')}>
          <i className="fas fa-camera"></i>
          <span>Screenshot</span>
        </button>
        <button className="action-btn" onClick={() => handleAction('navigate')}>
          <i className="fas fa-globe"></i>
          <span>Navigate</span>
        </button>
        <button className="action-btn" onClick={() => handleAction('research')}>
          <i className="fas fa-search"></i>
          <span>Research</span>
        </button>
        <button className="action-btn" onClick={() => handleAction('analyze')}>
          <i className="fas fa-chart-line"></i>
          <span>Analyze</span>
        </button>
      </div>
    </div>
  );
}

export default QuickActions;