import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Button from '../common/Button';
import { useAuth } from '../../hooks/useAuth';

const RegisterForm = ({ onSuccess }) => {
  const { register, handleSubmit, formState: { errors }, watch } = useForm();
  const { register: registerUser, error: authError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  
  const password = watch('password', '');

  const onSubmit = async (data) => {
    setIsLoading(true);
    setFormError(null);
    
    try {
      await registerUser(data.email, data.password, data.displayName);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Erreur d\'inscription:', error);
      setFormError(error.message || 'Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Inscription</h2>
        <p className="text-gray-600 mt-2">Créez votre compte MCP Assistant</p>
      </div>
      
      {(formError || authError) && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4">
          {formError || authError}
        </div>
      )}
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="displayName">
            Nom d'affichage
          </label>
          <input
            id="displayName"
            type="text"
            placeholder="Votre nom d'affichage"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors.displayName ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
            {...register('displayName', { required: 'Le nom d\'affichage est requis' })}
          />
          {errors.displayName && (
            <p className="text-red-500 text-xs mt-1">{errors.displayName.message}</p>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="Votre adresse email"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors.email ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
            {...register('email', { 
              required: 'L\'email est requis',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Adresse email invalide'
              }
            })}
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
          )}
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            placeholder="Votre mot de passe"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors.password ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
            {...register('password', { 
              required: 'Le mot de passe est requis',
              minLength: {
                value: 6,
                message: 'Le mot de passe doit contenir au moins 6 caractères'
              }
            })}
          />
          {errors.password && (
            <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
          )}
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="confirmPassword">
            Confirmer le mot de passe
          </label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Confirmez votre mot de passe"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors.confirmPassword ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
            {...register('confirmPassword', { 
              required: 'Veuillez confirmer votre mot de passe',
              validate: value => value === password || 'Les mots de passe ne correspondent pas'
            })}
          />
          {errors.confirmPassword && (
            <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>
        
        <div className="mb-6">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Inscription en cours...' : 'S\'inscrire'}
          </Button>
        </div>
        
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            Déjà un compte? {' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-800">
              Se connecter
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
};

export default RegisterForm;