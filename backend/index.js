// KA-CHOW: Autonomous Engineering Brain - Main Server
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Database connections
const { connect: connectNeo4j } = require('./db/neo4j');
const { connect: connectChroma } = require('./db/chroma');
const { connectMongoDB } = require('./db/connection');

// Services
const { initializeChroma } = require('./services/chroma');

const ingestRoutes = require("./router/ingestRoutes");
const queryRoutes = require("./router/queryRoutes");
const impactRoutes = require("./router/impactRoutes");
const healthRoutes = require("./router/healthRoutes");
const documentationRoutes = require("./router/documentationRoutes");
const pipelineRoutes = require("./router/pipelineRoutes");
const repositoryRoutes = require("./router/repositoryRoutes");
const githubRoutes = require("./router/githubRoutes");
const architectureRoutes = require("./router/architectureRoutes");
const workspaceRoutes = require("./router/workspaceRoutes");
const similarityRoutes = require("./router/similarityRoutes");
const commitsRoutes = require("./router/commitsRoutes");


// Background cron service - auto-starts to fetch commits every 15 minutes
require('./services/cronService');


const { errorHandler, notFoundHandler, requestLogger } = require('./middleware');


const PORT = process.env.PORT || 3000;
const app = express();

// Middleware setup
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);


app.use('/ingest', ingestRoutes);
app.use('/query', queryRoutes);
app.use('/impact', impactRoutes);
app.use('/health', healthRoutes);
app.use('/docs', documentationRoutes);
app.use('/pipeline', pipelineRoutes);
app.use('/repository', repositoryRoutes);
app.use('/github', githubRoutes);
app.use('/architecture', architectureRoutes);
app.use('/workspace', workspaceRoutes);
app.use('/similarity', similarityRoutes);
app.use('/commits', commitsRoutes);



// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'KA-CHOW: Autonomous Engineering Brain',
    version: '1.0.0',
    endpoints: {
      ingest: '/api/ingest',
      query: '/api/query',
      impact: '/api/impact',
      health: '/api/health',
      documentation: '/api/docs',
      pipeline: '/api/pipeline',
      repository: '/api/repository',
      github: '/github',
      commits: '/commits',
      similarity: '/similarity'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'KA-CHOW API is running',
    timestamp: new Date().toISOString()
  });
});


// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Connect to databases with resilient error handling
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kachow';

// Track database connection status
const dbStatus = {
  mongodb: false,
  neo4j: false,
  chroma: false
};

connectMongoDB(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    dbStatus.mongodb = true;
  })
  .catch((err) => {
    console.warn('⚠️  MongoDB connection failed (server will continue):', err.message);
  })
  .then(() => connectNeo4j())
  .then(() => {
    console.log('✅ Neo4j connected successfully');
    dbStatus.neo4j = true;
  })
  .catch((err) => {
    console.warn('⚠️  Neo4j connection failed (server will continue):', err.message);
  })
  .then(() => connectChroma())
  .then(() => {
    console.log('✅ ChromaDB connected successfully');
    dbStatus.chroma = true;
  })
  .catch((err) => {
    console.warn('⚠️  ChromaDB connection failed (server will continue):', err.message);
  })
  .then(() => initializeChroma())
  .catch((err) => {
    console.warn('⚠️  ChromaDB initialization failed (server will continue):', err.message);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT} in ${process.env.NODE_ENV} mode`);
      console.log(`📊 MongoDB: ${dbStatus.mongodb ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`🔍 Neo4j: ${dbStatus.neo4j ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`🎨 ChromaDB: ${dbStatus.chroma ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`🔐 Auth: API Key & GitHub OAuth enabled`);
    });
  });
