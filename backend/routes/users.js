const express = require('express');
const User = require('../models/User');
const Match = require('../models/Match');
const { authenticate, requireProfile, userRateLimit } = require('../middleware/auth');
const { validate, validateObjectId, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting to all user routes
router.use(userRateLimit(150, 15 * 60 * 1000)); // 150 requests per 15 minutes

// Get current user's profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      profile: user.profile,
      stats: user.stats,
      settings: user.settings,
      location: user.location,
      lastActive: user.lastActive,
      createdAt: user.createdAt
    });
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      error: 'Failed to get profile',
      message: error.message
    });
  }
});

// Create or update user profile
router.post('/profile', authenticate, validate(schemas.profile), async (req, res) => {
  try {
    const user = req.user;
    const profileData = req.body;
    
    // Update user profile
    user.profile = {
      subjects: profileData.subjects,
      learningStyle: profileData.learningStyle,
      availability: profileData.availability,
      performanceLevel: profileData.performanceLevel,
      goals: profileData.goals || '',
      preferences: profileData.preferences || user.profile?.preferences || {}
    };
    
    await user.save();
    
    // Find potential matches after profile update
    try {
      const potentialMatches = await User.findPotentialMatches(user._id, 20);
      
      // Create match records
      const matchPromises = potentialMatches.map(async (match) => {
        return Match.createOrUpdateMatch(user._id, match._id, match.compatibility);
      });
      
      await Promise.all(matchPromises);
    } catch (matchError) {
      console.warn('Failed to update matches:', matchError);
      // Don't fail the profile update if matching fails
    }
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      profile: user.profile,
      stats: user.stats,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      message: error.message
    });
  }
});

// Get user by ID (public profile)
router.get('/:id', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    const user = await User.findById(id).select('-auth0Id -settings');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check privacy settings
    if (user.settings?.privacy?.profileVisibility === 'private') {
      return res.status(403).json({ error: 'Profile is private' });
    }
    
    // If profile is matches-only, check if users are matched
    if (user.settings?.privacy?.profileVisibility === 'matches-only') {
      const match = await Match.findExistingMatch(currentUser._id, id);
      if (!match || match.status !== 'active') {
        return res.status(403).json({ error: 'Profile is only visible to matches' });
      }
    }
    
    // Filter response based on privacy settings
    const response = {
      id: user._id,
      name: user.name,
      avatar: user.avatar,
      profile: {
        subjects: user.profile?.subjects || [],
        learningStyle: user.profile?.learningStyle,
        availability: user.profile?.availability || [],
        performanceLevel: user.profile?.performanceLevel,
        goals: user.profile?.goals || ''
      },
      stats: {
        totalSessions: user.stats?.totalSessions || 0,
        completedSessions: user.stats?.completedSessions || 0,
        averageRating: user.stats?.averageRating || 0
      },
      lastActive: user.lastActive,
      createdAt: user.createdAt
    };
    
    // Add email if privacy allows
    if (user.settings?.privacy?.showEmail) {
      response.email = user.email;
    }
    
    // Add location if privacy allows
    if (user.settings?.privacy?.showLocation) {
      response.location = user.location;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user',
      message: error.message
    });
  }
});

// Update user settings
router.patch('/settings', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { notifications, privacy } = req.body;
    
    if (notifications) {
      user.settings.notifications = {
        ...user.settings.notifications,
        ...notifications
      };
    }
    
    if (privacy) {
      user.settings.privacy = {
        ...user.settings.privacy,
        ...privacy
      };
    }
    
    await user.save();
    
    res.json({
      settings: user.settings,
      message: 'Settings updated successfully'
    });
    
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ 
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

// Update user location
router.patch('/location', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { coordinates, address } = req.body;
    
    // Validate coordinates
    if (coordinates && (!Array.isArray(coordinates) || coordinates.length !== 2)) {
      return res.status(400).json({ error: 'Coordinates must be an array of [longitude, latitude]' });
    }
    
    if (coordinates) {
      const [longitude, latitude] = coordinates;
      if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        return res.status(400).json({ error: 'Coordinates must be numbers' });
      }
      
      if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return res.status(400).json({ error: 'Invalid coordinate values' });
      }
      
      user.location.coordinates = coordinates;
    }
    
    if (address) {
      if (typeof address !== 'string') {
        return res.status(400).json({ error: 'Address must be a string' });
      }
      user.location.address = address;
    }
    
    await user.save();
    
    res.json({
      location: user.location,
      message: 'Location updated successfully'
    });
    
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ 
      error: 'Failed to update location',
      message: error.message
    });
  }
});

// Search users
router.get('/search', authenticate, requireProfile, async (req, res) => {
  try {
    const {
      q, // search query
      subjects,
      learningStyle,
      performanceLevel,
      availability,
      maxDistance,
      page = 1,
      limit = 20
    } = req.query;
    
    const currentUser = req.user;
    const skip = (page - 1) * limit;
    
    // Build search query
    const query = {
      _id: { $ne: currentUser._id },
      isActive: true
    };
    
    // Text search in name and profile goals
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { 'profile.goals': { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filter by subjects
    if (subjects) {
      const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
      query['profile.subjects'] = { $in: subjectArray };
    }
    
    // Filter by learning style
    if (learningStyle) {
      query['profile.learningStyle'] = parseInt(learningStyle);
    }
    
    // Filter by performance level
    if (performanceLevel) {
      const level = parseInt(performanceLevel);
      query['profile.performanceLevel'] = { $gte: level - 1, $lte: level + 1 };
    }
    
    // Filter by availability
    if (availability) {
      const availabilityArray = Array.isArray(availability) ? availability : [availability];
      query['profile.availability'] = { $in: availabilityArray };
    }
    
    // Geospatial search if coordinates and maxDistance provided
    if (maxDistance && currentUser.location.coordinates[0] !== 0 && currentUser.location.coordinates[1] !== 0) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: currentUser.location.coordinates
          },
          $maxDistance: parseInt(maxDistance) * 1000 // Convert km to meters
        }
      };
    }
    
    const users = await User.find(query)
      .select('name email avatar profile stats location lastActive createdAt')
      .sort({ lastActive: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Calculate compatibility scores
    const usersWithCompatibility = users.map(user => ({
      ...user.toObject(),
      compatibility: currentUser.calculateCompatibility(user)
    })).sort((a, b) => b.compatibility - a.compatibility);
    
    const total = await User.countDocuments(query);
    
    res.json({
      users: usersWithCompatibility,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ 
      error: 'Failed to search users',
      message: error.message
    });
  }
});

// Get user statistics
router.get('/:id/stats', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id).select('stats profile');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get additional statistics
    const [totalMatches, activeSessions] = await Promise.all([
      Match.countDocuments({
        $or: [{ userId: id }, { matchedUserId: id }],
        status: 'active'
      }),
      require('../models/Session').countDocuments({
        'participants.userId': id,
        status: { $in: ['scheduled', 'in-progress'] }
      })
    ]);
    
    res.json({
      basicStats: user.stats,
      additionalStats: {
        totalMatches,
        activeSessions,
        subjects: user.profile?.subjects?.length || 0,
        profileCompleteness: calculateProfileCompleteness(user.profile)
      }
    });
    
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get user statistics',
      message: error.message
    });
  }
});

// Block/unblock user
router.patch('/:id/block', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { block } = req.body;
    const currentUser = req.user;
    
    if (id === currentUser._id.toString()) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }
    
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Find or create match record
    let match = await Match.findExistingMatch(currentUser._id, id);
    
    if (!match) {
      match = new Match({
        userId: currentUser._id,
        matchedUserId: id,
        compatibility: 0,
        status: 'pending'
      });
    }
    
    // Update match status
    match.status = block ? 'blocked' : 'pending';
    match.addInteraction('block', { blocked: block, blockedBy: currentUser._id });
    
    await match.save();
    
    res.json({
      message: block ? 'User blocked successfully' : 'User unblocked successfully',
      status: match.status
    });
    
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ 
      error: 'Failed to block/unblock user',
      message: error.message
    });
  }
});

// Report user
router.post('/:id/report', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    const currentUser = req.user;
    
    if (!reason) {
      return res.status(400).json({ error: 'Report reason is required' });
    }
    
    if (id === currentUser._id.toString()) {
      return res.status(400).json({ error: 'Cannot report yourself' });
    }
    
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Create report record (you might want to create a separate Report model)
    const reportData = {
      reportedBy: currentUser._id,
      reportedUser: id,
      reason,
      description: description || '',
      timestamp: new Date(),
      status: 'pending'
    };
    
    // For now, just log the report (implement proper reporting system later)
    console.log('User report:', reportData);
    
    // Automatically block the user for the reporter
    let match = await Match.findExistingMatch(currentUser._id, id);
    if (match) {
      match.status = 'blocked';
      match.addInteraction('report', reportData);
      await match.save();
    }
    
    res.json({
      message: 'User reported successfully',
      reportId: `report_${Date.now()}` // Generate proper ID in real implementation
    });
    
  } catch (error) {
    console.error('Report user error:', error);
    res.status(500).json({ 
      error: 'Failed to report user',
      message: error.message
    });
  }
});

// Helper function to calculate profile completeness
function calculateProfileCompleteness(profile) {
  if (!profile) return 0;
  
  let score = 0;
  const fields = [
    profile.subjects && profile.subjects.length > 0,
    profile.learningStyle,
    profile.availability && profile.availability.length > 0,
    profile.performanceLevel,
    profile.goals && profile.goals.trim().length > 0
  ];
  
  fields.forEach(field => {
    if (field) score += 20; // Each field worth 20%
  });
  
  return score;
}

module.exports = router;