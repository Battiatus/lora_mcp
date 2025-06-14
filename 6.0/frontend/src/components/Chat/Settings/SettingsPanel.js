import React, { useState, useEffect } from 'react';
import './Settings.css';

function SettingsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState({
    enableAutoSave: true,
    markdownRendering: true,
    enableNotifications: true,
    messageSound: true,
    fontSize: 'medium',
    autoExpandToolOutput: false,
    enableHistory: true,
    maxHistorySessions: 20
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('app_settings');
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        setSettings(prevSettings => ({ ...prevSettings, ...parsedSettings }));
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
    // Apply relevant settings to the app
    applySettings();
  }, [settings]);

  const toggleSettings = () => {
    setIsOpen(!isOpen);
  };

  const handleToggleChange = (setting) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      [setting]: !prevSettings[setting]
    }));
  };

  const handleSelectChange = (setting, value) => {
    setSettings(prevSettings => ({
      ...prevSettings,
      [setting]: value
    }));
  };

  const applySettings = () => {
    // Apply font size
    document.documentElement.setAttribute('data-font-size', settings.fontSize);
    
    // Apply other settings as needed
    document.documentElement.setAttribute('data-markdown', settings.markdownRendering ? 'true' : 'false');
    
    // Dispatch a custom event for other components to listen to
    window.dispatchEvent(new CustomEvent('settings-changed', { detail: settings }));
  };

  const resetSettings = () => {
    const defaultSettings = {
      enableAutoSave: true,
      markdownRendering: true,
      enableNotifications: true,
      messageSound: true,
      fontSize: 'medium',
      autoExpandToolOutput: false,
      enableHistory: true,
      maxHistorySessions: 20
    };
    
    setSettings(defaultSettings);
  };

  return (
    <>
      <div className="settings-toggle" onClick={toggleSettings}>
        <i className="fas fa-cog"></i>
        <span className="settings-tooltip">Settings</span>
      </div>
      
      <div className={`settings-panel ${isOpen ? 'open' : ''}`}>
        <div className="settings-header">
          <h3>
            <i className="fas fa-cog"></i>
            Settings
          </h3>
          <button className="settings-close" onClick={toggleSettings}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        
        <div className="settings-content">
          <div className="settings-section">
            <h4>Display</h4>
            
            <div className="settings-item">
              <label htmlFor="fontSize">Font Size</label>
              <select
                id="fontSize"
                value={settings.fontSize}
                onChange={(e) => handleSelectChange('fontSize', e.target.value)}
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            
            <div className="settings-item">
              <label htmlFor="markdownRendering">Markdown Rendering</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="markdownRendering"
                  checked={settings.markdownRendering}
                  onChange={() => handleToggleChange('markdownRendering')}
                />
                <label htmlFor="markdownRendering"></label>
              </div>
            </div>
          </div>
          
          <div className="settings-section">
            <h4>Behavior</h4>
            
            <div className="settings-item">
              <label htmlFor="enableAutoSave">Auto-save Sessions</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="enableAutoSave"
                  checked={settings.enableAutoSave}
                  onChange={() => handleToggleChange('enableAutoSave')}
                />
                <label htmlFor="enableAutoSave"></label>
              </div>
            </div>
            
            <div className="settings-item">
              <label htmlFor="autoExpandToolOutput">Auto-expand Tool Output</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="autoExpandToolOutput"
                  checked={settings.autoExpandToolOutput}
                  onChange={() => handleToggleChange('autoExpandToolOutput')}
                />
                <label htmlFor="autoExpandToolOutput"></label>
              </div>
            </div>
          </div>
          
          <div className="settings-section">
            <h4>Notifications</h4>
            
            <div className="settings-item">
              <label htmlFor="enableNotifications">Enable Notifications</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="enableNotifications"
                  checked={settings.enableNotifications}
                  onChange={() => handleToggleChange('enableNotifications')}
                />
                <label htmlFor="enableNotifications"></label>
              </div>
            </div>
            
            <div className="settings-item">
              <label htmlFor="messageSound">Message Sound</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="messageSound"
                  checked={settings.messageSound}
                  onChange={() => handleToggleChange('messageSound')}
                />
                <label htmlFor="messageSound"></label>
              </div>
            </div>
          </div>
          
          <div className="settings-section">
            <h4>History</h4>
            
            <div className="settings-item">
              <label htmlFor="enableHistory">Enable Message History</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id="enableHistory"
                  checked={settings.enableHistory}
                  onChange={() => handleToggleChange('enableHistory')}
                />
                <label htmlFor="enableHistory"></label>
              </div>
            </div>
            
            <div className="settings-item">
              <label htmlFor="maxHistorySessions">Max Saved Sessions</label>
              <select
                id="maxHistorySessions"
                value={settings.maxHistorySessions}
                onChange={(e) => handleSelectChange('maxHistorySessions', parseInt(e.target.value))}
              >
                <option value="10">10 sessions</option>
                <option value="20">20 sessions</option>
                <option value="50">50 sessions</option>
                <option value="100">100 sessions</option>
              </select>
            </div>
          </div>
          
          <div className="settings-actions">
            <button className="settings-reset-btn" onClick={resetSettings}>
              Reset to Default
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default SettingsPanel;