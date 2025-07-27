const express = require('express');
const mongoose = require('mongoose');
const Match = require('../models/Match');
const User = require('../models/User');
const { authenticate, requireProfile, userRateLimit } = require('../middleware/auth');
const { validate, validateObjectId, schemas } = require('../middleware/validation');

const router = express.Router();

// Apply rate limiting
router.use(userRateLimit(300, 15 * 60 * 1000)); // Higher limit for messaging

// Message Model (inline for simplicity, could be separate file)
const MessageSchema = new mongoose.Schema({
  chatId: {
    type: String,
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'location', 'session-invite'],
    default: 'text'
  },
  metadata: {
    fileName: String,
    fileSize: Number,
    fileType: String,
    imageUrl: String,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session'
    }
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  editedAt: Date,
  isEdited: {
    type: Boolean,
    default: false
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ senderId: 1, receiverId: 1 });
MessageSchema.index({ status: 1, receiverId: 1 });

const Message = mongoose.model('Message', MessageSchema);

// Chat Model (inline)
const ChatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  chatType: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  unreadCounts: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create unique chat ID for participants
ChatSchema.index({ participants: 1 }, { unique: true });
ChatSchema.index({ lastActivity: -1 });

const Chat = mongoose.model('Chat', ChatSchema);

// Helper function to generate chat ID
const generateChatId = (userId1, userId2) => {
  const sortedIds = [userId1, userId2].sort();
  return `${sortedIds[0]}_${sortedIds[1]}`;
};

// Helper function to find or create chat
const findOrCreateChat = async (userId1, userId2) => {
  const participants = [userId1, userId2].sort();
  
  let chat = await Chat.findOne({ participants });
  
  if (!chat) {
    chat = new Chat({
      participants,
      unreadCounts: [
        { userId: userId1, count: 0 },
        { userId: userId2, count: 0 }
      ]
    });
    await chat.save();
  }
  
  return chat;
};

// Get user's chat list
router.get('/chats', authenticate, requireProfile, async (req, res) => {
  try {
    const currentUser = req.user;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const chats = await Chat.find({
      participants: currentUser._id,
      isActive: true
    })
    .populate('participants', 'name email avatar lastActive')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    const formattedChats = await Promise.all(chats.map(async (chat) => {
      // Get the other participant (for direct chats)
      const otherParticipant = chat.participants.find(p => 
        p._id.toString() !== currentUser._id.toString()
      );
      
      // Get unread count for current user
      const unreadCount = chat.unreadCounts.find(uc => 
        uc.userId.toString() === currentUser._id.toString()
      )?.count || 0;
      
      // Check if users are still matched (business rule)
      let canMessage = true;
      if (otherParticipant) {
        const match = await Match.findExistingMatch(currentUser._id, otherParticipant._id);
        canMessage = match && match.status === 'active';
      }
      
      return {
        id: chat._id,
        chatType: chat.chatType,
        participants: chat.participants.map(p => ({
          id: p._id,
          name: p.name,
          email: p.email,
          avatar: p.avatar,
          lastActive: p.lastActive,
          isOnline: p.lastActive && (Date.now() - new Date(p.lastActive).getTime()) < 5 * 60 * 1000 // 5 minutes
        })),
        buddy: otherParticipant ? {
          id: otherParticipant._id,
          name: otherParticipant.name,
          avatar: otherParticipant.avatar,
          lastActive: otherParticipant.lastActive,
          isOnline: otherParticipant.lastActive && (Date.now() - new Date(otherParticipant.lastActive).getTime()) < 5 * 60 * 1000
        } : null,
        lastMessage: chat.lastMessage ? {
          id: chat.lastMessage._id,
          message: chat.lastMessage.message,
          senderId: chat.lastMessage.senderId,
          createdAt: chat.lastMessage.createdAt,
          messageType: chat.lastMessage.messageType
        } : null,
        unreadCount,
        lastActivity: chat.lastActivity,
        canMessage,
        createdAt: chat.createdAt
      };
    }));
    
    const total = await Chat.countDocuments({
      participants: currentUser._id,
      isActive: true
    });
    
    res.json({
      chats: formattedChats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ 
      error: 'Failed to get chats',
      message: error.message
    });
  }
});

// Get messages for a specific chat
router.get('/:chatId', authenticate, validateObjectId, async (req, res) => {
  try {
    const { chatId } = req.params;
    const currentUser = req.user;
    const { page = 1, limit = 50, before } = req.query;
    const skip = (page - 1) * limit;
    
    // Verify user is participant in this chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const isParticipant = chat.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied to this chat' });
    }
    
    // Build query
    const query = { chatId: chatId };
    
    // If 'before' timestamp provided, get messages before that time
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }
    
    const messages = await Message.find(query)
      .populate('senderId', 'name avatar')
      .populate('replyTo')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Mark messages as read
    await Message.updateMany({
      chatId: chatId,
      receiverId: currentUser._id,
      status: { $ne: 'read' }
    }, {
      status: 'read'
    });
    
    // Update unread count in chat
    await Chat.findByIdAndUpdate(chatId, {
      $set: {
        'unreadCounts.$[elem].count': 0
      }
    }, {
      arrayFilters: [{ 'elem.userId': currentUser._id }]
    });
    
    const formattedMessages = messages.reverse().map(message => ({
      id: message._id,
      message: message.message,
      messageType: message.messageType,
      metadata: message.metadata,
      sender: {
        id: message.senderId._id,
        name: message.senderId.name,
        avatar: message.senderId.avatar
      },
      isMine: message.senderId._id.toString() === currentUser._id.toString(),
      status: message.status,
      isEdited: message.isEdited,
      editedAt: message.editedAt,
      replyTo: message.replyTo ? {
        id: message.replyTo._id,
        message: message.replyTo.message,
        senderId: message.replyTo.senderId
      } : null,
      createdAt: message.createdAt
    }));
    
    const total = await Message.countDocuments({ chatId: chatId });
    
    res.json({
      messages: formattedMessages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        hasMore: skip + messages.length < total
      }
    });
    
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ 
      error: 'Failed to get messages',
      message: error.message
    });
  }
});

// Send a message
router.post('/:chatId', authenticate, validateObjectId, validate(schemas.message), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { message, messageType = 'text', metadata, replyTo } = req.body;
    const currentUser = req.user;
    
    // Verify chat exists and user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const isParticipant = chat.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied to this chat' });
    }
    
    // Get the receiver (other participant)
    const receiverId = chat.participants.find(p => 
      p.toString() !== currentUser._id.toString()
    );
    
    // Check if users are still matched
    const match = await Match.findExistingMatch(currentUser._id, receiverId);
    if (!match || match.status !== 'active') {
      return res.status(403).json({ error: 'You can only message active matches' });
    }
    
    // Create message
    const newMessage = new Message({
      chatId: chatId,
      senderId: currentUser._id,
      receiverId: receiverId,
      message: message.trim(),
      messageType,
      metadata,
      replyTo: replyTo || undefined
    });
    
    await newMessage.save();
    
    // Update chat's last message and activity
    chat.lastMessage = newMessage._id;
    chat.lastActivity = new Date();
    
    // Increment unread count for receiver
    const receiverUnread = chat.unreadCounts.find(uc => 
      uc.userId.toString() === receiverId.toString()
    );
    if (receiverUnread) {
      receiverUnread.count += 1;
    }
    
    await chat.save();
    
    // Update match interaction
    await match.addInteraction('message', { 
      messageId: newMessage._id,
      messageType,
      length: message.length
    });
    
    // Populate the message for response
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('senderId', 'name avatar');
    
    // Emit real-time message via Socket.IO (if available)
    const io = req.app.get('io');
    if (io) {
      io.to(chatId).emit('new-message', {
        id: populatedMessage._id,
        message: populatedMessage.message,
        messageType: populatedMessage.messageType,
        metadata: populatedMessage.metadata,
        sender: {
          id: populatedMessage.senderId._id,
          name: populatedMessage.senderId.name,
          avatar: populatedMessage.senderId.avatar
        },
        chatId: chatId,
        createdAt: populatedMessage.createdAt
      });
    }
    
    res.status(201).json({
      id: populatedMessage._id,
      message: populatedMessage.message,
      messageType: populatedMessage.messageType,
      metadata: populatedMessage.metadata,
      sender: {
        id: populatedMessage.senderId._id,
        name: populatedMessage.senderId.name,
        avatar: populatedMessage.senderId.avatar
      },
      status: populatedMessage.status,
      createdAt: populatedMessage.createdAt,
      chatId: chatId
    });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ 
      error: 'Failed to send message',
      message: error.message
    });
  }
});

// Start chat with a user
router.post('/start/:userId', authenticate, validateObjectId, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = req.user;
    
    if (userId === currentUser._id.toString()) {
      return res.status(400).json({ error: 'Cannot start chat with yourself' });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if users are matched
    const match = await Match.findExistingMatch(currentUser._id, userId);
    if (!match || match.status !== 'active') {
      return res.status(403).json({ error: 'You can only message users you are matched with' });
    }
    
    // Find or create chat
    const chat = await findOrCreateChat(currentUser._id, userId);
    
    res.json({
      id: chat._id,
      chatType: chat.chatType,
      buddy: {
        id: targetUser._id,
        name: targetUser.name,
        avatar: targetUser.avatar,
        lastActive: targetUser.lastActive
      },
      canMessage: true,
      createdAt: chat.createdAt,
      message: 'Chat ready'
    });
    
  } catch (error) {
    console.error('Start chat error:', error);
    res.status(500).json({ 
      error: 'Failed to start chat',
      message: error.message
    });
  }
});

// Edit a message
router.patch('/message/:messageId', authenticate, validateObjectId, async (req, res) => {
  try {
    const { messageId } = req.params;
    const { message } = req.body;
    const currentUser = req.user;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    
    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message is too long' });
    }
    
    const existingMessage = await Message.findById(messageId);
    if (!existingMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user owns the message
    if (existingMessage.senderId.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Can only edit your own messages' });
    }
    
    // Check if message is not too old (e.g., 24 hours)
    const messageAge = Date.now() - new Date(existingMessage.createdAt).getTime();
    const maxEditAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (messageAge > maxEditAge) {
      return res.status(400).json({ error: 'Cannot edit messages older than 24 hours' });
    }
    
    // Update message
    existingMessage.message = message.trim();
    existingMessage.isEdited = true;
    existingMessage.editedAt = new Date();
    
    await existingMessage.save();
    
    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(existingMessage.chatId).emit('message-edited', {
        id: existingMessage._id,
        message: existingMessage.message,
        isEdited: true,
        editedAt: existingMessage.editedAt
      });
    }
    
    res.json({
      id: existingMessage._id,
      message: existingMessage.message,
      isEdited: existingMessage.isEdited,
      editedAt: existingMessage.editedAt,
      message: 'Message updated successfully'
    });
    
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ 
      error: 'Failed to edit message',
      message: error.message
    });
  }
});

// Delete a message
router.delete('/message/:messageId', authenticate, validateObjectId, async (req, res) => {
  try {
    const { messageId } = req.params;
    const currentUser = req.user;
    
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user owns the message
    if (message.senderId.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }
    
    // Delete the message
    await Message.findByIdAndDelete(messageId);
    
    // Update chat's last message if this was the last message
    const chat = await Chat.findById(message.chatId);
    if (chat && chat.lastMessage && chat.lastMessage.toString() === messageId) {
      const lastMessage = await Message.findOne({ chatId: message.chatId })
        .sort({ createdAt: -1 });
      
      chat.lastMessage = lastMessage ? lastMessage._id : null;
      await chat.save();
    }
    
    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(message.chatId).emit('message-deleted', {
        id: messageId,
        chatId: message.chatId
      });
    }
    
    res.json({
      message: 'Message deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ 
      error: 'Failed to delete message',
      message: error.message
    });
  }
});

// Mark messages as read
router.patch('/:chatId/read', authenticate, validateObjectId, async (req, res) => {
  try {
    const { chatId } = req.params;
    const currentUser = req.user;
    
    // Verify user is participant
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const isParticipant = chat.participants.some(p => 
      p.toString() === currentUser._id.toString()
    );
    
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied to this chat' });
    }
    
    // Mark messages as read
    const result = await Message.updateMany({
      chatId: chatId,
      receiverId: currentUser._id,
      status: { $ne: 'read' }
    }, {
      status: 'read'
    });
    
    // Update unread count
    await Chat.findByIdAndUpdate(chatId, {
      $set: {
        'unreadCounts.$[elem].count': 0
      }
    }, {
      arrayFilters: [{ 'elem.userId': currentUser._id }]
    });
    
    res.json({
      messagesMarkedAsRead: result.modifiedCount,
      message: 'Messages marked as read'
    });
    
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ 
      error: 'Failed to mark messages as read',
      message: error.message
    });
  }
});

// Get message statistics
router.get('/stats/summary', authenticate, async (req, res) => {
  try {
    const currentUser = req.user;
    
    const [totalChats, totalMessages, unreadMessages] = await Promise.all([
      Chat.countDocuments({
        participants: currentUser._id,
        isActive: true
      }),
      Message.countDocuments({
        $or: [
          { senderId: currentUser._id },
          { receiverId: currentUser._id }
        ]
      }),
      Message.countDocuments({
        receiverId: currentUser._id,
        status: { $ne: 'read' }
      })
    ]);
    
    // Get most active chat
    const mostActiveChat = await Chat.findOne({
      participants: currentUser._id,
      isActive: true
    })
    .populate('participants', 'name avatar')
    .sort({ lastActivity: -1 });
    
    res.json({
      totalChats,
      totalMessages,
      unreadMessages,
      mostActiveChat: mostActiveChat ? {
        id: mostActiveChat._id,
        buddy: mostActiveChat.participants.find(p => 
          p._id.toString() !== currentUser._id.toString()
        ),
        lastActivity: mostActiveChat.lastActivity
      } : null
    });
    
  } catch (error) {
    console.error('Get message stats error:', error);
    res.status(500).json({ 
      error: 'Failed to get message statistics',
      message: error.message
    });
  }
});

module.exports = router;