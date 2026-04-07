const { getServiceArchitecture, searchNodes, getImpactAnalysis, getReverseImpactAnalysis } = require('../services/neo4j');
const { multiCollectionSearch, searchFunctions: searchFunctionsService, semanticSearch: semanticSearchService } = require('../services/chroma');
const { answerArchitectureQuestion } = require('../services/llm');

async function askQuestion(req, res) {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'question is required'
      });
    }

    // Get semantic context from ChromaDB
    const vectorContext = await multiCollectionSearch(question, 5);

    // Build graph context from Neo4j based on semantic matches
    let graphResults = [];
    
    // For the top 3 semantic function matches, get their graph footprint
    const topFunctions = vectorContext.functions.slice(0, 3);
    for (const func of topFunctions) {
      if (func.id) {
        try {
          const forward = await getImpactAnalysis(func.id, 2); // What it calls
          const reverse = await getReverseImpactAnalysis(func.id, 2); // What calls it
          
          graphResults.push({
            targetNodeId: func.id,
            dependencies: forward.map(f => ({ id: f.node.id, rel: f.relationships.join(',') })),
            dependents: reverse.map(r => ({ id: r.node.id, rel: r.relationships.join(',') }))
          });
        } catch (e) {
          console.error(`Failed to get graph context for ${func.id}:`, e.message);
        }
      }
    }

    // Also try keyword search in Neo4j directly
    const keywords = question.split(/\W+/).filter(w => w.length > 4).slice(0, 3);
    const keywordMatches = [];
    for (const kw of keywords) {
      const matches = await searchNodes(kw);
      if (matches.length > 0) {
        keywordMatches.push(...matches.slice(0, 2));
      }
    }
    
    // Combine structural + keyword graph data
    const fullGraphContext = {
      structuralImpacts: graphResults,
      keywordMatches: keywordMatches.map(n => n.id || n.name)
    };

    // Generate answer using LLM
    const answer = await answerArchitectureQuestion(
      question,
      fullGraphContext,
      vectorContext.functions.concat(vectorContext.documentation)
    );

    res.json({
      success: true,
      question,
      answer,
      context: {
        graphResults: graphResults.slice(0, 5),
        semanticMatches: {
          functions: vectorContext.functions.length,
          documentation: vectorContext.documentation.length,
          decisions: vectorContext.decisions.length
        }
      }
    });
  } catch (error) {
    console.error('Question answering error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function searchFunctions(req, res) {
  try {
    const { query, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query parameter is required'
      });
    }

    const results = await searchFunctionsService(query, parseInt(limit));

    res.json({
      success: true,
      query,
      results
    });
  } catch (error) {
    console.error('Function search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function searchServices(req, res) {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query parameter is required'
      });
    }

    const results = await searchNodes(query, 'Service');

    res.json({
      success: true,
      query,
      results
    });
  } catch (error) {
    console.error('Service search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getServiceArchitectureEndpoint(req, res) {
  try {
    const { serviceName } = req.params;

    const architecture = await getServiceArchitecture(serviceName);

    if (!architecture) {
      return res.status(404).json({
        success: false,
        error: 'Service not found'
      });
    }

    res.json({
      success: true,
      architecture
    });
  } catch (error) {
    console.error('Architecture retrieval error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function semanticSearch(req, res) {
  try {
    const { query, collection = 'functions', limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query parameter is required'
      });
    }

    const results = await semanticSearchService(
      query,
      collection,
      parseInt(limit)
    );

    res.json({
      success: true,
      query,
      collection,
      results
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  askQuestion,
  searchFunctions,
  searchServices,
  getServiceArchitecture: getServiceArchitectureEndpoint,
  semanticSearch
};
