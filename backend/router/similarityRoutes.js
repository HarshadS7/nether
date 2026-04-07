const express = require('express');
const router = express.Router();
const {
  findSimilarCode,
  findDuplicates,
  analyzeService
} = require("../controller/similaritySearch");

/**
 * Find similar code to a given function or code snippet
 * POST /api/similarity/find
 * Body: { functionId?: string, code?: string, limit?: number, minSimilarity?: number }
 */
router.post('/find', findSimilarCode);

/**
 * Detect duplicate code patterns across the entire codebase
 * GET /api/similarity/duplicates?minSimilarity=0.9&limit=20
 */
router.get('/duplicates', findDuplicates);

/**
 * Analyze code duplication within a specific service
 * GET /api/similarity/analyze/:service?minSimilarity=0.8
 */
router.get('/analyze/:service', analyzeService);

module.exports = router;
