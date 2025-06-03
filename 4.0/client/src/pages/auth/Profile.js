import React from 'react';
import ProfileCard from '../../components/auth/ProfileCard';

const Profile = () => {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mon Profil</h1>
        <p className="text-gray-600">Gérez vos informations personnelles et vos préférences</p>
      </div>
      
      <div className="max-w-3xl">
        <ProfileCard />
      </div>
    </div>
  );
};

export default Profile;
