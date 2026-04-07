const express = require('express');
const router = express.Router();
const { runIngestion, getStatus } = require('../controller/repoIngest');

// Trigger full codebase ingestion for a GitHub repo
router.post('/run', runIngestion);

// Check the status of an ingestion job
router.get('/status/:jobId', getStatus);

module.exports = router;
