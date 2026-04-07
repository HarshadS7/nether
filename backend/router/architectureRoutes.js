const express = require('express');
const router = express.Router();
const {
  buildArchitectureGraph,
  getArchitectureGraph,
  getArchitectureStats,
  searchNodes,
  getNodeDetails,
  expandNode,
  createADR,
  createIncident
} = require('../controller/architecture');

/**
 * Architecture Visualization Routes
 * 
 * These endpoints provide an interactive, expandable architecture graph
 * similar to NotebookLM's graph interface
 */

// Build/rebuild the architecture graph
router.post('/build', buildArchitectureGraph);

// Get the full architecture graph (with optional filters)
router.get('/graph', getArchitectureGraph);

// Get statistics about the architecture
router.get('/stats', getArchitectureStats);

// Search nodes in the architecture
router.get('/search', searchNodes);

// Get details for a specific node
router.get('/node/:id', getNodeDetails);

// Expand a node to see its dependencies and children (key for interactivity)
router.get('/node/:id/expand',  expandNode);

// Add a new ADR (Architecture Decision Record)
router.post('/adr', createADR);

// Add a new incident
router.post('/incident', createIncident);

module.exports = router;
