const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  matchedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  compatibility: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'blocked', 'declined'],
    default: 'pending'
  },
  matchType: {
    type: String,
    enum: ['mutual', 'one-way', 'suggested'],
    default: 'suggested'
  },
  interactionHistory: [{
    type: {
      type: String,
      enum: ['view', 'like', 'message', 'session_request', 'session_completed', 'rating'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    }
  }],
  lastInteraction: {
    type: Date,
    default: Date.now
  },
  mutualLike: {
    type: Boolean,
    default: false
  },
  userLiked: {
    type: Boolean,
    default: false
  },
  matchedUserLiked: {
    type: Boolean,
    default: false
  },
  sessionCount: {
    type: Number,
    default: 0
  },
  ratings: {
    userRating: {
      score: { type: Number, min: 1, max: 5 },
      comment: { type: String, maxlength: 200 },
      timestamp: Date
    },
    matchedUserRating: {
      score: { type: Number, min: 1, max: 5 },
      comment: { type: String, maxlength: 200 },
      timestamp: Date
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
matchSchema.index({ userId: 1, status: 1 });
matchSchema.index({ matchedUserId: 1, status: 1 });
matchSchema.index({ userId: 1, matchedUserId: 1 }, { unique: true });
matchSchema.index({ compatibility: -1 });
matchSchema.index({ lastInteraction: -1 });

// Virtual for average rating
matchSchema.virtual('averageRating').get(function() {
  const ratings = [];
  if (this.ratings.userRating && this.ratings.userRating.score) {
    ratings.push(this.ratings.userRating.score);
  }
  if (this.ratings.matchedUserRating && this.ratings.matchedUserRating.score) {
    ratings.push(this.ratings.matchedUserRating.score);
  }
  
  if (ratings.length === 0) return null;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
});

// Method to add interaction
matchSchema.methods.addInteraction = function(type, details = {}) {
  this.interactionHistory.push({
    type,
    details,
    timestamp: new Date()
  });
  this.lastInteraction = new Date();
  
  // Update counters based on interaction type
  if (type === 'session_completed') {
    this.sessionCount += 1;
  }
  
  return this.save();
};

// Method to handle like/unlike
matchSchema.methods.toggleLike = function(userId) {
  const isUser = userId.toString() === this.userId.toString();
  
  if (isUser) {
    this.userLiked = !this.userLiked;
  } else {
    this.matchedUserLiked = !this.matchedUserLiked;
  }
  
  // Check for mutual like
  this.mutualLike = this.userLiked && this.matchedUserLiked;
  
  // Update status based on mutual like
  if (this.mutualLike && this.status === 'pending') {
    this.status = 'active';
    this.matchType = 'mutual';
  }
  
  this.addInteraction('like', { userId, liked: isUser ? this.userLiked : this.matchedUserLiked });
  
  return this.save();
};

// Method to add rating
matchSchema.methods.addRating = function(userId, score, comment = '') {
  const isUser = userId.toString() === this.userId.toString();
  
  const ratingData = {
    score,
    comment,
    timestamp: new Date()
  };
  
  if (isUser) {
    this.ratings.userRating = ratingData;
  } else {
    this.ratings.matchedUserRating = ratingData;
  }
  
  this.addInteraction('rating', { userId, score, comment });
  
  return this.save();
};

// Static method to find matches for a user
matchSchema.statics.findUserMatches = async function(userId, status = 'active', page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  return this.find({
    $or: [
      { userId: userId },
      { matchedUserId: userId }
    ],
    status: status
  })
  .populate('userId', 'name email avatar profile stats')
  .populate('matchedUserId', 'name email avatar profile stats')
  .sort({ compatibility: -1, lastInteraction: -1 })
  .skip(skip)
  .limit(limit);
};

// Static method to check if match exists between two users
matchSchema.statics.findExistingMatch = async function(userId1, userId2) {
  return this.findOne({
    $or: [
      { userId: userId1, matchedUserId: userId2 },
      { userId: userId2, matchedUserId: userId1 }
    ]
  });
};

// Static method to create or update match
matchSchema.statics.createOrUpdateMatch = async function(userId, matchedUserId, compatibility) {
  const existingMatch = await this.findExistingMatch(userId, matchedUserId);
  
  if (existingMatch) {
    // Update existing match
    existingMatch.compatibility = compatibility;
    existingMatch.lastInteraction = new Date();
    return existingMatch.save();
  } else {
    // Create new match
    return this.create({
      userId,
      matchedUserId,
      compatibility,
      status: 'pending',
      matchType: 'suggested'
    });
  }
};

// Pre-save middleware
matchSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Match', matchSchema);