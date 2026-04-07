const { ChromaClient } = require('chromadb');
require('dotenv').config();

let client = null;
const collections = {
  functions: null,
  documentation: null,
  decisions: null,
  incidents: null
};

async function connect() {
  try {
    client = new ChromaClient({
      path: `http://${process.env.CHROMA_HOST || 'localhost'}:${process.env.CHROMA_PORT || 8000}`
    });

    await client.heartbeat();
    console.log('✅ ChromaDB connected successfully');
    await initializeCollections();
  } catch (error) {
    console.error('❌ ChromaDB connection error:', error);
    console.warn('⚠️  Make sure ChromaDB is running (docker run -p 8000:8000 chromadb/chroma)');
    throw error;
  }
}

async function initializeCollections() {
  try {
    collections.functions = await client.getOrCreateCollection({
      name: 'functions',
      metadata: { description: 'Function embeddings for semantic search' }
    });

    collections.documentation = await client.getOrCreateCollection({
      name: 'documentation',
      metadata: { description: 'API documentation and ADRs' }
    });

    collections.decisions = await client.getOrCreateCollection({
      name: 'decisions',
      metadata: { description: 'Architecture Decision Records (ADRs)' }
    });

    collections.incidents = await client.getOrCreateCollection({
      name: 'incidents',
      metadata: { description: 'Historical incidents and resolutions' }
    });

    console.log('✅ ChromaDB collections initialized');
  } catch (error) {
    console.error('Error initializing collections:', error);
    throw error;
  }
}

function getClient() {
  if (!client) {
    throw new Error('ChromaDB client not initialized. Call connect() first.');
  }
  return client;
}

function isConnected() {
  return client !== null && collections.functions !== null;
}

function getCollection(name) {
  if (!collections[name]) {
    return null; // Return null instead of throwing
  }
  return collections[name];
}

async function close() {
  console.log('ChromaDB connection closed');
}

module.exports = {
  connect,
  initializeCollections,
  getClient,
  getCollection,
  isConnected,
  close
};
