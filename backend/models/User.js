const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  auth0Id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  avatar: {
    type: String,
    default: null
  },
  profile: {
    subjects: [{
      type: String,
      required: true
    }],
    learningStyle: {
      type: Number,
      required: true,
      min: 1,
      max: 4,
      // 1: Visual, 2: Auditory, 3: Kinesthetic, 4: Reading/Writing
    },
    availability: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    }],
    performanceLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    goals: {
      type: String,
      maxlength: 500
    },
    preferences: {
      maxDistance: {
        type: Number,
        default: 50 // km
      },
      ageRange: {
        min: { type: Number, default: 18 },
        max: { type: Number, default: 65 }
      },
      genderPreference: {
        type: String,
        enum: ['any', 'male', 'female', 'other'],
        default: 'any'
      }
    }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    },
    address: {
      type: String,
      default: ''
    }
  },
  stats: {
    totalSessions: {
      type: Number,
      default: 0
    },
    completedSessions: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0
    }
  },
  settings: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    privacy: {
      showEmail: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: true },
      profileVisibility: {
        type: String,
        enum: ['public', 'matches-only', 'private'],
        default: 'public'
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: {
    type: Date,
    default: Date.now
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

// Indexes for better query performance
userSchema.index({ 'profile.subjects': 1 });
userSchema.index({ 'profile.learningStyle': 1 });
userSchema.index({ 'profile.availability': 1 });
userSchema.index({ location: '2dsphere' });
userSchema.index({ isActive: 1, lastActive: -1 });

// Virtual for full name
userSchema.virtual('displayName').get(function() {
  return this.name;
});

// Method to update last active timestamp
userSchema.methods.updateLastActive = function() {
  this.lastActive = new Date();
  return this.save();
};

// Method to calculate compatibility with another user
userSchema.methods.calculateCompatibility = function(otherUser) {
  let score = 0;
  
  // Subject compatibility (40% weight)
  const commonSubjects = this.profile.subjects.filter(s1 => 
    otherUser.profile.subjects.some(s2 => s1.toLowerCase() === s2.toLowerCase())
  ).length;
  score += (commonSubjects / Math.max(this.profile.subjects.length, otherUser.profile.subjects.length)) * 40;
  
  // Learning style compatibility (30% weight)
  const styleMatch = this.profile.learningStyle === otherUser.profile.learningStyle ? 30 : 
                    (Math.abs(this.profile.learningStyle - otherUser.profile.learningStyle) <= 1 ? 15 : 0);
  score += styleMatch;
  
  // Schedule overlap (20% weight)
  const timeOverlap = this.profile.availability.filter(t1 => 
    otherUser.profile.availability.includes(t1)
  ).length;
  score += (timeOverlap / 7) * 20;
  
  // Performance level similarity (10% weight)
  const performanceDiff = Math.abs(this.profile.performanceLevel - otherUser.profile.performanceLevel);
  score += Math.max(0, 10 - performanceDiff * 2);
  
  return Math.min(100, Math.round(score));
};

// Static method to find potential matches
userSchema.statics.findPotentialMatches = async function(userId, limit = 20) {
  const user = await this.findById(userId);
  if (!user) throw new Error('User not found');
  
  const potentialMatches = await this.find({
    _id: { $ne: userId },
    isActive: true,
    'profile.subjects': { $in: user.profile.subjects }
  })
  .limit(limit * 2) // Get more to filter later
  .lean();
  
  // Calculate compatibility scores
  const matchesWithScores = potentialMatches.map(match => ({
    ...match,
    compatibility: user.calculateCompatibility(match)
  }))
  .filter(match => match.compatibility > 50) // Only matches above 50%
  .sort((a, b) => b.compatibility - a.compatibility)
  .slice(0, limit);
  
  return matchesWithScores;
};

// Pre-save middleware to update the updatedAt field
userSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('User', userSchema);