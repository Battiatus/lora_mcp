import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import { useNotification } from '../../contexts/NotificationContext';
import { createUser, updateUser, deleteUser } from '../../api/auth';
import { useAuth } from '../../hooks/useAuth';

// Composant pour la gestion des utilisateurs (admin)
const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm();
  const { success, error: showError } = useNotification();
  const { currentUser } = useAuth();
  
  // Simuler le chargement des utilisateurs
  // Dans une implémentation réelle, vous récupéreriez les utilisateurs depuis l'API
  useEffect(() => {
    // Simulation d'un appel API
    setTimeout(() => {
      setUsers([
        {
          uid: '1',
          email: 'admin@example.com',
          displayName: 'Administrateur',
          role: 'admin',
          createdAt: new Date('2023-01-01').toISOString(),
        },
        {
          uid: '2',
          email: 'user@example.com',
          displayName: 'Utilisateur Standard',
          role: 'user',
          createdAt: new Date('2023-01-15').toISOString(),
        },
        // Vous ajouteriez ici les vrais utilisateurs de votre système
      ]);
      setLoading(false);
    }, 1000);
  }, []);
  
  // Ouvrir le modal de création
  const openCreateModal = () => {
    reset(); // Réinitialiser le formulaire
    setIsCreateModalOpen(true);
  };
  
  // Ouvrir le modal de modification
  const openEditModal = (user) => {
    setSelectedUser(user);
    setValue('displayName', user.displayName);
    setValue('role', user.role);
    setIsEditModalOpen(true);
  };
  
  // Ouvrir le modal de suppression
  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };
  
  // Fermer tous les modals
  const closeModals = () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setIsDeleteModalOpen(false);
    setSelectedUser(null);
    reset();
  };
  
  // Créer un nouvel utilisateur
  const handleCreateUser = async (data) => {
    setLoading(true);
    
    try {
      const result = await createUser({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        role: data.role
      });
      
      // Ajouter le nouvel utilisateur à la liste
      setUsers([...users, {
        uid: result.data.uid,
        email: result.data.email,
        displayName: result.data.displayName,
        role: result.data.role,
        createdAt: new Date().toISOString()
      }]);
      
      success('Utilisateur créé avec succès');
      closeModals();
    } catch (err) {
      console.error('Erreur lors de la création de l\'utilisateur:', err);
      showError(err.message || 'Erreur lors de la création de l\'utilisateur');
    } finally {
      setLoading(false);
    }
  };
  
  // Mettre à jour un utilisateur
  const handleUpdateUser = async (data) => {
    if (!selectedUser) return;
    
    setLoading(true);
    
    try {
      await updateUser(selectedUser.uid, {
        displayName: data.displayName,
        role: data.role
      });
      
      // Mettre à jour l'utilisateur dans la liste
      setUsers(users.map(user => 
        user.uid === selectedUser.uid 
          ? { ...user, displayName: data.displayName, role: data.role }
          : user
      ));
      
      success('Utilisateur mis à jour avec succès');
      closeModals();
    } catch (err) {
      console.error('Erreur lors de la mise à jour de l\'utilisateur:', err);
      showError(err.message || 'Erreur lors de la mise à jour de l\'utilisateur');
    } finally {
      setLoading(false);
    }
  };
  
  // Supprimer un utilisateur
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    setLoading(true);
    
    try {
      await deleteUser(selectedUser.uid);
      
      // Supprimer l'utilisateur de la liste
      setUsers(users.filter(user => user.uid !== selectedUser.uid));
      
      success('Utilisateur supprimé avec succès');
      closeModals();
    } catch (err) {
      console.error('Erreur lors de la suppression de l\'utilisateur:', err);
      showError(err.message || 'Erreur lors de la suppression de l\'utilisateur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des Utilisateurs</h1>
          <p className="text-gray-600">Administrez les comptes utilisateurs</p>
        </div>
        <Button
          onClick={openCreateModal}
          disabled={loading}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Nouvel utilisateur
        </Button>
      </div>
      
      <Card>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader size="lg" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nom
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rôle
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date de création
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.uid}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                          {user.displayName.charAt(0)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {user.displayName}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'admin' 
                          ? 'bg-purple-100 text-purple-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => openEditModal(user)}
                          className="text-blue-600 hover:text-blue-900"
                          disabled={currentUser.uid === user.uid}
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => openDeleteModal(user)}
                          className="text-red-600 hover:text-red-900"
                          disabled={currentUser.uid === user.uid}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      
      {/* Modal de création d'utilisateur */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeModals}
        title="Nouvel utilisateur"
        size="md"
      >
        <form onSubmit={handleSubmit(handleCreateUser)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nom d'affichage
              </label>
              <input
                type="text"
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  errors.displayName ? 'border-red-300' : ''
                }`}
                {...register('displayName', { required: 'Le nom d\'affichage est requis' })}
              />
              {errors.displayName && (
                <p className="mt-1 text-sm text-red-600">{errors.displayName.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  errors.email ? 'border-red-300' : ''
                }`}
                {...register('email', { 
                  required: 'L\'email est requis',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Adresse email invalide'
                  }
                })}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Mot de passe
              </label>
              <input
                type="password"
                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  errors.password ? 'border-red-300' : ''
                }`}
                {...register('password', { 
                  required: 'Le mot de passe est requis',
                  minLength: {
                    value: 6,
                    message: 'Le mot de passe doit contenir au moins 6 caractères'
                  }
                })}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Rôle
              </label>
              <select
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                {...register('role')}
                defaultValue="user"
              >
                <option value="user">Utilisateur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModals}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading}
            >
              {loading ? 'Création...' : 'Créer'}
            </Button>
          </div>
        </form>
      </Modal>
      
      {/* Modal de modification d'utilisateur */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={closeModals}
        title="Modifier l'utilisateur"
        size="md"
      >
        {selectedUser && (
          <form onSubmit={handleSubmit(handleUpdateUser)}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Nom d'affichage
                </label>
                <input
                  type="text"
                  className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                    errors.displayName ? 'border-red-300' : ''
                  }`}
                  {...register('displayName', { required: 'Le nom d\'affichage est requis' })}
                />
                {errors.displayName && (
                  <p className="mt-1 text-sm text-red-600">{errors.displayName.message}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm text-gray-500"
                  value={selectedUser.email}
                  disabled
                />
                <p className="mt-1 text-xs text-gray-500">L'email ne peut pas être modifié</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Rôle
                </label>
                <select
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  {...register('role')}
                >
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={closeModals}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={loading}
              >
                {loading ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      
      {/* Modal de suppression d'utilisateur */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeModals}
        title="Supprimer l'utilisateur"
        size="sm"
      >
        {selectedUser && (
          <div>
            <p className="text-gray-700">
              Êtes-vous sûr de vouloir supprimer l'utilisateur <span className="font-semibold">{selectedUser.displayName}</span> ?
            </p>
            <p className="text-gray-500 text-sm mt-2">
              Cette action est irréversible.
            </p>
            
            <div className="mt-6 flex justify-end space-x-3">
              <Button
                type="button"
                variant="ghost"
                onClick={closeModals}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteUser}
                disabled={loading}
              >
                {loading ? 'Suppression...' : 'Supprimer'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UserManagement;