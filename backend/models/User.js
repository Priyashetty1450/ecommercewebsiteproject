const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  password: {
    type: String,
    required: function () {
      return !this.isGoogleAuth;
    }
  },

  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },

  googleId: {
    type: String,
    unique: true,
    sparse: true
  },

  isGoogleAuth: {
    type: Boolean,
    default: false
  },

  resetToken: {
    type: String
  },

  resetTokenExpiry: {
    type: Date
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);