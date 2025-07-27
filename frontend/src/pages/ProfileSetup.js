import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const ProfileSetup = ({ onComplete }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    subjects: [],
    learningStyle: 1,
    availability: [],
    performanceLevel: 3,
    goals: ''
  });

  const subjects = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Statistics"];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const learningStyles = [
    { id: 1, name: "Visual", desc: "Learn through images and diagrams" },
    { id: 2, name: "Auditory", desc: "Learn through listening and discussion" },
    { id: 3, name: "Kinesthetic", desc: "Learn through hands-on activities" },
    { id: 4, name: "Reading/Writing", desc: "Learn through text and writing" }
  ];

  const handleSubjectToggle = (subject) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subject)
        ? prev.subjects.filter(s => s !== subject)
        : [...prev.subjects, subject]
    }));
  };

  const handleAvailabilityToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      availability: prev.availability.includes(day)
        ? prev.availability.filter(d => d !== day)
        : [...prev.availability, day]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.subjects.length === 0) {
      alert('Please select at least one subject');
      return;
    }
    
    if (formData.availability.length === 0) {
      alert('Please select your availability');
      return;
    }

    setLoading(true);
    try {
      // Save profile to backend (mock for now)
      await new Promise(resolve => setTimeout(resolve, 1000));
      localStorage.setItem('userProfile', JSON.stringify(formData));
      onComplete();
    } catch (error) {
      alert('Failed to create profile');
      console.error('Profile setup error:', error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <img src={user?.avatar || 'https://via.placeholder.com/150'} alt="Profile" className="w-20 h-20 rounded-full mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name}!</h1>
            <p className="text-gray-600">Let's set up your study profile</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Subjects */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                What subjects are you studying?
              </label>
              <div className="grid grid-cols-2 gap-3">
                {subjects.map(subject => (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => handleSubjectToggle(subject)}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      formData.subjects.includes(subject)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {subject}
                  </button>
                ))}
              </div>
            </div>

            {/* Learning Style */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                What's your learning style?
              </label>
              <div className="space-y-3">
                {learningStyles.map(style => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, learningStyle: style.id }))}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                      formData.learningStyle === style.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900">{style.name}</div>
                    <div className="text-sm text-gray-600">{style.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Availability */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                When are you available to study?
              </label>
              <div className="grid grid-cols-4 gap-3">
                {days.map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleAvailabilityToggle(day)}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      formData.availability.includes(day)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            {/* Performance Level */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                How would you rate your academic performance?
              </label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Beginner</span>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, performanceLevel: level }))}
                      className={`w-10 h-10 rounded-full border-2 transition-colors ${
                        formData.performanceLevel >= level
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-300 hover:border-blue-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <span className="text-sm text-gray-600">Expert</span>
              </div>
            </div>

            {/* Goals */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-4">
                What are your study goals?
              </label>
              <textarea
                value={formData.goals}
                onChange={(e) => setFormData(prev => ({ ...prev, goals: e.target.value }))}
                placeholder="e.g., Preparing for final exams, learning new concepts..."
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Saving...
                </>
              ) : (
                'Complete Setup'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;