const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['organizer', 'participant'],
      default: 'participant'
    },
    status: {
      type: String,
      enum: ['invited', 'accepted', 'declined', 'attended', 'no-show'],
      default: 'invited'
    },
    joinedAt: Date,
    leftAt: Date
  }],
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  scheduledDate: {
    type: Date,
    required: true,
    index: true
  },
  duration: {
    type: Number, // in minutes
    required: true,
    min: 15,
    max: 480 // 8 hours max
  },
  location: {
    type: {
      type: String,
      enum: ['online', 'in-person'],
      required: true
    },
    details: {
      // For online: meeting link, platform
      // For in-person: address, room number
      platform: String, // Zoom, Google Meet, etc.
      meetingLink: String,
      meetingId: String,
      passcode: String,
      address: String,
      roomNumber: String,
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined
      }
    }
  },
  status: {
    type: String,
    enum: ['scheduled', 'in-progress', 'completed', 'cancelled', 'rescheduled'],
    default: 'scheduled',
    index: true
  },
  sessionType: {
    type: String,
    enum: ['one-on-one', 'group', 'study-group'],
    default: 'one-on-one'
  },
  maxParticipants: {
    type: Number,
    default: 2,
    min: 2,
    max: 10
  },
  actualStartTime: Date,
  actualEndTime: Date,
  notes: {
    beforeSession: String,
    duringSession: String,
    afterSession: String
  },
  materials: [{
    name: String,
    type: {
      type: String,
      enum: ['link', 'file', 'note']
    },
    url: String,
    content: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  feedback: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comment: {
      type: String,
      maxlength: 300
    },
    categories: {
      preparation: { type: Number, min: 1, max: 5 },
      engagement: { type: Number, min: 1, max: 5 },
      helpfulness: { type: Number, min: 1, max: 5 },
      punctuality: { type: Number, min: 1, max: 5 }
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  recurring: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'bi-weekly', 'monthly'],
      default: 'weekly'
    },
    endDate: Date,
    parentSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    }
  },
  reminders: [{
    type: {
      type: String,
      enum: ['email', 'push', 'sms'],
      required: true
    },
    timing: {
      type: Number, // minutes before session
      required: true
    },
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Indexes for efficient queries
sessionSchema.index({ scheduledDate: 1, status: 1 });
sessionSchema.index({ 'participants.userId': 1, status: 1 });
sessionSchema.index({ subject: 1, scheduledDate: 1 });
sessionSchema.index({ createdBy: 1, scheduledDate: -1 });

// Virtual for session duration in hours
sessionSchema.virtual('durationInHours').get(function() {
  return this.duration / 60;
});

// Virtual for actual duration
sessionSchema.virtual('actualDuration').get(function() {
  if (this.actualStartTime && this.actualEndTime) {
    return Math.round((this.actualEndTime - this.actualStartTime) / (1000 * 60)); // in minutes
  }
  return null;
});

// Virtual for average rating
sessionSchema.virtual('averageRating').get(function() {
  if (this.feedback.length === 0) return null;
  
  const totalRating = this.feedback.reduce((sum, fb) => sum + fb.rating, 0);
  return (totalRating / this.feedback.length).toFixed(1);
});

// Method to add participant
sessionSchema.methods.addParticipant = function(userId, role = 'participant') {
  // Check if user is already a participant
  const existingParticipant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (existingParticipant) {
    throw new Error('User is already a participant');
  }
  
  // Check if session is full
  if (this.participants.length >= this.maxParticipants) {
    throw new Error('Session is full');
  }
  
  this.participants.push({
    userId,
    role,
    status: 'invited'
  });
  
  return this.save();
};

// Method to update participant status
sessionSchema.methods.updateParticipantStatus = function(userId, status) {
  const participant = this.participants.find(p => p.userId.toString() === userId.toString());
  if (!participant) {
    throw new Error('Participant not found');
  }
  
  participant.status = status;
  
  if (status === 'attended') {
    participant.joinedAt = new Date();
  }
  
  return this.save();
};

// Method to start session
sessionSchema.methods.startSession = function() {
  this.status = 'in-progress';
  this.actualStartTime = new Date();
  return this.save();
};

// Method to end session
sessionSchema.methods.endSession = function() {
  this.status = 'completed';
  this.actualEndTime = new Date();
  return this.save();
};

// Method to cancel session
sessionSchema.methods.cancelSession = function(reason = '') {
  this.status = 'cancelled';
  if (reason) {
    this.notes.afterSession = `Cancelled: ${reason}`;
  }
  return this.save();
};

// Method to add feedback
sessionSchema.methods.addFeedback = function(userId, rating, comment = '', categories = {}) {
  // Check if user already provided feedback
  const existingFeedback = this.feedback.find(fb => fb.userId.toString() === userId.toString());
  if (existingFeedback) {
    throw new Error('Feedback already provided');
  }
  
  this.feedback.push({
    userId,
    rating,
    comment,
    categories
  });
  
  return this.save();
};

// Static method to find user sessions
sessionSchema.statics.findUserSessions = async function(userId, status = null, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const query = {
    'participants.userId': userId
  };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('participants.userId', 'name email avatar')
    .populate('createdBy', 'name email avatar')
    .sort({ scheduledDate: -1 })
    .skip(skip)
    .limit(limit);
};

// Static method to find upcoming sessions
sessionSchema.statics.findUpcomingSessions = async function(userId, hours = 24) {
  const now = new Date();
  const endTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));
  
  return this.find({
    'participants.userId': userId,
    status: 'scheduled',
    scheduledDate: {
      $gte: now,
      $lte: endTime
    }
  })
  .populate('participants.userId', 'name email avatar')
  .sort({ scheduledDate: 1 });
};

// Pre-save middleware
sessionSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Session', sessionSchema);