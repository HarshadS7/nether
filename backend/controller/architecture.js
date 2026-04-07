const architectureService = require('../services/architecture');

/**
 * Build or rebuild the architecture graph
 * POST /api/architecture/build
 */
async function buildArchitectureGraph(req, res) {
  try {
    const { workspace, organization } = req.body;

    console.log('Building architecture graph...');
    const graph = await architectureService.buildArchitectureGraph(workspace, organization);

    res.json({
      success: true,
      message: 'Architecture graph built successfully',
      graph,
      stats: graph.metadata.stats
    });
  } catch (error) {
    console.error('Error building architecture graph:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get the current architecture graph
 * GET /api/architecture/graph
 * Query params: ?type=SERVICE&workspace=/path&expanded=true
 */
async function getArchitectureGraph(req, res) {
  try {
    const { type, workspace, organization } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (workspace) filter.workspace = workspace;
    if (organization) filter.organization = organization;

    const graph = await architectureService.getArchitectureGraph(filter);

    res.json({
      success: true,
      graph
    });
  } catch (error) {
    console.error('Error getting architecture graph:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Expand a specific node to see its dependencies and children
 * GET /api/architecture/node/:id/expand
 * This is crucial for the interactive graph behavior like NotebookLM
 */
async function expandNode(req, res) {
  try {
    const { id } = req.params;

    console.log(`Expanding node: ${id}`);
    const expansionData = await architectureService.expandNode(id);

    res.json({
      success: true,
      expansion: expansionData
    });
  } catch (error) {
    console.error('Error expanding node:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get node details without full expansion
 * GET /api/architecture/node/:id
 */
async function getNodeDetails(req, res) {
  try {
    const { id } = req.params;

    const graph = await architectureService.getArchitectureGraph();
    const node = graph.nodes.find(n => n.id === id);

    if (!node) {
      return res.status(404).json({
        success: false,
        error: 'Node not found'
      });
    }

    // Get connected nodes
    const connectedEdges = graph.edges.filter(e => 
      e.source === id || e.target === id
    );

    const connections = {
      outgoing: connectedEdges.filter(e => e.source === id),
      incoming: connectedEdges.filter(e => e.target === id)
    };

    res.json({
      success: true,
      node,
      connections
    });
  } catch (error) {
    console.error('Error getting node details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add a new ADR (Architecture Decision Record)
 * POST /api/architecture/adr
 */
async function createADR(req, res) {
  try {
    const { title, decision, owner, affects } = req.body;

    if (!title || !decision) {
      return res.status(400).json({
        success: false,
        error: 'Title and decision are required'
      });
    }

    const adr = await architectureService.addADR({
      title,
      decision,
      owner,
      affects: affects || []
    });

    // Rebuild graph to include new ADR
    await architectureService.buildArchitectureGraph();

    res.json({
      success: true,
      message: 'ADR created successfully',
      adr
    });
  } catch (error) {
    console.error('Error creating ADR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Add a new Incident
 * POST /api/architecture/incident
 */
async function createIncident(req, res) {
  try {
    const { title, severity, status, affects } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'Title is required'
      });
    }

    const incident = await architectureService.addIncident({
      title,
      severity: severity || 'medium',
      status: status || 'open',
      affects: affects || []
    });

    // Rebuild graph to include new incident
    await architectureService.buildArchitectureGraph();

    res.json({
      success: true,
      message: 'Incident created successfully',
      incident
    });
  } catch (error) {
    console.error('Error creating incident:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Get graph statistics
 * GET /api/architecture/stats
 */
async function getArchitectureStats(req, res) {
  try {
    const graph = await architectureService.getArchitectureGraph();

    const stats = {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      byType: {},
      lastBuilt: graph.metadata.lastBuilt
    };

    // Count by type
    graph.nodes.forEach(node => {
      stats.byType[node.type] = (stats.byType[node.type] || 0) + 1;
    });

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting architecture stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Search nodes by name or type
 * GET /api/architecture/search?q=auth&type=SERVICE
 */
async function searchNodes(req, res) {
  try {
    const { q, type } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    const graph = await architectureService.getArchitectureGraph();
    let results = graph.nodes.filter(node => {
      const searchableText = [
        node.label,
        node.data?.name,
        node.data?.title,
        node.data?.description
      ].filter(Boolean).join(' ').toLowerCase();
      
      return searchableText.includes(q.toLowerCase());
    });

    if (type) {
      results = results.filter(node => node.type === type);
    }

    res.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Error searching nodes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  buildArchitectureGraph,
  getArchitectureGraph,
  expandNode,
  getNodeDetails,
  createADR,
  createIncident,
  getArchitectureStats,
  searchNodes
};
