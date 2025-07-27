const Joi = require('joi');

// Generic validation middleware
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property]);
    
    if (error) {
      const errorMessage = error.details[0].message;
      return res.status(400).json({ 
        error: 'Validation failed',
        message: errorMessage,
        field: error.details[0].path[0]
      });
    }
    
    next();
  };
};

// User profile validation schema
const profileSchema = Joi.object({
  subjects: Joi.array()
    .items(Joi.string().trim().min(1).max(50))
    .min(1)
    .max(10)
    .required()
    .messages({
      'array.min': 'At least one subject is required',
      'array.max': 'Maximum 10 subjects allowed'
    }),
  
  learningStyle: Joi.number()
    .integer()
    .min(1)
    .max(4)
    .required()
    .messages({
      'number.min': 'Learning style must be between 1 and 4',
      'number.max': 'Learning style must be between 1 and 4'
    }),
  
  availability: Joi.array()
    .items(Joi.string().valid('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'))
    .min(1)
    .max(7)
    .required()
    .messages({
      'array.min': 'At least one day of availability is required'
    }),
  
  performanceLevel: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.min': 'Performance level must be between 1 and 5',
      'number.max': 'Performance level must be between 1 and 5'
    }),
  
  goals: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Goals must be less than 500 characters'
    }),
  
  preferences: Joi.object({
    maxDistance: Joi.number().min(1).max(500).default(50),
    ageRange: Joi.object({
      min: Joi.number().min(18).max(100).default(18),
      max: Joi.number().min(18).max(100).default(65)
    }),
    genderPreference: Joi.string().valid('any', 'male', 'female', 'other').default('any')
  }).optional()
});

// Session creation validation schema
const sessionSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.min': 'Title must be at least 3 characters',
      'string.max': 'Title must be less than 100 characters'
    }),
  
  subject: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.min': 'Subject is required',
      'string.max': 'Subject must be less than 50 characters'
    }),
  
  description: Joi.string()
    .trim()
    .max(500)
    .allow('')
    .messages({
      'string.max': 'Description must be less than 500 characters'
    }),
  
  scheduledDate: Joi.date()
    .iso()
    .min('now')
    .required()
    .messages({
      'date.min': 'Session must be scheduled for a future date'
    }),
  
  duration: Joi.number()
    .integer()
    .min(15)
    .max(480)
    .required()
    .messages({
      'number.min': 'Duration must be at least 15 minutes',
      'number.max': 'Duration cannot exceed 8 hours'
    }),
  
  location: Joi.object({
    type: Joi.string()
      .valid('online', 'in-person')
      .required(),
    
    details: Joi.when('type', {
      is: 'online',
      then: Joi.object({
        platform: Joi.string().valid('zoom', 'google-meet', 'teams', 'other').required(),
        meetingLink: Joi.string().uri().when('platform', {
          is: 'other',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        meetingId: Joi.string().optional(),
        passcode: Joi.string().optional()
      }),
      otherwise: Joi.object({
        address: Joi.string().required(),
        roomNumber: Joi.string().optional(),
        coordinates: Joi.array().items(Joi.number()).length(2).optional()
      })
    }).required()
  }).required(),
  
  sessionType: Joi.string()
    .valid('one-on-one', 'group', 'study-group')
    .default('one-on-one'),
  
  maxParticipants: Joi.number()
    .integer()
    .min(2)
    .max(10)
    .default(2),
  
  participants: Joi.array()
    .items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/))
    .max(9)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid participant ID format'
    }),
  
  recurring: Joi.object({
    isRecurring: Joi.boolean().default(false),
    frequency: Joi.string().valid('daily', 'weekly', 'bi-weekly', 'monthly').when('isRecurring', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    endDate: Joi.date().iso().min(Joi.ref('scheduledDate')).when('isRecurring', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  }).optional()
});

// Message validation schema
const messageSchema = Joi.object({
  message: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message must be less than 1000 characters'
    }),
  
  type: Joi.string()
    .valid('text', 'image', 'file', 'location')
    .default('text'),
  
  metadata: Joi.object().optional()
});

// Rating/Feedback validation schema
const feedbackSchema = Joi.object({
  rating: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required()
    .messages({
      'number.min': 'Rating must be between 1 and 5',
      'number.max': 'Rating must be between 1 and 5'
    }),
  
  comment: Joi.string()
    .trim()
    .max(300)
    .allow('')
    .messages({
      'string.max': 'Comment must be less than 300 characters'
    }),
  
  categories: Joi.object({
    preparation: Joi.number().integer().min(1).max(5).optional(),
    engagement: Joi.number().integer().min(1).max(5).optional(),
    helpfulness: Joi.number().integer().min(1).max(5).optional(),
    punctuality: Joi.number().integer().min(1).max(5).optional()
  }).optional()
});

// Query parameter validation schemas
const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
});

const matchQuerySchema = paginationSchema.keys({
  status: Joi.string()
    .valid('pending', 'active', 'blocked', 'declined')
    .default('active'),
  
  minCompatibility: Joi.number()
    .min(0)
    .max(100)
    .default(0),
  
  subjects: Joi.array()
    .items(Joi.string())
    .optional()
});

const sessionQuerySchema = paginationSchema.keys({
  status: Joi.string()
    .valid('scheduled', 'in-progress', 'completed', 'cancelled', 'rescheduled')
    .optional(),
  
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  
  subject: Joi.string().optional(),
  
  type: Joi.string()
    .valid('one-on-one', 'group', 'study-group')
    .optional()
});

// MongoDB ObjectId validation
const objectIdSchema = Joi.object({
  id: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid ID format'
    })
});

// Custom validation functions
const validateObjectId = (req, res, next) => {
  const { error } = objectIdSchema.validate({ id: req.params.id });
  
  if (error) {
    return res.status(400).json({ 
      error: 'Invalid ID format',
      message: 'The provided ID is not a valid MongoDB ObjectId'
    });
  }
  
  next();
};

// Email validation
const validateEmail = (email) => {
  const emailSchema = Joi.string().email().required();
  return emailSchema.validate(email);
};

// Password validation (if implementing custom auth)
const validatePassword = (password) => {
  const passwordSchema = Joi.string()
    .min(8)
    .max(128)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])'))
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must be less than 128 characters long',
      'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character'
    });
  
  return passwordSchema.validate(password);
};

module.exports = {
  validate,
  validateObjectId,
  validateEmail,
  validatePassword,
  schemas: {
    profile: profileSchema,
    session: sessionSchema,
    message: messageSchema,
    feedback: feedbackSchema,
    pagination: paginationSchema,
    matchQuery: matchQuerySchema,
    sessionQuery: sessionQuerySchema,
    objectId: objectIdSchema
  }
};