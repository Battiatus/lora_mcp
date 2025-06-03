/**
 * Fonctions utilitaires générales
 */

/**
 * Formate une date en chaîne de caractères localisée
 * @param {string|Date} date - Date à formater
 * @param {Object} options - Options de formatage
 * @returns {string} Date formatée
 */
export const formatDate = (date, options = {}) => {
  const defaultOptions = {
    dateStyle: 'medium',
    timeStyle: 'short'
  };
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) {
    return 'Date invalide';
  }
  
  try {
    return new Intl.DateTimeFormat('fr-FR', { ...defaultOptions, ...options }).format(dateObj);
  } catch (error) {
    console.error('Erreur de formatage de date:', error);
    return dateObj.toLocaleString();
  }
};

/**
 * Tronque un texte à une longueur maximale
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @param {string} suffix - Suffixe à ajouter en cas de troncature
 * @returns {string} Texte tronqué
 */
export const truncateText = (text, maxLength = 100, suffix = '...') => {
  if (!text) return '';
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Génère un ID unique (simple, pas pour un usage cryptographique)
 * @returns {string} ID unique
 */
export const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Convertit un objet en paramètres d'URL
 * @param {Object} params - Paramètres à convertir
 * @returns {string} Chaîne de paramètres d'URL
 */
export const objectToQueryParams = (params) => {
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
};

/**
 * Convertit les paramètres d'URL en objet
 * @param {string} queryString - Chaîne de paramètres d'URL
 * @returns {Object} Objet de paramètres
 */
export const queryParamsToObject = (queryString) => {
  const params = {};
  const searchParams = new URLSearchParams(queryString);
  
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  
  return params;
};

/**
 * Formate un nombre avec séparateur de milliers
 * @param {number} num - Nombre à formater
 * @param {string} locale - Locale à utiliser
 * @returns {string} Nombre formaté
 */
export const formatNumber = (num, locale = 'fr-FR') => {
  return new Intl.NumberFormat(locale).format(num);
};

/**
 * Formate un prix avec symbole de devise
 * @param {number} price - Prix à formater
 * @param {string} currency - Devise (EUR, USD, etc.)
 * @param {string} locale - Locale à utiliser
 * @returns {string} Prix formaté
 */
export const formatPrice = (price, currency = 'EUR', locale = 'fr-FR') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(price);
};

/**
 * Vérifie si un objet est vide
 * @param {Object} obj - Objet à vérifier
 * @returns {boolean} Vrai si l'objet est vide
 */
export const isEmptyObject = (obj) => {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

/**
 * Copie un texte dans le presse-papiers
 * @param {string} text - Texte à copier
 * @returns {Promise<boolean>} Vrai si le texte a été copié
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Erreur lors de la copie dans le presse-papiers:', error);
    return false;
  }
};

/**
 * Retourne un élément aléatoire d'un tableau
 * @param {Array} array - Tableau source
 * @returns {*} Élément aléatoire
 */
export const getRandomArrayElement = (array) => {
  if (!Array.isArray(array) || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
};

/**
 * Mélange les éléments d'un tableau
 * @param {Array} array - Tableau à mélanger
 * @returns {Array} Tableau mélangé
 */
export const shuffleArray = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Retourne un objet avec des entrées filtrées selon un prédicat
 * @param {Object} obj - Objet à filtrer
 * @param {Function} predicate - Fonction de filtrage
 * @returns {Object} Objet filtré
 */
export const filterObject = (obj, predicate) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => predicate(value, key))
  );
};

/**
 * Attendre un certain temps
 * @param {number} ms - Millisecondes à attendre
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Détecte le type d'appareil
 * @returns {Object} Informations sur l'appareil
 */
export const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet = /(iPad|tablet|Tablet|Android(?!.*Mobile))/i.test(ua);
  const isDesktop = !isMobile && !isTablet;
  
  return {
    isMobile,
    isTablet,
    isDesktop,
    isIOS: /iPad|iPhone|iPod/.test(ua),
    isAndroid: /Android/.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
    isFirefox: /firefox/i.test(ua),
    isChrome: /chrome|chromium|crios/i.test(ua) && !/edg/i.test(ua),
    isEdge: /edg/i.test(ua)
  };
};