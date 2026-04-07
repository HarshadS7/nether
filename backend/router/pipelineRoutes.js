const express = require('express');
const router = express.Router();
const { analyzeCode, parseCodeOnly } = require('../controller/pipeline');

// Analyze code snippet - CI/CD pipeline endpoint
router.post('/analyze', analyzeCode);

// Pure parsing endpoint utilized by the Python ML service
router.post('/parse', parseCodeOnly);

module.exports = router;
