const express = require('express');
const User = require('../models/User');
const Match = require('../models/Match');
const { authenticate, requireProfile, userRateLimit } = require('../middleware/auth');
const { validate, validateObjectId, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting
router.use(userRateLimit(100, 15 * 60 * 1000));

// Get user's matches
router.get('/', authenticate, requireProfile, validate(schemas.matchQuery, 'query'), async (req, res) => {
  try {
    const {
      status = 'active',
      minCompatibility = 0,
      subjects,
      page = 1,
      limit = 20
    } = req.query;
    
    const currentUser = req.user;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {
      $or: [
        { userId: currentUser._id },
        { matchedUserId: currentUser._id }
      ],
      status: status,
      compatibility: { $gte: parseInt(minCompatibility) }
    };
    
    // Filter by subjects if provided
    if (subjects) {
      const subjectArray = Array.isArray(subjects) ? subjects : [subjects];
      query.$or = query.$or.map(condition => ({
        ...condition,
        $or: [
          { 'userId.profile.subjects': { $in: subjectArray } },
          { 'matchedUserId.profile.subjects': { $in: subjectArray } }
        ]
      }));
    }
    
    const matches = await Match.find(query)
      .populate('userId', 'name email avatar profile stats lastActive')
      .populate('matchedUserId', 'name email avatar profile stats lastActive')
      .sort({ compatibility: -1, lastInteraction: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Format response to show the other user
    const formattedMatches = matches.map(match => {
      const isCurrentUser = match.userId._id.toString() === currentUser._id.toString();
      const otherUser = isCurrentUser ? match.matchedUserId : match.userId;
      
      return {
        id: match._id,
        user: {
          id: otherUser._id,
          name: otherUser.name,
          email: otherUser.email,
          avatar: otherUser.avatar,
          profile: otherUser.profile,
          stats: otherUser.stats,
          lastActive: otherUser.lastActive
        },
        compatibility: match.compatibility,
        status: match.status,
        matchType: match.matchType,
        mutualLike: match.mutualLike,
        sessionCount: match.sessionCount,
        averageRating: match.averageRating,
        lastInteraction: match.lastInteraction,
        createdAt: match.createdAt
      };
    });
    
    const total = await Match.countDocuments(query);
    
    res.json({
      matches: formattedMatches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ 
      error: 'Failed to get matches',
      message: error.message
    });
  }
});

// Find new matches
router.post('/find', authenticate, requireProfile, async (req, res) => {
  try {
    const currentUser = req.user;
    const { limit = 20, forceRefresh = false } = req.body;
    
    // Find potential matches
    const potentialMatches = await User.findPotentialMatches(currentUser._id, limit * 2);
    
    // Filter out existing matches if not forcing refresh
    let filteredMatches = potentialMatches;
    
    if (!forceRefresh) {
      const existingMatchIds = await Match.find({
        $or: [
          { userId: currentUser._id },
          { matchedUserId: currentUser._id }
        ]
      }).distinct('matchedUserId userId');
      
      const existingIds = new Set(existingMatchIds.map(id => id.toString()));
      existingIds.add(currentUser._id.toString());
      
      filteredMatches = potentialMatches.filter(match => 
        !existingIds.has(match._id.toString())
      );
    }
    
    // Take only the requested limit
    const newMatches = filteredMatches.slice(0, limit);
    
    // Create match records
    const matchPromises = newMatches.map(async (match) => {
      return Match.createOrUpdateMatch(currentUser._id, match._id, match.compatibility);
    });
    
    const createdMatches = await Promise.all(matchPromises);
    
    // Populate the created matches
    const populatedMatches = await Match.find({
      _id: { $in: createdMatches.map(m => m._id) }
    })
    .populate('matchedUserId', 'name email avatar profile stats lastActive')
    .sort({ compatibility: -1 });
    
    // Format response
    const formattedMatches = populatedMatches.map(match => ({
      id: match._id,
      user: {
        id: match.matchedUserId._id,
        name: match.matchedUserId.name,
        email: match.matchedUserId.email,
        avatar: match.matchedUserId.avatar,
        profile: match.matchedUserId.profile,
        stats: match.matchedUserId.stats,
        lastActive: match.matchedUserId.lastActive
      },
      compatibility: match.compatibility,
      status: match.status,
      matchType: match.matchType,
      createdAt: match.createdAt
    }));
    
    res.json({
      matches: formattedMatches,
      count: formattedMatches.length,
      message: `Found ${formattedMatches.length} new matches`
    });
    
  } catch (error) {
    console.error('Find matches error:', error);
    res.status(500).json({ 
      error: 'Failed to find matches',
      message: error.message
    });
  }
});

// Get specific match details
router.get('/:id', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    const match = await Match.findOne({
      _id: id,
      $or: [
        { userId: currentUser._id },
        { matchedUserId: currentUser._id }
      ]
    })
    .populate('userId', 'name email avatar profile stats lastActive')
    .populate('matchedUserId', 'name email avatar profile stats lastActive');
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Determine which user is the other user
    const isCurrentUser = match.userId._id.toString() === currentUser._id.toString();
    const otherUser = isCurrentUser ? match.matchedUserId : match.userId;
    
    // Add view interaction
    await match.addInteraction('view', { viewedBy: currentUser._id });
    
    res.json({
      id: match._id,
      user: {
        id: otherUser._id,
        name: otherUser.name,
        email: otherUser.email,
        avatar: otherUser.avatar,
        profile: otherUser.profile,
        stats: otherUser.stats,
        lastActive: otherUser.lastActive
      },
      compatibility: match.compatibility,
      status: match.status,
      matchType: match.matchType,
      mutualLike: match.mutualLike,
      userLiked: isCurrentUser ? match.userLiked : match.matchedUserLiked,
      sessionCount: match.sessionCount,
      ratings: match.ratings,
      averageRating: match.averageRating,
      interactionHistory: match.interactionHistory.slice(-10), // Last 10 interactions
      lastInteraction: match.lastInteraction,
      createdAt: match.createdAt
    });
    
  } catch (error) {
    console.error('Get match error:', error);
    res.status(500).json({ 
      error: 'Failed to get match',
      message: error.message
    });
  }
});

// Like/unlike a match
router.post('/:id/like', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    const match = await Match.findOne({
      _id: id,
      $or: [
        { userId: currentUser._id },
        { matchedUserId: currentUser._id }
      ]
    });
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Toggle like
    await match.toggleLike(currentUser._id);
    
    res.json({
      id: match._id,
      userLiked: match.userId.toString() === currentUser._id.toString() ? match.userLiked : match.matchedUserLiked,
      mutualLike: match.mutualLike,
      status: match.status,
      message: match.mutualLike ? 'It\'s a mutual match!' : 'Like updated'
    });
    
  } catch (error) {
    console.error('Like match error:', error);
    res.status(500).json({ 
      error: 'Failed to update like',
      message: error.message
    });
  }
});

// Rate a match
router.post('/:id/rate', authenticate, validateObjectId, validate(schemas.feedback), async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const currentUser = req.user;
    
    const match = await Match.findOne({
      _id: id,
      $or: [
        { userId: currentUser._id },
        { matchedUserId: currentUser._id }
      ]
    });
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Add rating
    await match.addRating(currentUser._id, rating, comment);
    
    // Update user stats
    const otherUserId = match.userId.toString() === currentUser._id.toString() 
      ? match.matchedUserId 
      : match.userId;
    
    const otherUser = await User.findById(otherUserId);
    if (otherUser) {
      const totalRatings = otherUser.stats.totalRatings + 1;
      const currentTotal = otherUser.stats.averageRating * otherUser.stats.totalRatings;
      const newAverage = (currentTotal + rating) / totalRatings;
      
      otherUser.stats.averageRating = Math.round(newAverage * 10) / 10;
      otherUser.stats.totalRatings = totalRatings;
      await otherUser.save();
    }
    
    res.json({
      id: match._id,
      rating: {
        score: rating,
        comment,
        timestamp: new Date()
      },
      averageRating: match.averageRating,
      message: 'Rating submitted successfully'
    });
    
  } catch (error) {
    console.error('Rate match error:', error);
    
    if (error.message === 'Rating already provided') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to submit rating',
      message: error.message
    });
  }
});

// Decline a match
router.post('/:id/decline', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const currentUser = req.user;
    
    const match = await Match.findOne({
      _id: id,
      $or: [
        { userId: currentUser._id },
        { matchedUserId: currentUser._id }
      ]
    });
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Update match status
    match.status = 'declined';
    await match.addInteraction('decline', { 
      declinedBy: currentUser._id, 
      reason: reason || 'No reason provided'
    });
    
    res.json({
      id: match._id,
      status: match.status,
      message: 'Match declined'
    });
    
  } catch (error) {
    console.error('Decline match error:', error);
    res.status(500).json({ 
      error: 'Failed to decline match',
      message: error.message
    });
  }
});

// Get match statistics
router.get('/stats/summary', authenticate, requireProfile, async (req, res) => {
  try {
    const currentUser = req.user;
    
    const [totalMatches, activeMatches, pendingMatches, mutualMatches] = await Promise.all([
      Match.countDocuments({
        $or: [{ userId: currentUser._id }, { matchedUserId: currentUser._id }]
      }),
      Match.countDocuments({
        $or: [{ userId: currentUser._id }, { matchedUserId: currentUser._id }],
        status: 'active'
      }),
      Match.countDocuments({
        $or: [{ userId: currentUser._id }, { matchedUserId: currentUser._id }],
        status: 'pending'
      }),
      Match.countDocuments({
        $or: [{ userId: currentUser._id }, { matchedUserId: currentUser._id }],
        mutualLike: true
      })
    ]);
    
    // Get average compatibility
    const compatibilityStats = await Match.aggregate([
      {
        $match: {
          $or: [{ userId: currentUser._id }, { matchedUserId: currentUser._id }],
          status: 'active'
        }
      },
      {
        $group: {
          _id: null,
          averageCompatibility: { $avg: '$compatibility' },
          maxCompatibility: { $max: '$compatibility' },
          minCompatibility: { $min: '$compatibility' }
        }
      }
    ]);
    
    const compatibility = compatibilityStats[0] || {
      averageCompatibility: 0,
      maxCompatibility: 0,
      minCompatibility: 0
    };
    
    res.json({
      totalMatches,
      activeMatches,
      pendingMatches,
      mutualMatches,
      averageCompatibility: Math.round(compatibility.averageCompatibility || 0),
      maxCompatibility: compatibility.maxCompatibility || 0,
      minCompatibility: compatibility.minCompatibility || 0,
      matchRate: totalMatches > 0 ? Math.round((activeMatches / totalMatches) * 100) : 0
    });
    
  } catch (error) {
    console.error('Get match stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get match statistics',
      message: error.message
    });
  }
});

// Delete a match (soft delete by setting status to declined)
router.delete('/:id', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    const match = await Match.findOne({
      _id: id,
      $or: [
        { userId: currentUser._id },
        { matchedUserId: currentUser._id }
      ]
    });
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Soft delete by changing status
    match.status = 'declined';
    await match.addInteraction('delete', { deletedBy: currentUser._id });
    
    res.json({
      message: 'Match removed successfully'
    });
    
  } catch (error) {
    console.error('Delete match error:', error);
    res.status(500).json({ 
      error: 'Failed to remove match',
      message: error.message
    });
  }
});

module.exports = router;