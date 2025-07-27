const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');

// Verify Auth0 JWT token
const verifyAuth0Token = async (token) => {
  try {
    // Get Auth0 public key
    const response = await axios.get(`https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`);
    const jwks = response.data;
    
    // Decode token header to get key ID
    const decodedHeader = jwt.decode(token, { complete: true });
    if (!decodedHeader) {
      throw new Error('Invalid token');
    }
    
    const kid = decodedHeader.header.kid;
    const key = jwks.keys.find(k => k.kid === kid);
    
    if (!key) {
      throw new Error('Public key not found');
    }
    
    // Construct public key
    const publicKey = `-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`;
    
    // Verify token
    const decoded = jwt.verify(token, publicKey, {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    });
    
    return decoded;
  } catch (error) {
    throw new Error('Token verification failed: ' + error.message);
  }
};

// Main authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. Invalid token format.' });
    }
    
    // Verify token with Auth0
    const decoded = await verifyAuth0Token(token);
    
    // Find or create user in our database
    let user = await User.findOne({ auth0Id: decoded.sub });
    
    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        auth0Id: decoded.sub,
        name: decoded.name || decoded.nickname || 'Unknown User',
        email: decoded.email,
        avatar: decoded.picture
      });
      await user.save();
    } else {
      // Update last active timestamp
      await user.updateLastActive();
    }
    
    // Add user to request object
    req.user = user;
    req.auth0User = decoded;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return next();
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return next();
    }
    
    const decoded = await verifyAuth0Token(token);
    const user = await User.findOne({ auth0Id: decoded.sub });
    
    if (user) {
      req.user = user;
      req.auth0User = decoded;
      await user.updateLastActive();
    }
    
    next();
  } catch (error) {
    // Don't fail, just continue without user
    next();
  }
};

// Check if user has completed profile
const requireProfile = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  
  if (!req.user.profile || !req.user.profile.subjects || req.user.profile.subjects.length === 0) {
    return res.status(403).json({ 
      error: 'Profile setup required.',
      profileComplete: false 
    });
  }
  
  next();
};

// Admin only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  
  // Check if user has admin role (you can implement your own logic)
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  
  next();
};

// Rate limiting for specific users
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get user's request history
    let userRequests = requests.get(userId) || [];
    
    // Filter out old requests
    userRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    // Check if user exceeded limit
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    
    // Add current request
    userRequests.push(now);
    requests.set(userId, userRequests);
    
    next();
  };
};

// Middleware to check if user can access resource
const checkResourceAccess = (resourceType) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userId = req.user._id;
      
      switch (resourceType) {
        case 'session':
          const Session = require('../models/Session');
          const session = await Session.findById(resourceId);
          
          if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
          }
          
          const isParticipant = session.participants.some(p => 
            p.userId.toString() === userId.toString()
          );
          
          if (!isParticipant && session.createdBy.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Access denied to this session.' });
          }
          
          req.resource = session;
          break;
          
        case 'match':
          const Match = require('../models/Match');
          const match = await Match.findById(resourceId);
          
          if (!match) {
            return res.status(404).json({ error: 'Match not found.' });
          }
          
          if (match.userId.toString() !== userId.toString() && 
              match.matchedUserId.toString() !== userId.toString()) {
            return res.status(403).json({ error: 'Access denied to this match.' });
          }
          
          req.resource = match;
          break;
          
        default:
          return res.status(400).json({ error: 'Invalid resource type.' });
      }
      
      next();
    } catch (error) {
      console.error('Resource access check error:', error);
      res.status(500).json({ error: 'Internal server error.' });
    }
  };
};

module.exports = {
  authenticate,
  optionalAuth,
  requireProfile,
  requireAdmin,
  userRateLimit,
  checkResourceAccess
};