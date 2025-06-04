import React, { useState, useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import Header from './components/Layout/Header';
// import Sidebar from './components/Layout/Sidebar';
import ChatWindow from './components/Chat/ChatWindow';
import Login from './components/Auth/Login';
import Modal from './components/UI/Modal';
import './assets/css/styles.css';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentMode, setCurrentMode] = useState('chat');
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: null });

  // Check if user is already logged in
  useEffect(() => {
    const checkAuthStatus = async () => {
      const user = localStorage.getItem('user');
      if (user) {
        setIsLoggedIn(true);
      } else {
        setShowLoginModal(true);
      }
    };

    checkAuthStatus();
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setShowLoginModal(true);
  };

  const switchMode = (mode) => {
    setCurrentMode(mode);
  };

  const openModal = (title, content) => {
    setModalContent({ title, content });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  return (
    <AuthProvider>
      <ChatProvider>
        <div className="app-container">
          {isLoggedIn ? (
            <>
              {/* <Sidebar 
                currentMode={currentMode} 
                onSwitchMode={switchMode} 
              /> */}
              <div className="main-content">
                <Header 
                  title={currentMode === 'chat' ? 'Intelligent Web Assistant' : 'Task Automation Assistant'} 
                  onLogout={handleLogout}
                />
                <ChatWindow 
                  mode={currentMode} 
                  openModal={openModal}
                />
              </div>
              {showModal && (
                <Modal 
                  title={modalContent.title} 
                  onClose={closeModal}
                >
                  {modalContent.content}
                </Modal>
              )}
            </>
          ) : (
            <Login 
              isOpen={showLoginModal} 
              onLogin={handleLogin} 
            />
          )}
        </div>
      </ChatProvider>
    </AuthProvider>
  );
}