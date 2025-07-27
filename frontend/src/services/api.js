const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('auth_token');
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      ...options
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  }
};

export const apiService = {
  // Auth
  getCurrentUser: () => api.request('/auth/user'),
  
  // Health
  health: () => api.request('/health'),
  
  // Profile  
  getProfile: () => api.request('/users/profile'),
  updateProfile: (data) => api.request('/users/profile', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Matches
  getMatches: (params) => api.request('/matches' + (params ? `?${new URLSearchParams(params)}` : '')),
  
  // Sessions
  getSessions: (params) => api.request('/sessions' + (params ? `?${new URLSearchParams(params)}` : '')),
  
  // Messages
  getChats: () => api.request('/messages/chats')
};