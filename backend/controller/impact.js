const { analyzeImpact: analyzeImpactService, analyzeChangeImpact, getTestingRecommendations: getTestingRecommendationsService, getDependencyChain: getDependencyChainService } = require('../services/impact');

async function analyzeImpact(req, res) {
  try {
    const { nodeId } = req.params;
    const { maxDepth = 3, includeReverse = true, generateExplanation = true } = req.query;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required'
      });
    }

    const result = await analyzeImpactService(nodeId, {
      maxDepth: parseInt(maxDepth),
      includeReverse: includeReverse === 'true',
      generateExplanation: generateExplanation === 'true'
    });

    res.json({
      success: true,
      impact: result
    });
  } catch (error) {
    console.error('Impact analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function analyzeChanges(req, res) {
  try {
    const { changes, maxDepth = 3 } = req.body;

    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({
        success: false,
        error: 'changes array is required'
      });
    }

    const result = await analyzeChangeImpact(changes, {
      maxDepth: parseInt(maxDepth)
    });

    res.json({
      success: true,
      analysis: result
    });
  } catch (error) {
    console.error('Change impact analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getTestingRecommendations(req, res) {
  try {
    const { nodeId } = req.params;

    if (!nodeId) {
      return res.status(400).json({
        success: false,
        error: 'nodeId is required'
      });
    }

    const recommendations = await getTestingRecommendationsService(nodeId);

    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    console.error('Testing recommendations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getDependencyChain(req, res) {
  try {
    const { fromId, toId } = req.query;
    const { maxDepth = 5 } = req.query;

    if (!fromId || !toId) {
      return res.status(400).json({
        success: false,
        error: 'fromId and toId are required'
      });
    }

    const chain = await getDependencyChainService(
      fromId,
      toId,
      parseInt(maxDepth)
    );

    res.json({
      success: true,
      chain
    });
  } catch (error) {
    console.error('Dependency chain error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  analyzeImpact,
  analyzeChanges,
  getTestingRecommendations,
  getDependencyChain
};
