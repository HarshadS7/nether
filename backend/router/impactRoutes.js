const express = require('express');
const router = express.Router();
const { analyzeImpact, analyzeChanges, getTestingRecommendations, getDependencyChain } = require('../controller/impact');

// Analyze impact of a single node
router.get('/analyze/:nodeId', analyzeImpact);

// Analyze impact of multiple changes
router.post('/changes', analyzeChanges);

// Get testing recommendations
router.get('/testing/:nodeId', getTestingRecommendations);

// Get dependency chain between two nodes
router.get('/chain', getDependencyChain);

module.exports = router;
