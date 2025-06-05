import React from 'react';

const EXAMPLE_COMMANDS = [
  {
    id: 'ai-trends',
    icon: 'fas fa-brain',
    label: 'AI Trends Research',
    command: 'Research the latest AI trends and create a comprehensive report'
  },
  {
    id: 'news-analysis',
    icon: 'fas fa-newspaper',
    label: 'News Analysis',
    command: 'Navigate to news websites and analyze current events'
  },
  {
    id: 'ui-docs',
    icon: 'fas fa-desktop',
    label: 'UI Documentation',
    command: 'Take screenshots and document the user interface'
  }
];

function ExampleCommands({ setMessage }) {
  const handleExample = (command) => {
    setMessage(command);
    
    // Focus the input
    setTimeout(() => {
      const input = document.getElementById('messageInput');
      if (input) {
        input.focus();
      }
    }, 0);
  };

  return (
    <div className="examples-section">
      <h3>Example Commands</h3>
      <div className="examples-list">
        {EXAMPLE_COMMANDS.map(example => (
          <div 
            key={example.id}
            className="example-item" 
            onClick={() => handleExample(example.command)}
          >
            <i className={example.icon}></i>
            <span>{example.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ExampleCommands;