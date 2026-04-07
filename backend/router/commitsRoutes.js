const express = require('express');
const router = express.Router();
const commitsController = require('../controller/commitsController');

/**
 * Commit History Routes
 * Exposes GitHub commit history with diffs and LLM-generated summaries
 */

// Get commits for a specific repository
router.get('/repository/:owner/:repo', commitsController.getRepositoryCommits);

// Get commit details by hash
router.get('/repository/:owner/:repo/commit/:hash', commitsController.getCommitDetails);

// Get repository statistics
router.get('/repository/:owner/:repo/stats', commitsController.getRepositoryStats);

// Get author activity for a repository
router.get('/repository/:owner/:repo/activity', commitsController.getAuthorActivity);

// Get commits by author (across all repositories)
router.get('/author/:username', commitsController.getAuthorCommits);

// Get commits by workspace
router.get('/workspace/:workspaceId', commitsController.getWorkspaceCommits);

// Update commit summary manually
router.put('/repository/:owner/:repo/commit/:hash/summary', commitsController.updateCommitSummary);

module.exports = router;
