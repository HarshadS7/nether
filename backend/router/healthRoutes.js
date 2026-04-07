const express = require('express');
const router = express.Router();
const { getSystemHealth, getOrphanFunctions, getComplexFunctions, getMetrics } = require('../controller/health');

// Get overall system health
router.get('/', getSystemHealth);

// Get orphan functions
router.get('/orphans', getOrphanFunctions);

// Get high complexity functions
router.get('/complex', getComplexFunctions);

// Get just metrics
router.get('/metrics', getMetrics);

module.exports = router;
