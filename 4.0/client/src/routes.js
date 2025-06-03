import { Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Profile from './pages/auth/Profile';
import Dashboard from './pages/dashboard/Dashboard';
import ToolsList from './pages/tools/ToolsList';
import NotFound from './pages/NotFound';
import UserManagement from './pages/admin/UserManagement';
// import TaskAutomation from './pages/tasks/TaskAutomation';

/**
 * Configuration des routes de l'application
 * @param {boolean} isAuthenticated - Indique si l'utilisateur est authentifié
 * @param {boolean} isAdmin - Indique si l'utilisateur est un administrateur
 * @returns {Array} Configuration des routes
 */
const getRoutes = (isAuthenticated, isAdmin) => [
  {
    path: '/',
    element: <Home />
  },
  {
    path: '/login',
    element: isAuthenticated ? <Navigate to="/dashboard" /> : <Login />
  },
  {
    path: '/register',
    element: isAuthenticated ? <Navigate to="/dashboard" /> : <Register />
  },
  {
    path: '/dashboard',
    element: isAuthenticated ? <Dashboard /> : <Navigate to="/login" />
  },
  {
    path: '/tools',
    element: isAuthenticated ? <ToolsList /> : <Navigate to="/login" />
  },
  // {
  //   path: '/tasks',
  //   element: isAuthenticated ? <TaskAutomation /> : <Navigate to="/login" />
  // },
  {
    path: '/profile',
    element: isAuthenticated ? <Profile /> : <Navigate to="/login" />
  },
  {
    path: '/admin',
    element: isAuthenticated && isAdmin ? <UserManagement /> : <Navigate to={isAuthenticated ? "/dashboard" : "/login"} />
  },
  {
    path: '*',
    element: <NotFound />
  }
];

export default getRoutes;