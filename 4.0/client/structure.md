// Structure du dossier frontend
frontend/
  ├── public/
  │   ├── favicon.ico
  │   ├── index.html
  │   └── robots.txt
  ├── src/
  │   ├── api/
  │   │   ├── auth.js          // Fonctions d'API pour l'authentification
  │   │   ├── tools.js         // Fonctions d'API pour les outils MCP
  │   │   └── axios.js         // Configuration d'Axios avec intercepteurs
  │   ├── assets/
  │   │   ├── images/          // Images et icônes
  │   │   └── styles/          // Styles globaux
  │   ├── components/
  │   │   ├── common/          // Composants réutilisables
  │   │   │   ├── Button.js
  │   │   │   ├── Card.js
  │   │   │   ├── Loader.js
  │   │   │   ├── Modal.js
  │   │   │   └── Notification.js
  │   │   ├── layout/          // Composants de mise en page
  │   │   │   ├── Header.js
  │   │   │   ├── Sidebar.js
  │   │   │   ├── Footer.js
  │   │   │   └── AppLayout.js
  │   │   ├── auth/            // Composants d'authentification
  │   │   │   ├── LoginForm.js
  │   │   │   ├── RegisterForm.js
  │   │   │   └── ProfileCard.js
  │   │   └── tools/           // Composants spécifiques aux outils
  │   │       ├── ToolCard.js
  │   │       ├── ToolExecutor.js
  │   │       └── ScreenshotViewer.js
  │   ├── contexts/
  │   │   ├── AuthContext.js   // Contexte d'authentification
  │   │   └── NotificationContext.js // Contexte de notification
  │   ├── hooks/
  │   │   ├── useAuth.js       // Hook pour l'authentification
  │   │   ├── useTools.js      // Hook pour les outils
  │   │   └── useSessionManager.js // Gestion des sessions
  │   ├── pages/
  │   │   ├── auth/
  │   │   │   ├── Login.js
  │   │   │   ├── Register.js
  │   │   │   └── Profile.js
  │   │   ├── dashboard/
  │   │   │   └── Dashboard.js
  │   │   ├── tools/
  │   │   │   ├── ToolsList.js
  │   │   │   └── ToolExecution.js
  │   │   ├── admin/
  │   │   │   └── UserManagement.js
  │   │   ├── NotFound.js
  │   │   └── Home.js
  │   ├── utils/
  │   │   ├── firebase.js      // Configuration Firebase
  │   │   ├── validation.js    // Validation des formulaires
  │   │   └── helpers.js       // Fonctions utilitaires
  │   ├── App.js               // Composant principal
  │   ├── index.js             // Point d'entrée React
  │   └── routes.js            // Configuration des routes
  ├── .env                     // Variables d'environnement
  ├── .eslintrc.js             // Configuration ESLint
  ├── .gitignore               // Fichiers à ignorer par Git
  ├── Dockerfile               // Configuration Docker
  ├── package.json             // Dépendances
  └── README.md                // Documentation