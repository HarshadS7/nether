const express = require('express');
const router = express.Router();
const { requireApiKey, rateLimit } = require('../middleware/auth');
const {
    createWorkspace,
    getWorkspaces,
    getWorkspaceById
} = require('../controller/workspace');

/**
 * Workspace Routes
 * Base path: /api/workspace
 */

// Apply rate limiting to all routes
router.use(rateLimit(100, 60000)); // 100 requests per minute

// Create workspace
router.post('/', requireApiKey, createWorkspace);

// Get all workspaces for an owner (pass ?owner=username)
router.get('/', requireApiKey, getWorkspaces);

// Get specific workspace by ID
router.get('/:id', requireApiKey, getWorkspaceById);

module.exports = router;
