// src/utils/validation.js
/**
 * Fonctions de validation des formulaires
 */

/**
 * Valide une adresse email
 * @param {string} email - L'adresse email à valider
 * @returns {boolean} Vrai si l'email est valide
 */
export const isEmailValid = (email) => {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email);
};

/**
 * Valide un mot de passe selon les critères de sécurité
 * @param {string} password - Le mot de passe à valider
 * @returns {object} Objet contenant la validité et un message d'erreur si nécessaire
 */
export const validatePassword = (password) => {
  if (!password || password.length < 6) {
    return {
      isValid: false,
      message: 'Le mot de passe doit contenir au moins 6 caractères'
    };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasLetter || !hasNumber) {
    return {
      isValid: false,
      message: 'Le mot de passe doit contenir au moins une lettre et un chiffre'
    };
  }

  // Considérer le mot de passe comme fort s'il a des caractères spéciaux
  const isStrong = hasSpecialChar && password.length >= 8;

  return {
    isValid: true,
    isStrong,
    message: isStrong ? 'Mot de passe fort' : 'Mot de passe acceptable'
  };
};

/**
 * Valide un URL
 * @param {string} url - L'URL à valider
 * @returns {boolean} Vrai si l'URL est valide
 */
export const isUrlValid = (url) => {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch (e) {
    return false;
  }
};

/**
 * Valide un numéro de téléphone (format international)
 * @param {string} phone - Le numéro de téléphone à valider
 * @returns {boolean} Vrai si le numéro de téléphone est valide
 */
export const isPhoneValid = (phone) => {
  const regex = /^\+?[1-9]\d{1,14}$/;
  return regex.test(phone);
};

/**
 * Valide si une chaîne n'est pas vide après avoir enlevé les espaces
 * @param {string} value - La chaîne à valider
 * @returns {boolean} Vrai si la chaîne n'est pas vide
 */
export const isNotEmpty = (value) => {
  return value && value.trim().length > 0;
};

/**
 * Valide si une valeur est un nombre
 * @param {any} value - La valeur à valider
 * @returns {boolean} Vrai si la valeur est un nombre
 */
export const isNumber = (value) => {
  return !isNaN(Number(value));
};

/**
 * Valide si une valeur est dans une plage spécifiée
 * @param {number} value - La valeur à valider
 * @param {number} min - La valeur minimale
 * @param {number} max - La valeur maximale
 * @returns {boolean} Vrai si la valeur est dans la plage
 */
export const isInRange = (value, min, max) => {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
};

/**
 * Règles de validation pour un schéma de formulaire
 * Utilisable avec react-hook-form
 */
export const validationRules = {
  required: {
    value: true,
    message: 'Ce champ est requis'
  },
  email: {
    value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    message: 'Adresse email invalide'
  },
  password: {
    required: {
      value: true,
      message: 'Le mot de passe est requis'
    },
    minLength: {
      value: 6,
      message: 'Le mot de passe doit contenir au moins 6 caractères'
    },
    pattern: {
      value: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/,
      message: 'Le mot de passe doit contenir au moins une lettre et un chiffre'
    }
  },
  url: {
    pattern: {
      value: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,
      message: 'URL invalide'
    }
  }
};