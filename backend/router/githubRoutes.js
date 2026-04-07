const express = require('express');
const router = express.Router();
const {
  login,
  callback,
  extractToken,
  listCommits,
  listContributors,
  compareVersions,
  commitDetail,
  listRepos,
  me,
  fetchCommitChanges
} = require('../controller/github');

// ── Public routes (no token needed) ──
router.get('/login', login);
router.get('/callback', callback);

// ── Protected routes (require GitHub OAuth token) ──
router.get('/me', extractToken, me);
router.get('/repos', extractToken, listRepos);
router.get('/commits/:owner/:repo', extractToken, listCommits);
router.get('/contributors/:owner/:repo', extractToken, listContributors);
router.get('/compare/:owner/:repo/:baseSha/:headSha', extractToken, compareVersions);
router.get('/commit/:owner/:repo/:sha', extractToken, commitDetail);
router.get('/changes/:owner/:repo/:sha', extractToken, fetchCommitChanges);

module.exports = router;
