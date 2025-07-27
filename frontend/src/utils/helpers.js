import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

// Date formatting helpers
export const formatDate = (date) => {
  if (!date) return '';
  
  const dateObj = new Date(date);
  
  if (isToday(dateObj)) {
    return format(dateObj, 'h:mm a');
  }
  
  if (isYesterday(dateObj)) {
    return 'Yesterday';
  }
  
  return format(dateObj, 'MMM d');
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return format(new Date(date), 'MMM d, yyyy h:mm a');
};

export const timeAgo = (date) => {
  if (!date) return '';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

// Text helpers
export const truncateText = (text, maxLength = 100) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
};

export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Subject helpers
export const getSubjectColor = (subject) => {
  const colors = {
    'Mathematics': 'bg-blue-100 text-blue-800',
    'Physics': 'bg-purple-100 text-purple-800',
    'Chemistry': 'bg-green-100 text-green-800',
    'Biology': 'bg-emerald-100 text-emerald-800',
    'Computer Science': 'bg-indigo-100 text-indigo-800',
    'Statistics': 'bg-orange-100 text-orange-800',
    'Literature': 'bg-pink-100 text-pink-800',
    'History': 'bg-yellow-100 text-yellow-800'
  };
  
  return colors[subject] || 'bg-gray-100 text-gray-800';
};

// Learning style helpers
export const getLearningStyleName = (styleId) => {
  const styles = {
    1: 'Visual',
    2: 'Auditory', 
    3: 'Kinesthetic',
    4: 'Reading/Writing'
  };
  
  return styles[styleId] || 'Unknown';
};

// Performance level helpers
export const getPerformanceLabel = (level) => {
  const labels = {
    1: 'Beginner',
    2: 'Basic',
    3: 'Intermediate', 
    4: 'Advanced',
    5: 'Expert'
  };
  
  return labels[level] || 'Unknown';
};

// Compatibility helpers
export const getCompatibilityColor = (score) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
};

export const getCompatibilityLabel = (score) => {
  if (score >= 90) return 'Excellent Match';
  if (score >= 75) return 'Great Match';
  if (score >= 60) return 'Good Match';
  if (score >= 40) return 'Fair Match';
  return 'Poor Match';
};

// Error helpers
export const getErrorMessage = (error) => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  return 'Something went wrong';
};

// Generate random ID
export const generateId = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};