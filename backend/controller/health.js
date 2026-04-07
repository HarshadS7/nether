const { findOrphanFunctions, getHighComplexityFunctions, getDatabaseMetrics } = require('../services/neo4j');
const { getCollectionStats } = require('../services/chroma');
const { analyzeSystemHealth: analyzeSystemHealthLLM } = require('../services/llm');

async function getSystemHealth(req, res) {
  try {
    // Get real metrics from Neo4j
    const metrics = await getDatabaseMetrics();

    // Get collection stats from ChromaDB
    const chromaStats = await getCollectionStats();

    // Find issues
    const orphanFunctions = await findOrphanFunctions();
    const complexFunctions = await getHighComplexityFunctions(10);

    const issues = {
      orphanFunctions: orphanFunctions.length,
      highComplexityFunctions: complexFunctions.length
    };

    // Generate health analysis
    const analysis = await analyzeSystemHealthLLM(
      { ...metrics, chromaStats },
      issues
    );

    res.json({
      success: true,
      health: {
        metrics,
        chromaStats,
        issues,
        analysis
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getOrphanFunctions(req, res) {
  try {
    const orphans = await findOrphanFunctions();

    res.json({
      success: true,
      count: orphans.length,
      functions: orphans
    });
  } catch (error) {
    console.error('Orphan functions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getComplexFunctions(req, res) {
  try {
    const { threshold = 10 } = req.query;

    const complexFunctions = await getHighComplexityFunctions(
      parseInt(threshold)
    );

    res.json({
      success: true,
      threshold: parseInt(threshold),
      count: complexFunctions.length,
      functions: complexFunctions
    });
  } catch (error) {
    console.error('Complex functions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getMetrics(req, res) {
  try {
    const metrics = await getDatabaseMetrics();

    res.json({
      success: true,
      metrics
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  getSystemHealth,
  getOrphanFunctions,
  getComplexFunctions,
  getMetrics
};
