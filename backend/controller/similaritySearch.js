const chromaService = require('../services/chroma');
const { runQuery } = require('../services/neo4j');

/**
 * Find similar code across the codebase
 * POST /api/similarity/find
 */
async function findSimilarCode(req, res) {
  try {
    const { functionId, code, limit = 10, minSimilarity = 0.7 } = req.body;

    if (!functionId && !code) {
      return res.status(400).json({
        success: false,
        error: 'Either functionId or code is required'
      });
    }

    let queryText = code;

    // If functionId provided, get the function details from Neo4j
    if (functionId && !code) {
      const functionQuery = `
        MATCH (f:Function {id: $functionId})
        RETURN f.name as name, f.filePath as filePath, f.params as params, f.code as code
      `;
      
      const result = await runQuery(functionQuery, { functionId });
      
      if (result.records.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Function not found'
        });
      }

      const func = result.records[0].toObject();
      queryText = func.code || `Function: ${func.name}(${func.params?.join(', ') || ''}) in ${func.filePath}`;
    }

    // Search for similar functions in ChromaDB
    const similarFunctions = await chromaService.searchFunctions(queryText, limit + 1);

    // Filter out the original function and apply similarity threshold
    const filtered = similarFunctions
      .filter(f => f.id !== functionId) // Exclude self
      .filter(f => {
        const similarity = 1 - f.distance; // Convert distance to similarity
        return similarity >= minSimilarity;
      })
      .slice(0, limit)
      .map(f => ({
        id: f.id,
        name: f.metadata.name,
        filePath: f.metadata.filePath,
        line: f.metadata.line,
        language: f.metadata.language,
        similarity: (1 - f.distance).toFixed(4), // 0-1 scale
        distance: f.distance.toFixed(4),
        snippet: f.document
      }));

    // Group by service/directory
    const grouped = groupByService(filtered);

    res.json({
      success: true,
      query: {
        functionId,
        text: queryText?.substring(0, 100) + '...'
      },
      results: {
        total: filtered.length,
        items: filtered,
        byService: grouped
      }
    });
  } catch (error) {
    console.error('Error finding similar code:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Detect duplicate code patterns across services
 * GET /api/similarity/duplicates?minSimilarity=0.9&limit=20
 */
async function findDuplicates(req, res) {
  try {
    const { minSimilarity = 0.9, limit = 20 } = req.query;

    // Get all functions from ChromaDB
    const allFunctionsQuery = `
      MATCH (f:Function)
      RETURN f.id as id, f.name as name, f.filePath as filePath, f.code as code
      LIMIT 1000
    `;
    
    const result = await runQuery(allFunctionsQuery);
    const functions = result.records.map(r => r.toObject());

    const duplicatePairs = [];
    const processed = new Set();

    // For each function, find similar ones
    for (const func of functions) {
      if (processed.has(func.id)) continue;

      const queryText = func.code || `Function: ${func.name} in ${func.filePath}`;
      const similar = await chromaService.searchFunctions(queryText, 5);

      for (const sim of similar) {
        if (sim.id === func.id) continue; // Skip self
        if (processed.has(sim.id)) continue;

        const similarity = 1 - sim.distance;
        
        if (similarity >= parseFloat(minSimilarity)) {
          duplicatePairs.push({
            function1: {
              id: func.id,
              name: func.name,
              filePath: func.filePath
            },
            function2: {
              id: sim.id,
              name: sim.metadata.name,
              filePath: sim.metadata.filePath
            },
            similarity: similarity.toFixed(4),
            category: categorizeMatch(func.name, sim.metadata.name, similarity)
          });

          if (duplicatePairs.length >= parseInt(limit)) break;
        }
      }

      processed.add(func.id);
      if (duplicatePairs.length >= parseInt(limit)) break;
    }

    // Sort by similarity descending
    duplicatePairs.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));

    res.json({
      success: true,
      threshold: parseFloat(minSimilarity),
      duplicates: {
        total: duplicatePairs.length,
        items: duplicatePairs,
        summary: {
          exactMatches: duplicatePairs.filter(d => d.category === 'exact').length,
          nearMatches: duplicatePairs.filter(d => d.category === 'near').length,
          similarLogic: duplicatePairs.filter(d => d.category === 'similar').length
        }
      }
    });
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get similarity analysis for entire workspace/service
 * GET /api/similarity/analyze/:service
 */
async function analyzeService(req, res) {
  try {
    const { service } = req.params;
    const { minSimilarity = 0.8 } = req.query;

    // Get all functions in this service
    const serviceQuery = `
      MATCH (s:Service {name: $service})<-[:BELONGS_TO]-(f:File)<-[:DEFINED_IN]-(fn:Function)
      RETURN fn.id as id, fn.name as name, fn.filePath as filePath, fn.code as code
    `;
    
    const result = await runQuery(serviceQuery, { service });
    const functions = result.records.map(r => r.toObject());

    if (functions.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Service not found or has no functions'
      });
    }

    const duplicatesInService = [];
    const duplicatesAcrossServices = [];

    // Analyze each function
    for (const func of functions) {
      const queryText = func.code || `Function: ${func.name} in ${func.filePath}`;
      const similar = await chromaService.searchFunctions(queryText, 10);

      for (const sim of similar) {
        if (sim.id === func.id) continue;

        const similarity = 1 - sim.distance;
        if (similarity < parseFloat(minSimilarity)) continue;

        const dup = {
          original: {
            name: func.name,
            filePath: func.filePath
          },
          duplicate: {
            name: sim.metadata.name,
            filePath: sim.metadata.filePath
          },
          similarity: similarity.toFixed(4)
        };

        // Check if duplicate is in same service or different
        const isSameService = sim.metadata.filePath.includes(service);
        
        if (isSameService) {
          duplicatesInService.push(dup);
        } else {
          duplicatesAcrossServices.push(dup);
        }
      }
    }

    res.json({
      success: true,
      service,
      analysis: {
        totalFunctions: functions.length,
        duplicatesWithinService: {
          count: duplicatesInService.length,
          items: duplicatesInService.slice(0, 10)
        },
        duplicatesAcrossServices: {
          count: duplicatesAcrossServices.length,
          items: duplicatesAcrossServices.slice(0, 10)
        },
        duplicationRate: ((duplicatesInService.length + duplicatesAcrossServices.length) / functions.length).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Error analyzing service:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Helper functions
function groupByService(functions) {
  const grouped = {};
  
  for (const func of functions) {
    // Extract service name from file path (e.g., "services/payment/..." -> "payment")
    const pathParts = func.filePath.split('/');
    const serviceIndex = pathParts.indexOf('services');
    const serviceName = serviceIndex >= 0 && pathParts[serviceIndex + 1] 
      ? pathParts[serviceIndex + 1] 
      : 'unknown';

    if (!grouped[serviceName]) {
      grouped[serviceName] = [];
    }
    grouped[serviceName].push(func);
  }

  return grouped;
}

function categorizeMatch(name1, name2, similarity) {
  if (similarity >= 0.98) return 'exact';
  if (similarity >= 0.9) return 'near';
  return 'similar';
}

module.exports = {
  findSimilarCode,
  findDuplicates,
  analyzeService
};
