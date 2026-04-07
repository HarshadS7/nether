# KA-CHOW: Autonomous Engineering Brain - Backend

A graph-backed, agent-driven backend system that continuously models software architecture, performs deterministic impact analysis using Neo4j, enables semantic retrieval using ChromaDB, and uses an LLM purely for explainable synthesis.

## 🎯 Overview

KA-CHOW addresses modern software engineering challenges:
- **Fragmented Knowledge**: Unifies code, docs, and architecture decisions
- **Outdated Documentation**: Auto-generates and maintains documentation
- **Poor Impact Visibility**: Deterministic blast radius analysis
- **Architecture Drift**: Continuous architecture modeling
- **Slow Onboarding**: Automated onboarding guides
- **Context Loss**: Maintains living knowledge graph

## 🏗️ Architecture

```
Code Input
    ↓
AST Parsing (JavaScript, Python, Java, Go)
    ↓
Symbol & Dependency Extraction
    ↓
Neo4j Knowledge Graph Update
    ↓
Embedding Storage in ChromaDB
    ↓
Graph + Vector Retrieval
    ↓
LLM Explanation
```

### Core Components

1. **Neo4j Knowledge Graph** - Source of truth for system structure
2. **ChromaDB Vector Store** - Semantic search and retrieval
3. **Multi-Language AST Parsers** - Extract structure from code
4. **Impact Analysis Engine** - Graph-based dependency analysis
5. **LLM Layer** - Explanations and documentation generation

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **Neo4j** >= 5.x
- **ChromaDB** running instance
- **OpenAI API Key**

### Installation

1. **Clone and navigate to backend**
```bash
cd backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Server
PORT=5000
NODE_ENV=development

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password

# ChromaDB
CHROMA_HOST=localhost
CHROMA_PORT=8000

# OpenAI
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4-turbo-preview
```

4. **Start Neo4j**
```bash
# Using Docker
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your_password \
  neo4j:latest
```

5. **Start ChromaDB**
```bash
# Using Docker
docker run -d \
  --name chromadb \
  -p 8000:8000 \
  chromadb/chroma:latest
```

6. **Start the backend**
```bash
npm run dev
```

The server will start on `http://localhost:5000`

## 📚 API Documentation

### Ingestion

#### Ingest Codebase
```http
POST /api/ingest/codebase
Content-Type: application/json

{
  "codebasePath": "/path/to/your/codebase",
  "serviceName": "my-service",
  "options": {
    "type": "microservice",
    "language": "javascript",
    "excludeDirs": ["node_modules", "dist"]
  }
}
```

#### Get Ingestion Status
```http
GET /api/ingest/status/:serviceName
```

### Query

#### Ask Architecture Question
```http
POST /api/query/ask
Content-Type: application/json

{
  "question": "How does authentication work in this system?"
}
```

#### Search Functions
```http
GET /api/query/functions?query=authentication&limit=10
```

#### Get Service Architecture
```http
GET /api/query/architecture/:serviceName
```

#### Semantic Search
```http
GET /api/query/semantic?query=payment processing&collection=functions&limit=10
```

### Impact Analysis

#### Analyze Single Node Impact
```http
GET /api/impact/analyze/:nodeId?maxDepth=3&includeReverse=true&generateExplanation=true
```

#### Analyze Multiple Changes
```http
POST /api/impact/changes
Content-Type: application/json

{
  "changes": [
    { "nodeId": "src/auth/login.js:authenticate:45" },
    { "nodeId": "src/api/users.js:getUser:23" }
  ],
  "maxDepth": 3
}
```

#### Get Testing Recommendations
```http
GET /api/impact/testing/:nodeId
```

#### Get Dependency Chain
```http
GET /api/impact/chain?fromId=node1&toId=node2&maxDepth=5
```

### Health Monitoring

#### Get System Health
```http
GET /api/health
```

Returns:
```json
{
  "success": true,
  "health": {
    "metrics": {
      "services": 5,
      "files": 234,
      "functions": 1523,
      "endpoints": 87,
      "dependencies": 2341
    },
    "issues": {
      "orphanFunctions": 12,
      "highComplexityFunctions": 8
    },
    "analysis": "AI-generated health analysis..."
  }
}
```

#### Get Orphan Functions
```http
GET /api/health/orphans
```

#### Get High Complexity Functions
```http
GET /api/health/complex?threshold=10
```

### Documentation

#### Generate Service Documentation
```http
GET /api/docs/service/:serviceName
```

#### Generate Onboarding Guide
```http
GET /api/docs/onboarding/:serviceName
```

#### Get Refactoring Suggestions
```http
GET /api/docs/refactor/:functionId
```

## 🔧 Project Structure

```
backend/
├── controller/          # Request handlers
│   ├── ingest.controller.js
│   ├── query.controller.js
│   ├── impact.controller.js
│   ├── health.controller.js
│   └── documentation.controller.js
├── db/                  # Database connections
│   ├── neo4j.js
│   └── chroma.js
├── middleware/          # Express middleware
│   ├── error.js
│   └── index.js
├── router/              # API routes
│   ├── ingest.routes.js
│   ├── query.routes.js
│   ├── impact.routes.js
│   ├── health.routes.js
│   ├── documentation.routes.js
│   └── index.js
├── services/            # Business logic
│   ├── neo4j.service.js
│   ├── chroma.service.js
│   ├── llm.service.js
│   ├── ingestion.service.js
│   └── impact.service.js
├── utils/               # Utilities
│   └── parsers/         # AST parsers
│       ├── javascript.js
│       ├── python.js
│       ├── java.js
│       ├── go.js
│       └── index.js
├── index.js             # Server entry point
├── package.json
└── .env.example
```

## 🔍 Supported Languages

- **JavaScript/TypeScript** (.js, .jsx, .ts, .tsx)
- **Python** (.py)
- **Java** (.java)
- **Go** (.go)

## 📊 Data Models

### Neo4j Graph Schema

**Nodes:**
- `Service`: Microservices or applications
- `File`: Source code files
- `Function`: Functions and methods
- `Endpoint`: API endpoints

**Relationships:**
- `BELONGS_TO`: File → Service
- `DEFINED_IN`: Function → File
- `CALLS`: Function → Function
- `DEPENDS_ON`: Generic dependency
- `HANDLED_BY`: Endpoint → Function
- `IMPORTS`: File → File

### ChromaDB Collections

- `functions`: Function embeddings for semantic search
- `documentation`: API docs and ADRs
- `decisions`: Architecture Decision Records
- `incidents`: Historical incidents

## 🧪 Testing

```bash
# Run tests (when implemented)
npm test

# Health check
curl http://localhost:5000/api/ping
```

## 🔐 Security Considerations

- API keys stored in environment variables
- Helmet.js for security headers
- CORS enabled
- Request size limits (10MB)
- Input validation on all endpoints

## 📈 Performance

- Batch processing for large codebases
- Configurable max file limits
- Connection pooling for databases
- Caching strategies (to be implemented)

## 🛠️ Development

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## 🐛 Troubleshooting

### Neo4j Connection Issues
- Ensure Neo4j is running: `docker ps`
- Check credentials in `.env`
- Verify port 7687 is accessible

### ChromaDB Connection Issues
- Start ChromaDB: `docker run -p 8000:8000 chromadb/chroma:latest`
- Check `CHROMA_HOST` and `CHROMA_PORT` in `.env`

### OpenAI API Issues
- Verify API key is valid
- Check API quota and limits
- Ensure internet connectivity

## 🚧 Roadmap

- [ ] Git integration for automatic updates
- [ ] Real-time change detection
- [ ] Architecture visualization endpoints
- [ ] Custom parser plugins
- [ ] Metrics dashboard
- [ ] Authentication & authorization
- [ ] Multi-tenant support
- [ ] Caching layer
- [ ] Batch API operations
- [ ] WebSocket support for real-time updates

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please follow the existing code style and add tests for new features.

## 📧 Support

For issues and questions, please open a GitHub issue.

---

**Built with ❤️ for better software engineering**
