import React, { useState, useEffect } from 'react';


function ThemeToggler() {
  // Check if user has a saved preference or use system preference
  const getSavedTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const [theme, setTheme] = useState(getSavedTheme);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    // Save user preference
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
      setTimeout(() => {
        setIsAnimating(false);
      }, 500);
    }, 150);
  };

  return (
    <button 
      className={`theme-toggle ${isAnimating ? 'animating' : ''}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <i className="fas fa-moon"></i>
      ) : (
        <i className="fas fa-sun"></i>
      )}
    </button>
  );
}

export default ThemeToggler;