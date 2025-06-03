import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import Card from '../common/Card';
import Button from '../common/Button';
import { useAuth } from '../../hooks/useAuth';
import { updateUser } from '../../api/auth';
import { useNotification } from '../../contexts/NotificationContext';

const ProfileCard = () => {
  const { userProfile, currentUser } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      displayName: userProfile?.displayName || ''
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const { success, error } = useNotification();

  const onSubmit = async (data) => {
    setIsLoading(true);
    
    try {
      await updateUser(currentUser.uid, {
        displayName: data.displayName
      });
      
      success('Profil mis à jour avec succès');
    } catch (err) {
      console.error('Erreur lors de la mise à jour du profil:', err);
      error(err.message || 'Erreur lors de la mise à jour du profil');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card title="Profil Utilisateur">
      <div className="space-y-6">
        <div className="flex items-center">
          <div className="h-20 w-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl mr-4">
            {userProfile?.displayName?.charAt(0) || currentUser?.email?.charAt(0) || 'U'}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{userProfile?.displayName || 'Utilisateur'}</h3>
            <p className="text-gray-600">{currentUser?.email}</p>
            <p className="text-sm text-gray-500 mt-1">
              Rôle: <span className="font-medium">{userProfile?.role || 'Utilisateur'}</span>
            </p>
          </div>
        </div>
        
        <div className="border-t border-gray-200 pt-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Informations du profil</h4>
          
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="displayName">
                Nom d'affichage
              </label>
              <input
                id="displayName"
                type="text"
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
                value={currentUser?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">L'email ne peut pas être modifié.</p>
            </div>
            
            <div>
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading}
              >
                {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </form>
        </div>
        
        <div className="border-t border-gray-200 pt-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Informations du compte</h4>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Dernier connexion: </span>
            {currentUser?.metadata?.lastSignInTime ? new Date(currentUser.metadata.lastSignInTime).toLocaleString() : 'Inconnu'}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Compte créé le: </span>
            {currentUser?.metadata?.creationTime ? new Date(currentUser.metadata.creationTime).toLocaleString() : 'Inconnu'}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium">Email vérifié: </span>
            {currentUser?.emailVerified ? 'Oui' : 'Non'}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default ProfileCard;