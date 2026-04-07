const express = require('express');
const router = express.Router();
const { askQuestion, searchFunctions, searchServices, getServiceArchitecture, semanticSearch } = require('../controller/query');

// Ask a question about the architecture
router.post('/ask', askQuestion);

// Search for functions
router.get('/functions', searchFunctions);

// Search for services
router.get('/services', searchServices);

// Get service architecture
router.get('/architecture/:serviceName', getServiceArchitecture);

// Semantic search across collections
router.get('/semantic', semanticSearch);

module.exports = router;
