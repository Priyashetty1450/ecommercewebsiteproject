const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const passport = require('passport');
const User = require('../models/User');
const { sendResetEmail } = require('../utils/emailService');

const router = express.Router();

/* ================= SIGNUP ================= */

router.post('/signup', async (req, res) => {
  const { username, password, email } = req.body;

  try {
    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'All fields required'
      });
    }

    const existingUser = await User.findOne({
      $or: [
        { username: username.trim() },
        { email: email.trim().toLowerCase() }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'Username or Email already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username: username.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: 'user'
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully'
    });

  } catch (err) {
    console.error("Signup Error:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        message: 'Username or Email already exists'
      });
    }

    res.status(500).json({
      message: 'Server error'
    });
  }
});

/* ================= LOGIN ================= */

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({
      $or: [
        { username: username.trim() },
        { email: username.trim().toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    if (!user.password) {
      return res.status(400).json({
        message: 'Use Google login for this account'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      role: user.role
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Server error'
    });
  }
});

/* ================= GOOGLE LOGIN ================= */

router.get('/google',
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

/* ================= GOOGLE CALLBACK ================= */

router.get('/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.CLIENT_URL}/pages/auth/login.html`
  }),
  (req, res) => {

    const token = jwt.sign(
      {
        id: req.user._id,
        role: req.user.role,
        email: req.user.email,
        provider: 'google'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.redirect(`${process.env.CLIENT_URL}/pages/home/Landing.html?token=${token}`);
  }
);

/* ================= FORGOT PASSWORD ================= */

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        message: 'If an account exists, reset link sent'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');

    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000;

    await user.save();

    const resetLink =
      `${process.env.CLIENT_URL}/pages/auth/reset-password.html?token=${resetToken}`;

    await sendResetEmail(user.email, resetLink);

    res.json({
      message: 'Reset link sent successfully'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Server error'
    });
  }
});

/* ================= RESET PASSWORD ================= */

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired token'
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;

    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Server error'
    });
  }
});

module.exports = router;