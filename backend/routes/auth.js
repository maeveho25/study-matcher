const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Exchange Auth0 authorization code for tokens
router.post('/token', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    // Exchange code for tokens with Auth0
    const tokenResponse = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.FRONTEND_URL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const { access_token, id_token, refresh_token } = tokenResponse.data;
    
    // Get user info from Auth0
    const userResponse = await axios.get(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const auth0User = userResponse.data;
    
    // Find or create user in our database
    let user = await User.findOne({ auth0Id: auth0User.sub });
    
    if (!user) {
      // Create new user
      user = new User({
        auth0Id: auth0User.sub,
        name: auth0User.name || auth0User.nickname || 'Unknown User',
        email: auth0User.email,
        avatar: auth0User.picture
      });
      await user.save();
    } else {
      // Update existing user info
      user.name = auth0User.name || user.name;
      user.email = auth0User.email || user.email;
      user.avatar = auth0User.picture || user.avatar;
      await user.updateLastActive();
      await user.save();
    }
    
    // Return tokens and user info
    res.json({
      access_token,
      id_token,
      refresh_token,
      user: {
        id: user._id,
        auth0Id: user.auth0Id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        profileComplete: !!(user.profile && user.profile.subjects && user.profile.subjects.length > 0)
      }
    });
    
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid authorization code' });
    }
    
    res.status(500).json({ 
      error: 'Failed to exchange authorization code',
      message: error.message
    });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    
    // Exchange refresh token for new access token
    const response = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      refresh_token: refresh_token
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const { access_token, id_token } = response.data;
    
    res.json({
      access_token,
      id_token
    });
    
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    res.status(500).json({ 
      error: 'Failed to refresh token',
      message: error.message
    });
  }
});

// Get current user info
router.get('/user', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      id: user._id,
      auth0Id: user.auth0Id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      profile: user.profile,
      stats: user.stats,
      settings: user.settings,
      profileComplete: !!(user.profile && user.profile.subjects && user.profile.subjects.length > 0),
      lastActive: user.lastActive,
      createdAt: user.createdAt
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user information',
      message: error.message
    });
  }
});

// Update user basic info
router.patch('/user', authenticate, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const user = req.user;
    
    // Validate input
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name must be a non-empty string' });
      }
      user.name = name.trim();
    }
    
    if (avatar !== undefined) {
      if (typeof avatar !== 'string') {
        return res.status(400).json({ error: 'Avatar must be a string URL' });
      }
      user.avatar = avatar;
    }
    
    await user.save();
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      message: 'User information updated successfully'
    });
    
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ 
      error: 'Failed to update user information',
      message: error.message
    });
  }
});

// Logout (revoke tokens)
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refresh_token } = req.body;
    
    // Update user's last active time
    await req.user.updateLastActive();
    
    // Optionally revoke refresh token with Auth0
    if (refresh_token) {
      try {
        await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/revoke`, {
          token: refresh_token,
          client_id: process.env.AUTH0_CLIENT_ID,
          client_secret: process.env.AUTH0_CLIENT_SECRET
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (revokeError) {
        console.warn('Failed to revoke refresh token:', revokeError.message);
        // Don't fail the logout if token revocation fails
      }
    }
    
    res.json({ message: 'Logged out successfully' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Failed to logout',
      message: error.message
    });
  }
});

// Check if user exists by email
router.get('/check-user/:email', optionalAuth, async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    res.json({
      exists: !!user,
      user: user ? {
        id: user._id,
        name: user.name,
        avatar: user.avatar,
        profileComplete: !!(user.profile && user.profile.subjects && user.profile.subjects.length > 0)
      } : null
    });
    
  } catch (error) {
    console.error('Check user error:', error);
    res.status(500).json({ 
      error: 'Failed to check user',
      message: error.message
    });
  }
});

// Get Auth0 management API token (for admin operations)
router.post('/management-token', authenticate, async (req, res) => {
  try {
    // Only allow admin users to get management token
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const response = await axios.post(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    res.json({
      access_token: response.data.access_token,
      expires_in: response.data.expires_in
    });
    
  } catch (error) {
    console.error('Management token error:', error);
    res.status(500).json({ 
      error: 'Failed to get management token',
      message: error.message
    });
  }
});

// Delete user account
router.delete('/user', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    // Delete user from our database
    await User.findByIdAndDelete(user._id);
    
    // TODO: Clean up related data (matches, sessions, messages)
    // You might want to implement soft delete instead
    
    res.json({ message: 'User account deleted successfully' });
    
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      error: 'Failed to delete user account',
      message: error.message
    });
  }
});

module.exports = router;