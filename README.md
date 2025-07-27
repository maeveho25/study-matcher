# StudyBuddy Matcher

A full-stack web application that uses AI-powered matching to connect students with compatible study partners. Built with React frontend and Node.js/Express backend, featuring Auth0 authentication, real-time messaging, and intelligent compatibility scoring.

## 🚀 Features

- **AI-Powered Matching**: Intelligent compatibility algorithm based on subjects, learning styles, availability, and performance levels
- **Secure Authentication**: Auth0 integration with JWT token management
- **Real-time Messaging**: Socket.IO powered chat system between matched users
- **Study Session Management**: Create, join, and manage study sessions with calendar integration
- **Profile Management**: Comprehensive user profiles with preferences and goals
- **Responsive Design**: Modern UI built with React and Tailwind CSS
- **Rate Limiting & Security**: Helmet security headers and express-rate-limit protection

## 🛠 Tech Stack

### Backend
- **Node.js** with Express.js framework
- **MongoDB** with Mongoose ODM
- **Auth0** for authentication and user management
- **Socket.IO** for real-time messaging
- **Joi** for request validation
- **Helmet** for security headers
- **Express Rate Limit** for API protection

### Frontend
- **React** with functional components and hooks
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Auth0 React SDK** for authentication
- **Socket.IO Client** for real-time features

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (v4.4 or higher)
- Auth0 account (for authentication)
- npm or yarn package manager

## 🔧 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/studybuddy-matcher.git
cd studybuddy-matcher
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/studybuddy

# Auth0 Configuration
AUTH0_DOMAIN=your-auth0-domain.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_AUDIENCE=your-api-identifier

# Application
PORT=5001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# JWT Secret (fallback)
JWT_SECRET=your-super-secret-jwt-key
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

Create a `.env` file in the frontend directory:

```env
# Auth0 Configuration
REACT_APP_AUTH0_DOMAIN=your-auth0-domain.auth0.com
REACT_APP_AUTH0_CLIENT_ID=your-client-id

# API Configuration
REACT_APP_API_URL=http://localhost:5001/api
```

### 4. Auth0 Configuration

1. Create an Auth0 account at [auth0.com](https://auth0.com)
2. Create a new Single Page Application
3. Configure the following settings:
   - **Allowed Callback URLs**: `http://localhost:3000`
   - **Allowed Logout URLs**: `http://localhost:3000`
   - **Allowed Web Origins**: `http://localhost:3000`
   - **Allowed Origins (CORS)**: `http://localhost:3000`

4. Create an API in Auth0:
   - **Name**: StudyBuddy API
   - **Identifier**: `https://studybuddy-api.example.com`
   - Enable RBAC and Add Permissions in Access Token

### 5. Database Setup

Ensure MongoDB is running on your system:

```bash
# Using MongoDB service
sudo systemctl start mongod

# Or using MongoDB directly
mongod
```

The application will automatically create the database and collections on first run.

## 🚀 Running the Application

### Development Mode

1. **Start the Backend**:
```bash
cd backend
npm run dev
```
The backend server will start on `http://localhost:5001`

2. **Start the Frontend**:
```bash
cd frontend
npm start
```
The frontend will start on `http://localhost:3000`

### Production Mode

1. **Build the Frontend**:
```bash
cd frontend
npm run build
```

2. **Start the Backend**:
```bash
cd backend
npm start
```

## 📁 Project Structure

```
studybuddy-matcher/
├── backend/
│   ├── middleware/
│   │   ├── auth.js           # Authentication middleware
│   │   └── validation.js     # Request validation
│   ├── models/
│   │   ├── User.js          # User schema and methods
│   │   ├── Match.js         # Match schema and compatibility logic
│   │   ├── Session.js       # Study session schema
│   │   └── Message.js       # Message schema (in routes/messages.js)
│   ├── routes/
│   │   ├── auth.js          # Authentication routes
│   │   ├── users.js         # User management routes
│   │   ├── matches.js       # Matching system routes
│   │   ├── sessions.js      # Study session routes
│   │   └── messages.js      # Messaging system routes
│   ├── server.js            # Main server file
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable React components
│   │   ├── contexts/        # React context providers
│   │   ├── pages/           # Page components
│   │   ├── services/        # API and authentication services
│   │   └── utils/           # Helper functions
│   ├── public/
│   └── package.json
└── README.md
```

## 🔑 API Endpoints

### Authentication
- `POST /api/auth/token` - Exchange Auth0 code for tokens
- `GET /api/auth/user` - Get current user information
- `POST /api/auth/logout` - Logout user

### Users
- `GET /api/users/profile` - Get user profile
- `POST /api/users/profile` - Create/update user profile
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/search` - Search users

### Matches
- `GET /api/matches` - Get user's matches
- `POST /api/matches/find` - Find new matches
- `POST /api/matches/:id/like` - Like/unlike a match
- `POST /api/matches/:id/rate` - Rate a match

### Sessions
- `GET /api/sessions` - Get user's sessions
- `POST /api/sessions` - Create new session
- `POST /api/sessions/:id/join` - Join a session
- `POST /api/sessions/:id/start` - Start a session

### Messages
- `GET /api/messages/chats` - Get user's chats
- `GET /api/messages/:chatId` - Get messages for a chat
- `POST /api/messages/:chatId` - Send a message

## 🧪 Testing

### Backend Testing
```bash
cd backend
npm test
```

### Frontend Testing
```bash
cd frontend
npm test
```

## 🔒 Security Features

- **Auth0 Integration**: Secure authentication with JWT tokens
- **Rate Limiting**: Protection against API abuse
- **Helmet Security**: Security headers for protection
- **Input Validation**: Joi schema validation for all requests
- **CORS Configuration**: Controlled cross-origin requests
- **Environment Variables**: Sensitive data protection

## 🎯 Key Features Explained

### Compatibility Algorithm

The matching system uses a sophisticated algorithm that considers:
- **Subject Overlap** (40% weight): Common study subjects
- **Learning Style** (30% weight): Compatible learning preferences
- **Schedule Compatibility** (20% weight): Overlapping availability
- **Performance Level** (10% weight): Similar academic levels

### Real-time Features

- Live messaging between matched users
- Real-time session updates
- Online status indicators
- Typing indicators (ready for implementation)

### Profile System

- Comprehensive user profiles with subjects, learning styles, and goals
- Privacy settings for profile visibility
- Location-based matching (optional)
- Performance tracking and statistics

## 🚀 Deployment

### Environment Setup

For production deployment, ensure you:

1. Set `NODE_ENV=production`
2. Use a production MongoDB database
3. Configure Auth0 for production domains
4. Set secure JWT secrets
5. Configure HTTPS
6. Set up proper logging

### Docker Deployment (Optional)

Create a `docker-compose.yml` for easy deployment:

```yaml
version: '3.8'
services:
  mongodb:
    image: mongo:4.4
    ports:
      - "27017:27017"
    
  backend:
    build: ./backend
    ports:
      - "5001:5001"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/studybuddy
    depends_on:
      - mongodb
      
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check the connection string in `.env`

2. **Auth0 Authentication Issues**
   - Verify Auth0 configuration
   - Check callback URLs
   - Ensure environment variables are set

3. **CORS Errors**
   - Verify frontend URL in backend CORS configuration
   - Check Auth0 allowed origins

4. **Port Conflicts**
   - Change ports in `.env` files if needed
   - Ensure no other services are using the same ports

