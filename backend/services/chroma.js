const { getClient, getCollection, isConnected: dbIsConnected } = require('../db/chroma');

let client = null;
let collections = null;

function isConnected() {
  return collections !== null && collections.functions !== null && dbIsConnected();
}

function initializeChroma() {
  client = getClient();
  collections = {
    functions: getCollection('functions'),
    documentation: getCollection('documentation'),
    decisions: getCollection('decisions'),
    incidents: getCollection('incidents')
  };
  console.log('✅ ChromaDB service initialized (using default embeddings)');
}

async function addFunction(functionData) {
  if (!isConnected()) {
    console.warn('⚠️  ChromaDB not connected, skipping addFunction');
    return { success: false, error: 'ChromaDB not connected' };
  }
  
  try {
    const text = formatFunctionForEmbedding(functionData);

    await collections.functions.add({
      ids: [functionData.id],
      metadatas: [{
        name: functionData.name,
        filePath: functionData.filePath,
        line: functionData.line,
        language: functionData.language || 'javascript',
        params: JSON.stringify(functionData.params || [])
      }],
      documents: [text]
    });

    return { success: true, id: functionData.id };
  } catch (error) {
    console.error('Error adding function to Chroma:', error.message);
    throw error;
  }
}

async function addDocumentation(docData) {
  try {
    const text = docData.content;

    await collections.documentation.add({
      ids: [docData.id],
      metadatas: [{
        title: docData.title,
        type: docData.type || 'api',
        endpoint: docData.endpoint || '',
        service: docData.service || ''
      }],
      documents: [text]
    });

    return { success: true, id: docData.id };
  } catch (error) {
    console.error('Error adding documentation to Chroma:', error.message);
    throw error;
  }
}

async function addDecision(decisionData) {
  try {
    const text = `${decisionData.title}\n${decisionData.context}\n${decisionData.decision}\n${decisionData.consequences}`;

    await collections.decisions.add({
      ids: [decisionData.id],
      metadatas: [{
        title: decisionData.title,
        date: decisionData.date,
        status: decisionData.status || 'accepted',
        tags: JSON.stringify(decisionData.tags || [])
      }],
      documents: [text]
    });

    return { success: true, id: decisionData.id };
  } catch (error) {
    console.error('Error adding decision to Chroma:', error.message);
    throw error;
  }
}

async function addIncident(incidentData) {
  try {
    const text = `${incidentData.title}\n${incidentData.description}\n${incidentData.resolution}`;

    await collections.incidents.add({
      ids: [incidentData.id],
      metadatas: [{
        title: incidentData.title,
        date: incidentData.date,
        severity: incidentData.severity || 'medium',
        affectedServices: JSON.stringify(incidentData.affectedServices || [])
      }],
      documents: [text]
    });

    return { success: true, id: incidentData.id };
  } catch (error) {
    console.error('Error adding incident to Chroma:', error.message);
    throw error;
  }
}

async function semanticSearch(query, collectionName = 'functions', limit = 10) {
  if (!isConnected()) {
    console.warn('⚠️  ChromaDB not connected, returning empty results');
    return [];
  }
  
  try {
    const collection = collections[collectionName];
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    const results = await collection.query({
      queryTexts: [query],
      nResults: limit
    });

    return formatSearchResults(results);
  } catch (error) {
    console.error('Error performing semantic search:', error.message);
    throw error;
  }
}

async function searchFunctions(query, limit = 10) {
  return semanticSearch(query, 'functions', limit);
}

async function searchDocumentation(query, limit = 10) {
  return semanticSearch(query, 'documentation', limit);
}

async function searchDecisions(query, limit = 10) {
  return semanticSearch(query, 'decisions', limit);
}

async function searchIncidents(query, limit = 10) {
  return semanticSearch(query, 'incidents', limit);
}

async function multiCollectionSearch(query, limit = 5) {
  const [functions, docs, decisions, incidents] = await Promise.all([
    searchFunctions(query, limit),
    searchDocumentation(query, limit),
    searchDecisions(query, limit),
    searchIncidents(query, limit)
  ]);

  return {
    functions,
    documentation: docs,
    decisions,
    incidents
  };
}

function formatFunctionForEmbedding(functionData) {
  const params = functionData.params?.join(', ') || '';
  return `Function: ${functionData.name}(${params}) in ${functionData.filePath} at line ${functionData.line}`;
}

function formatSearchResults(results) {
  if (!results.ids || results.ids.length === 0) return [];

  const formatted = [];
  for (let i = 0; i < results.ids[0].length; i++) {
    formatted.push({
      id: results.ids[0][i],
      document: results.documents?.[0]?.[i] || '',
      metadata: results.metadatas?.[0]?.[i] || {},
      distance: results.distances?.[0]?.[i] || 0
    });
  }
  return formatted;
}

async function deleteFunction(functionId) {
  try {
    await collections.functions.delete({
      ids: [functionId]
    });
    return { success: true };
  } catch (error) {
    console.error('Error deleting function:', error.message);
    throw error;
  }
}

async function getCollectionStats() {
  if (!isConnected()) {
    console.warn('⚠️  ChromaDB not connected, returning empty stats');
    return {
      functions: { count: 0, error: 'Not connected' },
      documentation: { count: 0, error: 'Not connected' },
      decisions: { count: 0, error: 'Not connected' },
      incidents: { count: 0, error: 'Not connected' }
    };
  }
  
  const stats = {};
  for (const [name, collection] of Object.entries(collections)) {
    try {
      const count = await collection.count();
      stats[name] = { count };
    } catch (error) {
      stats[name] = { count: 0, error: error.message };
    }
  }
  return stats;
}

module.exports = {
  initializeChroma,
  addFunction,
  addDocumentation,
  addDecision,
  addIncident,
  semanticSearch,
  searchFunctions,
  searchDocumentation,
  searchDecisions,
  searchIncidents,
  multiCollectionSearch,
  formatFunctionForEmbedding,
  formatSearchResults,
  deleteFunction,
  getCollectionStats
};
