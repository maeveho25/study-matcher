const express = require('express');
const Session = require('../models/Session');
const User = require('../models/User');
const Match = require('../models/Match');
const { authenticate, requireProfile, userRateLimit, checkResourceAccess } = require('../middleware/auth');
const { validate, validateObjectId, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting
router.use(userRateLimit(200, 15 * 60 * 1000));

// Get user's sessions
router.get('/', authenticate, requireProfile, validate(schemas.sessionQuery, 'query'), async (req, res) => {
  try {
    const {
      status,
      startDate,
      endDate,
      subject,
      type,
      page = 1,
      limit = 20
    } = req.query;
    
    const currentUser = req.user;
    const skip = (page - 1) * limit;
    
    // Build query
    const query = {
      'participants.userId': currentUser._id
    };
    
    if (status) {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.scheduledDate = {};
      if (startDate) {
        query.scheduledDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.scheduledDate.$lte = new Date(endDate);
      }
    }
    
    if (subject) {
      query.subject = { $regex: subject, $options: 'i' };
    }
    
    if (type) {
      query.sessionType = type;
    }
    
    const sessions = await Session.find(query)
      .populate('participants.userId', 'name email avatar profile')
      .populate('createdBy', 'name email avatar')
      .populate('feedback.userId', 'name avatar')
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Session.countDocuments(query);
    
    // Format sessions for response
    const formattedSessions = sessions.map(session => {
      const userParticipant = session.participants.find(p => 
        p.userId._id.toString() === currentUser._id.toString()
      );
      
      return {
        id: session._id,
        title: session.title,
        subject: session.subject,
        description: session.description,
        scheduledDate: session.scheduledDate,
        duration: session.duration,
        durationInHours: session.durationInHours,
        location: session.location,
        status: session.status,
        sessionType: session.sessionType,
        maxParticipants: session.maxParticipants,
        actualStartTime: session.actualStartTime,
        actualEndTime: session.actualEndTime,
        actualDuration: session.actualDuration,
        participants: session.participants.map(p => ({
          user: {
            id: p.userId._id,
            name: p.userId.name,
            email: p.userId.email,
            avatar: p.userId.avatar
          },
          role: p.role,
          status: p.status,
          joinedAt: p.joinedAt,
          leftAt: p.leftAt
        })),
        userRole: userParticipant?.role,
        userStatus: userParticipant?.status,
        createdBy: {
          id: session.createdBy._id,
          name: session.createdBy.name,
          avatar: session.createdBy.avatar
        },
        isOrganizer: session.createdBy._id.toString() === currentUser._id.toString(),
        materials: session.materials,
        averageRating: session.averageRating,
        feedbackCount: session.feedback.length,
        recurring: session.recurring,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      };
    });
    
    res.json({
      sessions: formattedSessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ 
      error: 'Failed to get sessions',
      message: error.message
    });
  }
});

// Create new session
router.post('/', authenticate, requireProfile, validate(schemas.session), async (req, res) => {
  try {
    const currentUser = req.user;
    const sessionData = req.body;
    
    // Create session
    const session = new Session({
      title: sessionData.title,
      subject: sessionData.subject,
      description: sessionData.description,
      scheduledDate: new Date(sessionData.scheduledDate),
      duration: sessionData.duration,
      location: sessionData.location,
      sessionType: sessionData.sessionType || 'one-on-one',
      maxParticipants: sessionData.maxParticipants || 2,
      recurring: sessionData.recurring,
      createdBy: currentUser._id,
      participants: [{
        userId: currentUser._id,
        role: 'organizer',
        status: 'accepted'
      }]
    });
    
    // Add additional participants if provided
    if (sessionData.participants && sessionData.participants.length > 0) {
      for (const participantId of sessionData.participants) {
        // Verify participant exists and is not already added
        const participant = await User.findById(participantId);
        if (!participant) {
          return res.status(400).json({ 
            error: `Participant with ID ${participantId} not found` 
          });
        }
        
        // Check if users are matched (optional business rule)
        const match = await Match.findExistingMatch(currentUser._id, participantId);
        if (!match || match.status !== 'active') {
          return res.status(400).json({ 
            error: `You must be matched with user ${participant.name} to invite them` 
          });
        }
        
        session.participants.push({
          userId: participantId,
          role: 'participant',
          status: 'invited'
        });
      }
    }
    
    await session.save();
    
    // Populate the created session
    const populatedSession = await Session.findById(session._id)
      .populate('participants.userId', 'name email avatar')
      .populate('createdBy', 'name email avatar');
    
    // Update user stats
    currentUser.stats.totalSessions += 1;
    await currentUser.save();
    
    res.status(201).json({
      id: populatedSession._id,
      title: populatedSession.title,
      subject: populatedSession.subject,
      description: populatedSession.description,
      scheduledDate: populatedSession.scheduledDate,
      duration: populatedSession.duration,
      location: populatedSession.location,
      status: populatedSession.status,
      sessionType: populatedSession.sessionType,
      participants: populatedSession.participants.map(p => ({
        user: {
          id: p.userId._id,
          name: p.userId.name,
          email: p.userId.email,
          avatar: p.userId.avatar
        },
        role: p.role,
        status: p.status
      })),
      createdBy: {
        id: populatedSession.createdBy._id,
        name: populatedSession.createdBy.name,
        avatar: populatedSession.createdBy.avatar
      },
      createdAt: populatedSession.createdAt,
      message: 'Session created successfully'
    });
    
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ 
      error: 'Failed to create session',
      message: error.message
    });
  }
});

// Get specific session
router.get('/:id', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource; // Set by checkResourceAccess middleware
    const currentUser = req.user;
    
    const populatedSession = await Session.findById(session._id)
      .populate('participants.userId', 'name email avatar profile stats')
      .populate('createdBy', 'name email avatar')
      .populate('feedback.userId', 'name avatar')
      .populate('materials.uploadedBy', 'name avatar');
    
    const userParticipant = populatedSession.participants.find(p => 
      p.userId._id.toString() === currentUser._id.toString()
    );
    
    res.json({
      id: populatedSession._id,
      title: populatedSession.title,
      subject: populatedSession.subject,
      description: populatedSession.description,
      scheduledDate: populatedSession.scheduledDate,
      duration: populatedSession.duration,
      durationInHours: populatedSession.durationInHours,
      location: populatedSession.location,
      status: populatedSession.status,
      sessionType: populatedSession.sessionType,
      maxParticipants: populatedSession.maxParticipants,
      actualStartTime: populatedSession.actualStartTime,
      actualEndTime: populatedSession.actualEndTime,
      actualDuration: populatedSession.actualDuration,
      participants: populatedSession.participants.map(p => ({
        user: {
          id: p.userId._id,
          name: p.userId.name,
          email: p.userId.email,
          avatar: p.userId.avatar,
          profile: p.userId.profile,
          stats: p.userId.stats
        },
        role: p.role,
        status: p.status,
        joinedAt: p.joinedAt,
        leftAt: p.leftAt
      })),
      userRole: userParticipant?.role,
      userStatus: userParticipant?.status,
      createdBy: {
        id: populatedSession.createdBy._id,
        name: populatedSession.createdBy.name,
        avatar: populatedSession.createdBy.avatar
      },
      isOrganizer: populatedSession.createdBy._id.toString() === currentUser._id.toString(),
      notes: populatedSession.notes,
      materials: populatedSession.materials.map(m => ({
        name: m.name,
        type: m.type,
        url: m.url,
        content: m.content,
        uploadedBy: {
          id: m.uploadedBy._id,
          name: m.uploadedBy.name,
          avatar: m.uploadedBy.avatar
        },
        uploadedAt: m.uploadedAt
      })),
      feedback: populatedSession.feedback.map(f => ({
        user: {
          id: f.userId._id,
          name: f.userId.name,
          avatar: f.userId.avatar
        },
        rating: f.rating,
        comment: f.comment,
        categories: f.categories,
        submittedAt: f.submittedAt
      })),
      averageRating: populatedSession.averageRating,
      recurring: populatedSession.recurring,
      reminders: populatedSession.reminders,
      createdAt: populatedSession.createdAt,
      updatedAt: populatedSession.updatedAt
    });
    
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ 
      error: 'Failed to get session',
      message: error.message
    });
  }
});

// Update session
router.patch('/:id', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    const updates = req.body;
    
    // Check if user is organizer
    if (session.createdBy.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Only the organizer can update the session' });
    }
    
    // Check if session can be updated (not completed or cancelled)
    if (['completed', 'cancelled'].includes(session.status)) {
      return res.status(400).json({ error: 'Cannot update completed or cancelled session' });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'subject', 'description', 'scheduledDate', 'duration', 'location', 'maxParticipants'];
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'scheduledDate') {
          session[field] = new Date(updates[field]);
        } else {
          session[field] = updates[field];
        }
      }
    });
    
    await session.save();
    
    const populatedSession = await Session.findById(session._id)
      .populate('participants.userId', 'name email avatar')
      .populate('createdBy', 'name email avatar');
    
    res.json({
      id: populatedSession._id,
      title: populatedSession.title,
      subject: populatedSession.subject,
      scheduledDate: populatedSession.scheduledDate,
      duration: populatedSession.duration,
      location: populatedSession.location,
      participants: populatedSession.participants.map(p => ({
        user: {
          id: p.userId._id,
          name: p.userId.name,
          avatar: p.userId.avatar
        },
        role: p.role,
        status: p.status
      })),
      updatedAt: populatedSession.updatedAt,
      message: 'Session updated successfully'
    });
    
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ 
      error: 'Failed to update session',
      message: error.message
    });
  }
});

// Join session
router.post('/:id/join', authenticate, validateObjectId, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    
    const session = await Session.findById(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Check if session is full
    if (session.participants.length >= session.maxParticipants) {
      return res.status(400).json({ error: 'Session is full' });
    }
    
    // Check if user is already a participant
    const existingParticipant = session.participants.find(p => 
      p.userId.toString() === currentUser._id.toString()
    );
    
    if (existingParticipant) {
      return res.status(400).json({ error: 'You are already a participant' });
    }
    
    // Add user as participant
    await session.addParticipant(currentUser._id, 'participant');
    
    const populatedSession = await Session.findById(session._id)
      .populate('participants.userId', 'name email avatar');
    
    res.json({
      id: populatedSession._id,
      participants: populatedSession.participants.map(p => ({
        user: {
          id: p.userId._id,
          name: p.userId.name,
          avatar: p.userId.avatar
        },
        role: p.role,
        status: p.status
      })),
      message: 'Successfully joined the session'
    });
    
  } catch (error) {
    console.error('Join session error:', error);
    
    if (error.message === 'Session is full' || error.message === 'User is already a participant') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to join session',
      message: error.message
    });
  }
});

// Leave session
router.post('/:id/leave', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    
    // Check if user is a participant
    const participantIndex = session.participants.findIndex(p => 
      p.userId.toString() === currentUser._id.toString()
    );
    
    if (participantIndex === -1) {
      return res.status(400).json({ error: 'You are not a participant in this session' });
    }
    
    // Prevent organizer from leaving their own session
    if (session.createdBy.toString() === currentUser._id.toString()) {
      return res.status(400).json({ error: 'Organizer cannot leave their own session. Cancel the session instead.' });
    }
    
    // Remove participant
    session.participants.splice(participantIndex, 1);
    await session.save();
    
    res.json({
      message: 'Successfully left the session'
    });
    
  } catch (error) {
    console.error('Leave session error:', error);
    res.status(500).json({ 
      error: 'Failed to leave session',
      message: error.message
    });
  }
});

// Update participant status
router.patch('/:id/participants/:participantId', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const { participantId } = req.params;
    const { status } = req.body;
    const session = req.resource;
    const currentUser = req.user;
    
    // Validate status
    const validStatuses = ['invited', 'accepted', 'declined', 'attended', 'no-show'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Check if user can update this participant's status
    const isOrganizer = session.createdBy.toString() === currentUser._id.toString();
    const isSelf = participantId === currentUser._id.toString();
    
    if (!isOrganizer && !isSelf) {
      return res.status(403).json({ error: 'Cannot update other participants status' });
    }
    
    // Update participant status
    await session.updateParticipantStatus(participantId, status);
    
    res.json({
      message: 'Participant status updated successfully',
      status: status
    });
    
  } catch (error) {
    console.error('Update participant status error:', error);
    
    if (error.message === 'Participant not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to update participant status',
      message: error.message
    });
  }
});

// Start session
router.post('/:id/start', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    
    // Check if user is organizer
    if (session.createdBy.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Only the organizer can start the session' });
    }
    
    // Check if session can be started
    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Session cannot be started' });
    }
    
    await session.startSession();
    
    res.json({
      id: session._id,
      status: session.status,
      actualStartTime: session.actualStartTime,
      message: 'Session started successfully'
    });
    
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ 
      error: 'Failed to start session',
      message: error.message
    });
  }
});

// End session
router.post('/:id/end', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    
    // Check if user is organizer
    if (session.createdBy.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Only the organizer can end the session' });
    }
    
    // Check if session can be ended
    if (session.status !== 'in-progress') {
      return res.status(400).json({ error: 'Session is not in progress' });
    }
    
    await session.endSession();
    
    // Update participant stats
    for (const participant of session.participants) {
      if (participant.status === 'attended') {
        const user = await User.findById(participant.userId);
        if (user) {
          user.stats.completedSessions += 1;
          await user.save();
        }
      }
    }
    
    res.json({
      id: session._id,
      status: session.status,
      actualEndTime: session.actualEndTime,
      actualDuration: session.actualDuration,
      message: 'Session ended successfully'
    });
    
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ 
      error: 'Failed to end session',
      message: error.message
    });
  }
});

// Cancel session
router.post('/:id/cancel', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    const { reason } = req.body;
    
    // Check if user is organizer
    if (session.createdBy.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Only the organizer can cancel the session' });
    }
    
    // Check if session can be cancelled
    if (['completed', 'cancelled'].includes(session.status)) {
      return res.status(400).json({ error: 'Session cannot be cancelled' });
    }
    
    await session.cancelSession(reason);
    
    res.json({
      id: session._id,
      status: session.status,
      message: 'Session cancelled successfully'
    });
    
  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel session',
      message: error.message
    });
  }
});

// Add session feedback
router.post('/:id/feedback', authenticate, validateObjectId, checkResourceAccess('session'), validate(schemas.feedback), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    const { rating, comment, categories } = req.body;
    
    // Check if session is completed
    if (session.status !== 'completed') {
      return res.status(400).json({ error: 'Can only provide feedback for completed sessions' });
    }
    
    // Check if user was a participant
    const participant = session.participants.find(p => 
      p.userId.toString() === currentUser._id.toString()
    );
    
    if (!participant || participant.status !== 'attended') {
      return res.status(400).json({ error: 'Only participants who attended can provide feedback' });
    }
    
    await session.addFeedback(currentUser._id, rating, comment, categories);
    
    res.json({
      message: 'Feedback submitted successfully',
      averageRating: session.averageRating
    });
    
  } catch (error) {
    console.error('Add feedback error:', error);
    
    if (error.message === 'Feedback already provided') {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ 
      error: 'Failed to submit feedback',
      message: error.message
    });
  }
});

// Get upcoming sessions
router.get('/upcoming/list', authenticate, requireProfile, async (req, res) => {
  try {
    const currentUser = req.user;
    const { hours = 24 } = req.query;
    
    const upcomingSessions = await Session.findUpcomingSessions(currentUser._id, parseInt(hours));
    
    const formattedSessions = upcomingSessions.map(session => ({
      id: session._id,
      title: session.title,
      subject: session.subject,
      scheduledDate: session.scheduledDate,
      duration: session.duration,
      location: session.location,
      participants: session.participants.map(p => ({
        user: {
          id: p.userId._id,
          name: p.userId.name,
          avatar: p.userId.avatar
        },
        role: p.role,
        status: p.status
      })),
      timeUntilSession: Math.round((new Date(session.scheduledDate) - new Date()) / (1000 * 60)) // minutes
    }));
    
    res.json({
      sessions: formattedSessions,
      count: formattedSessions.length
    });
    
  } catch (error) {
    console.error('Get upcoming sessions error:', error);
    res.status(500).json({ 
      error: 'Failed to get upcoming sessions',
      message: error.message
    });
  }
});

// Delete session
router.delete('/:id', authenticate, validateObjectId, checkResourceAccess('session'), async (req, res) => {
  try {
    const session = req.resource;
    const currentUser = req.user;
    
    // Check if user is organizer
    if (session.createdBy.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Only the organizer can delete the session' });
    }
    
    // Check if session can be deleted (only scheduled sessions)
    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Can only delete scheduled sessions' });
    }
    
    await Session.findByIdAndDelete(session._id);
    
    res.json({
      message: 'Session deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ 
      error: 'Failed to delete session',
      message: error.message
    });
  }
});

module.exports = router;