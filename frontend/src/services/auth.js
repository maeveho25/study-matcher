const AUTH0_DOMAIN = process.env.REACT_APP_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.REACT_APP_AUTH0_CLIENT_ID;
const REDIRECT_URI = window.location.origin;

export const authService = {
  login: () => {
    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
      console.warn('Auth0 not configured, using mock login');
      // Mock login for development
      localStorage.setItem('auth_token', 'mock-token');
      window.location.reload();
      return;
    }

    const authUrl = `https://${AUTH0_DOMAIN}/authorize?` +
      `response_type=code&` +
      `client_id=${AUTH0_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `scope=openid profile email`;
    
    window.location.href = authUrl;
  },

  logout: () => {
    localStorage.removeItem('auth_token');
    
    if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
      window.location.reload();
      return;
    }

    const logoutUrl = `https://${AUTH0_DOMAIN}/v2/logout?` +
      `client_id=${AUTH0_CLIENT_ID}&` +
      `returnTo=${encodeURIComponent(window.location.origin)}`;
    
    window.location.href = logoutUrl;
  },

  getTokenFromUrl: () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code');
  },

  clearUrl: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
};