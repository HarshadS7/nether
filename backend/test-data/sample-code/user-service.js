// Sample JavaScript/Express Service for Testing
const express = require('express');
const router = express.Router();

// Authentication middleware
function authenticateUser(req, res, next) {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  // Validate token logic here
  req.user = { id: 1, name: 'Test User' };
  next();
}

// Get user profile
router.get('/profile/:userId', authenticateUser, async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const newUser = await createUser(req.body);
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user
router.put('/users/:userId', authenticateUser, async (req, res) => {
  try {
    const updated = await updateUser(req.params.userId, req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:userId', authenticateUser, async (req, res) => {
  try {
    await deleteUser(req.params.userId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
async function getUserById(userId) {
  // Database query simulation
  return { id: userId, name: 'User ' + userId, email: 'user@example.com' };
}

async function createUser(userData) {
  validateUserData(userData);
  // Database insert simulation
  return { id: Date.now(), ...userData };
}

async function updateUser(userId, userData) {
  const user = await getUserById(userId);
  return { ...user, ...userData };
}

async function deleteUser(userId) {
  const user = await getUserById(userId);
  // Database delete simulation
  return true;
}

function validateUserData(data) {
  if (!data.name || !data.email) {
    throw new Error('Name and email are required');
  }
  
  if (!isValidEmail(data.email)) {
    throw new Error('Invalid email format');
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = router;
