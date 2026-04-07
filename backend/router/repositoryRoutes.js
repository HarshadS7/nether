const express = require('express');
const router = express.Router();
const { requireApiKey, requireGitHubAuth, rateLimit } = require('../middleware/auth');
const {
  getAllRepositories,
  getRepositoryByUrl,
  createOrUpdateRepository,
  addCommit,
  getCommits,
  removeCommit,
  deleteRepository
} = require('../controller/repository');

/**
 * Repository Routes
 * Base path: /api/repository
 */

// Apply rate limiting to all routes
router.use(rateLimit(100, 60000)); // 100 requests per minute

// Get all repositories
router.get('/', requireApiKey, getAllRepositories);

// Get repository by URL (URL should be encoded)
router.get('/:repoUrl', requireApiKey, getRepositoryByUrl);

// Create or update repository
router.post('/', requireApiKey, createOrUpdateRepository);

// Add commit to repository
router.post('/:repoUrl/commits', requireApiKey, addCommit);

// Get commits for a specific user
router.get('/:repoUrl/commits/:username', requireApiKey, getCommits);

// Remove commit for a specific user (optionally pass commitHash in body)
router.delete('/:repoUrl/commits/:username', requireApiKey, removeCommit);

// Delete repository
router.delete('/:repoUrl', requireApiKey, deleteRepository);

module.exports = router;
