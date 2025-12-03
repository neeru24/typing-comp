const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/typing-platform')
  .then(() => console.log('✓ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

module.exports = mongoose;