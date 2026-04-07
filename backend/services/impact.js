const { getDriver, isConnected } = require('../db/neo4j');
const llmService = require('./llm');

async function analyzeImpact(nodeId, options = {}) {
  if (!isConnected()) {
    console.warn('⚠️  Neo4j not connected, returning empty impact analysis');
    return {
      nodeId,
      forwardImpact: { total: 0, byDepth: {}, items: [] },
      reverseImpact: { total: 0, items: [] },
      blastRadius: { critical: 0, high: 0, medium: 0, low: 0 },
      analysis: 'Neo4j database not connected. Unable to perform impact analysis.'
    };
  }
  
  const {
    maxDepth = 3,
    includeReverse = true,
    generateExplanation = true
  } = options;

  try {
    // Get forward impact (what this affects)
    const forwardImpact = await getImpactAnalysis(nodeId, maxDepth);

    // Get reverse impact (what depends on this)
    const reverseImpact = includeReverse 
      ? await getReverseImpactAnalysis(nodeId, maxDepth)
      : [];

    // Categorize impact by depth
    const categorized = categorizeImpact(forwardImpact);

    // Generate blast radius metrics
    const blastRadius = calculateBlastRadius(forwardImpact, reverseImpact);

    const result = {
      nodeId,
      forwardImpact: {
        total: forwardImpact.length,
        byDepth: categorized,
        items: forwardImpact
      },
      reverseImpact: {
        total: reverseImpact.length,
        items: reverseImpact
      },
      blastRadius,
      analysis: null
    };

    // Generate AI explanation if requested
    if (generateExplanation) {
      result.analysis = await llmService.explainImpactAnalysis(forwardImpact, {
        targetNode: { id: nodeId },
        reverseImpact
      });
    }

    return result;

  } catch (error) {
    console.error('Error analyzing impact:', error);
    throw error;
  }
}

async function analyzeChangeImpact(changes, options = {}) {
  // Analyze impact of multiple changes
  const impacts = [];

  for (const change of changes) {
    // Support both nodeId and file/function format
    let nodeId = change.nodeId;
    if (!nodeId && change.file && change.function) {
      // Construct nodeId from file and function name
      // Format: filepath:functionName:line (line unknown, so we'll search)
      nodeId = `${change.file}:${change.function}`;
    }

    if (!nodeId) {
      console.warn('Skipping change without nodeId or file/function:', change);
      continue;
    }

    const impact = await analyzeImpact(nodeId, options);
    impacts.push({
      change,
      impact
    });
  }

  // Find overlapping impacts
  const overlaps = findImpactOverlaps(impacts);

  return {
    individualImpacts: impacts,
    overlappingAreas: overlaps,
    totalAffectedNodes: countUniqueAffected(impacts)
  };
}

async function getTestingRecommendations(nodeId) {
  try {
    const impact = await analyzeImpact(nodeId, { 
      maxDepth: 3, 
      generateExplanation: false 
    });

    // Identify what needs testing
    const testAreas = {
      unit: [],
      integration: [],
      e2e: []
    };

    // Direct dependencies = unit tests
    const directImpact = impact.forwardImpact.items.filter(i => i.depth === 1);
    testAreas.unit = directImpact.map(i => i.node);

    // Depth 2-3 = integration tests
    const integrationImpact = impact.forwardImpact.items.filter(i => i.depth === 2 || i.depth === 3);
    testAreas.integration = integrationImpact.map(i => i.node);

    // Endpoints = E2E tests
    const endpoints = impact.forwardImpact.items.filter(i => 
      i.node.id?.includes('GET:') || 
      i.node.id?.includes('POST:') ||
      i.node.method
    );
    testAreas.e2e = endpoints.map(i => i.node);

    return {
      nodeId,
      testStrategy: testAreas,
      priority: determineTestPriority(impact.blastRadius),
      estimatedTestCount: directImpact.length + integrationImpact.length + endpoints.length
    };

  } catch (error) {
    console.error('Error generating testing recommendations:', error);
    throw error;
  }
}

async function getDependencyChain(fromNodeId, toNodeId, maxDepth = 5) {
  if (!isConnected()) {
    console.warn('⚠️  Neo4j not connected, cannot get dependency chain');
    return { connected: false, chain: [], error: 'Database not connected' };
  }
  
  const driver = getDriver();
  const session = driver.session();
  const safeDepth = Math.max(1, Math.min(10, parseInt(maxDepth) || 5));
  
  try {
    const result = await session.run(
      `
      MATCH path = shortestPath((from {id: $fromId})-[*..${safeDepth}]->(to {id: $toId}))
      RETURN path, length(path) as depth
      `,
      { fromId: fromNodeId, toId: toNodeId }
    );

    if (result.records.length === 0) {
      return { connected: false, chain: [] };
    }

    const record = result.records[0];
    const path = record.get('path');
    const depth = record.get('depth').toNumber();

    const chain = path.segments.map(segment => ({
      from: segment.start.properties,
      to: segment.end.properties,
      relationship: segment.relationship.type
    }));

    return {
      connected: true,
      depth,
      chain
    };

  } finally {
    await session.close();
  }
}

async function getImpactAnalysis(nodeId, maxDepth) {
  if (!isConnected()) {
    return [];
  }
  
  const driver = getDriver();
  const session = driver.session();
  const safeDepth = Math.max(1, Math.min(10, parseInt(maxDepth) || 3));
  
  try {
    const result = await session.run(
      `
      MATCH path = (start {id: $nodeId})-[*1..${safeDepth}]->(target)
      RETURN target, length(path) as depth
      ORDER BY depth
      `,
      { nodeId }
    );

    return result.records.map(record => ({
      node: record.get('target').properties,
      depth: record.get('depth').toNumber()
    }));
  } finally {
    await session.close();
  }
}

async function getReverseImpactAnalysis(nodeId, maxDepth) {
  if (!isConnected()) {
    return [];
  }
  
  const driver = getDriver();
  const session = driver.session();
  const safeDepth = Math.max(1, Math.min(10, parseInt(maxDepth) || 3));
  
  try {
    const result = await session.run(
      `
      MATCH path = (dependent)-[*1..${safeDepth}]->(target {id: $nodeId})
      RETURN dependent, length(path) as depth
      ORDER BY depth
      `,
      { nodeId }
    );

    return result.records.map(record => ({
      node: record.get('dependent').properties,
      depth: record.get('depth').toNumber()
    }));
  } finally {
    await session.close();
  }
}

// Helper functions
function categorizeImpact(impactItems) {
  const byDepth = {};
  
  for (const item of impactItems) {
    const depth = item.depth;
    if (!byDepth[depth]) {
      byDepth[depth] = [];
    }
    byDepth[depth].push(item.node);
  }

  return byDepth;
}

function calculateBlastRadius(forwardImpact, reverseImpact) {
  const totalAffected = forwardImpact.length + reverseImpact.length;
  
  // Severity based on number of affected nodes
  let severity = 'low';
  if (totalAffected > 50) severity = 'critical';
  else if (totalAffected > 20) severity = 'high';
  else if (totalAffected > 10) severity = 'medium';

  // Calculate by node type
  const byType = {};
  for (const item of forwardImpact) {
    const type = getNodeType(item.node);
    byType[type] = (byType[type] || 0) + 1;
  }

  return {
    totalNodes: totalAffected,
    forwardNodes: forwardImpact.length,
    reverseNodes: reverseImpact.length,
    severity,
    byType,
    maxDepth: Math.max(...forwardImpact.map(i => i.depth), 0)
  };
}

function getNodeType(node) {
  if (node.method && node.path) return 'endpoint';
  if (node.name && node.params) return 'function';
  if (node.path && node.language) return 'file';
  return 'unknown';
}

function findImpactOverlaps(impacts) {
  const affectedMap = new Map();

  // Count how many changes affect each node
  for (const { impact } of impacts) {
    for (const item of impact.forwardImpact.items) {
      const nodeId = item.node.id;
      affectedMap.set(nodeId, (affectedMap.get(nodeId) || 0) + 1);
    }
  }

  // Find nodes affected by multiple changes
  const overlaps = [];
  for (const [nodeId, count] of affectedMap.entries()) {
    if (count > 1) {
      overlaps.push({ nodeId, affectedBy: count });
    }
  }

  return overlaps.sort((a, b) => b.affectedBy - a.affectedBy);
}

function countUniqueAffected(impacts) {
  const uniqueNodes = new Set();
  
  for (const { impact } of impacts) {
    for (const item of impact.forwardImpact.items) {
      uniqueNodes.add(item.node.id);
    }
  }

  return uniqueNodes.size;
}

function determineTestPriority(blastRadius) {
  if (blastRadius.severity === 'critical') return 'P0';
  if (blastRadius.severity === 'high') return 'P1';
  if (blastRadius.severity === 'medium') return 'P2';
  return 'P3';
}

module.exports = {
  analyzeImpact,
  analyzeChangeImpact,
  getTestingRecommendations,
  getDependencyChain,
  getImpactAnalysis,
  getReverseImpactAnalysis
};
