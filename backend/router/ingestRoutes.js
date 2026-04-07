const express = require('express');
const router = express.Router();
const { ingestCodebase, ingestFile, getIngestionStatus } = require('../controller/ingest');

// Ingest entire codebase
router.post('/codebase', ingestCodebase);

// Ingest single file
router.post('/file', ingestFile);

// Get ingestion status for a service
router.get('/status/:serviceName', getIngestionStatus);

module.exports = router;
