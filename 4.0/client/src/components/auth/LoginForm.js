import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Button from '../common/Button';
import { useAuth } from '../../hooks/useAuth';

const LoginForm = ({ onSuccess }) => {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const { login, error: authError } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  const onSubmit = async (data) => {
    setIsLoading(true);
    setFormError(null);
    
    try {
      await login(data.email, data.password);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Erreur de connexion:', error);
      setFormError(error.message || 'Erreur lors de la connexion');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white shadow-md rounded-lg px-8 pt-6 pb-8 mb-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Connexion</h2>
        <p className="text-gray-600 mt-2">Connectez-vous à votre compte MCP Assistant</p>
      </div>
      
      {(formError || authError) && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4">
          {formError || authError}
        </div>
      )}
      
      <form onSubmit={handleSubmit(onSubmit)}>
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
        
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-gray-700 text-sm font-bold" htmlFor="password">
              Mot de passe
            </label>
            <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800">
              Mot de passe oublié?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            placeholder="Votre mot de passe"
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${errors.password ? 'border-red-500 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
            {...register('password', { required: 'Le mot de passe est requis' })}
          />
          {errors.password && (
            <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
          )}
        </div>
        
        <div className="mb-6">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={isLoading}
          >
            {isLoading ? 'Connexion en cours...' : 'Se connecter'}
          </Button>
        </div>
        
        <div className="text-center">
          <p className="text-gray-600 text-sm">
            Pas encore de compte? {''}
            <Link to="/register" className="text-blue-600 hover:text-blue-800">
              S'inscrire
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
};

export default LoginForm;