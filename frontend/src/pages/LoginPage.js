import React from 'react';
import { Users, User } from 'lucide-react';
import { authService } from '../services/auth';

const LoginPage = ({ onLogin }) => {
  const handleLogin = () => {
    // For development without Auth0, use mock login
    if (!process.env.REACT_APP_AUTH0_DOMAIN) {
      const mockToken = 'mock-jwt-token';
      const mockUser = {
        name: 'Test User',
        email: 'test@example.com',
        avatar: 'https://via.placeholder.com/150'
      };
      onLogin(mockToken, mockUser);
      return;
    }
    
    authService.login();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Study Buddy Matcher</h1>
          <p className="text-gray-600">Find your perfect study partner with AI-powered matching</p>
        </div>
        
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <User className="w-5 h-5" />
          {process.env.REACT_APP_AUTH0_DOMAIN ? 'Login with Auth0' : 'Login (Demo)'}
        </button>
        
        <div className="mt-6 text-sm text-gray-500 text-center">
          {process.env.REACT_APP_AUTH0_DOMAIN ? 
            'Secure authentication powered by Auth0' : 
            'Demo mode - Auth0 not configured'
          }
        </div>
      </div>
    </div>
  );
};

export default LoginPage;