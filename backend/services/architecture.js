const neo4jService = require('./neo4j');
const ASTModel = require('../model/AST');

class ArchitectureService {
  constructor() {
    this.architectureGraph = {
      nodes: [],
      edges: [],
      metadata: {
        lastBuilt: null,
        workspace: null,
        organization: null
      }
    };
  }

  /**
   * Build the complete architecture graph from existing data
   * Transforms low-level code graph into high-level architecture
   */
  async buildArchitectureGraph(workspace = null, organization = null) {
    try {
      console.log('Building architecture graph...');
      
      const nodes = [];
      const edges = [];

      // 1. Identify Services from file structure
      const services = await this.identifyServices();
      nodes.push(...services.map(s => ({
        id: s.id,
        type: 'SERVICE',
        label: s.name,
        data: {
          name: s.name,
          owner: s.owner,
          description: s.description,
          files: s.files,
          path: s.path,
          expandable: true,
          expanded: false
        },
        position: this.generatePosition(nodes.length)
      })));

      // 2. Extract APIs from endpoints and functions
      const apis = await this.extractAPIs();
      nodes.push(...apis.map(a => ({
        id: a.id,
        type: 'API',
        label: a.name,
        data: {
          name: a.name,
          owner: a.owner,
          endpoint: a.endpoint,
          method: a.method,
          service: a.service,
          expandable: true,
          expanded: false
        },
        position: this.generatePosition(nodes.length)
      })));

      // Create SERVICE -> EXPOSES -> API edges
      apis.forEach(api => {
        if (api.service) {
          edges.push({
            id: `${api.service}-exposes-${api.id}`,
            source: api.service,
            target: api.id,
            type: 'EXPOSES',
            label: 'exposes'
          });
        }
      });

      // 3. Infer Databases from imports and connections
      const databases = await this.inferDatabases();
      nodes.push(...databases.map(db => ({
        id: db.id,
        type: 'DATABASE',
        label: db.name,
        data: {
          name: db.name,
          owner: db.owner,
          dbType: db.type,
          usedBy: db.usedBy,
          expandable: true,
          expanded: false
        },
        position: this.generatePosition(nodes.length)
      })));

      // Create SERVICE -> USES -> DATABASE edges
      databases.forEach(db => {
        db.usedBy.forEach(serviceId => {
          edges.push({
            id: `${serviceId}-uses-${db.id}`,
            source: serviceId,
            target: db.id,
            type: 'USES',
            label: 'uses'
          });
        });
      });

      // 4. Get ADRs (Architecture Decision Records) if any exist
      const adrs = await this.getADRs();
      nodes.push(...adrs.map(adr => ({
        id: adr.id,
        type: 'ADR',
        label: adr.title,
        data: {
          title: adr.title,
          owner: adr.owner,
          decision: adr.decision,
          date: adr.date,
          affects: adr.affects,
          expandable: false,
          expanded: false
        },
        position: this.generatePosition(nodes.length)
      })));

      // Create ADR -> AFFECTS -> SERVICE/API edges
      adrs.forEach(adr => {
        adr.affects.forEach(targetId => {
          edges.push({
            id: `${adr.id}-affects-${targetId}`,
            source: adr.id,
            target: targetId,
            type: 'AFFECTS',
            label: 'affects'
          });
        });
      });

      // 5. Get Incidents if any exist
      const incidents = await this.getIncidents();
      nodes.push(...incidents.map(inc => ({
        id: inc.id,
        type: 'INCIDENT',
        label: inc.title,
        data: {
          title: inc.title,
          severity: inc.severity,
          date: inc.date,
          affects: inc.affects,
          status: inc.status,
          expandable: false,
          expanded: false
        },
        position: this.generatePosition(nodes.length)
      })));

      // Create INCIDENT -> IMPACTS -> SERVICE/API edges
      incidents.forEach(inc => {
        inc.affects.forEach(targetId => {
          edges.push({
            id: `${inc.id}-impacts-${targetId}`,
            source: inc.id,
            target: targetId,
            type: 'IMPACTS',
            label: 'impacts'
          });
        });
      });

      // 6. Add inter-service dependencies
      const serviceDeps = await this.extractServiceDependencies(services);
      edges.push(...serviceDeps);

      this.architectureGraph = {
        nodes,
        edges,
        metadata: {
          lastBuilt: new Date().toISOString(),
          workspace,
          organization,
          stats: {
            services: services.length,
            apis: apis.length,
            databases: databases.length,
            adrs: adrs.length,
            incidents: incidents.length
          }
        }
      };

      // Store in Neo4j for persistence
      await this.saveArchitectureToNeo4j();

      console.log(`Architecture graph built: ${nodes.length} nodes, ${edges.length} edges`);
      return this.architectureGraph;
    } catch (error) {
      console.error('Error building architecture graph:', error);
      throw error;
    }
  }

  /**
   * Get the current architecture graph
   * First checks Neo4j for seeded/existing data, then falls back to built graph
   */
  async getArchitectureGraph(filter = {}) {
    // First try to get data from Neo4j (includes seeded test data)
    const neo4jGraph = await this.getGraphFromNeo4j(filter);
    if (neo4jGraph.nodes.length > 0) {
      return neo4jGraph;
    }

    // Fall back to built graph from code analysis
    if (!this.architectureGraph.nodes.length) {
      await this.buildArchitectureGraph();
    }

    let graph = { ...this.architectureGraph };

    // Apply filters
    if (filter.type) {
      graph.nodes = graph.nodes.filter(n => n.type === filter.type);
      const nodeIds = new Set(graph.nodes.map(n => n.id));
      graph.edges = graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }

    if (filter.workspace) {
      // Filter by workspace path
      graph.nodes = graph.nodes.filter(n => 
        n.data.path && n.data.path.startsWith(filter.workspace)
      );
    }

    return graph;
  }

  /**
   * Query Neo4j for architecture graph nodes and relationships
   */
  async getGraphFromNeo4j(filter = {}) {
    const session = neo4jService.getSession();
    if (!session) {
      return { nodes: [], edges: [] };
    }

    try {
      // Build query based on filters
      let nodeQuery = 'MATCH (n:Node)';
      const params = {};
      
      if (filter.type) {
        nodeQuery += ' WHERE n.type = $type';
        params.type = filter.type;
      }

      // Get nodes
      const nodesResult = await session.run(
        `${nodeQuery}
         RETURN n.id AS id, n.label AS label, n.type AS type, 
                n.description AS description, n.language AS language, 
                n.filePath AS filePath, n.severity AS severity, 
                n.status AS status`,
        params
      );

      const nodes = nodesResult.records.map((record, index) => ({
        id: record.get('id'),
        type: 'architectureFunc',
        position: this.generatePosition(index),
        data: {
          label: record.get('label'),
          type: record.get('type'),
          description: record.get('description'),
          language: record.get('language'),
          filePath: record.get('filePath'),
          severity: record.get('severity'),
          status: record.get('status')
        }
      }));

      // Get edges
      let edgeQuery = `
        MATCH (n:Node)-[r]->(m:Node)
        RETURN n.id AS source, m.id AS target, type(r) AS relType, r.type AS edgeType, r.label AS label
      `;

      const edgesResult = await session.run(edgeQuery);

      const edges = edgesResult.records.map((record, index) => ({
        id: `edge-${index}`,
        source: record.get('source'),
        target: record.get('target'),
        type: record.get('edgeType') || record.get('relType')?.toLowerCase(),
        label: record.get('label')
      }));

      // Filter edges to only include those connecting visible nodes
      const nodeIds = new Set(nodes.map(n => n.id));
      const filteredEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

      return { nodes, edges: filteredEdges };
    } catch (error) {
      console.error('Error querying Neo4j for graph:', error.message);
      return { nodes: [], edges: [] };
    } finally {
      await session.close();
    }
  }

  /**
   * Expand a specific node to show its dependencies and sub-services
   * This is key for the interactive graph behavior
   */
  async expandNode(nodeId) {
    try {
      const node = this.architectureGraph.nodes.find(n => n.id === nodeId);
      if (!node) {
        throw new Error(`Node ${nodeId} not found`);
      }

      const expansionData = {
        nodeId,
        type: node.type,
        children: [],
        dependencies: [],
        details: {}
      };

      switch (node.type) {
        case 'SERVICE':
          // Get all functions/classes in this service
          const serviceFunctions = await this.getServiceFunctions(nodeId);
          expansionData.children = serviceFunctions;

          // Get service dependencies (other services it depends on)
          const serviceDeps = await this.getServiceDependencies(nodeId);
          expansionData.dependencies = serviceDeps;

          // Get detailed metrics
          expansionData.details = await this.getServiceDetails(nodeId);
          break;

        case 'API':
          // Get function implementation details
          const apiDetails = await this.getAPIDetails(nodeId);
          expansionData.details = apiDetails;

          // Get dependencies (what it calls)
          const apiDeps = await this.getAPIDependencies(nodeId);
          expansionData.dependencies = apiDeps;
          break;

        case 'DATABASE':
          // Get collections/schema info
          const dbSchema = await this.getDatabaseSchema(nodeId);
          expansionData.details = dbSchema;

          // Get queries/operations
          const dbOps = await this.getDatabaseOperations(nodeId);
          expansionData.children = dbOps;
          break;

        default:
          break;
      }

      // Mark node as expanded
      node.data.expanded = true;

      return expansionData;
    } catch (error) {
      console.error('Error expanding node:', error);
      throw error;
    }
  }

  /**
   * Identify services from file structure and Neo4j data
   */
  async identifyServices() {
    const services = [];

    // Get all Service nodes from Neo4j
    const query = `
      MATCH (s:Service)
      OPTIONAL MATCH (s)<-[:BELONGS_TO]-(f:Function)
      OPTIONAL MATCH (s)<-[:BELONGS_TO]-(file:File)
      RETURN s.name as name, 
             s.path as path,
             collect(DISTINCT f.name) as functions,
             collect(DISTINCT file.path) as files
    `;

    const result = await neo4jService.runQuery(query);

    result.records.forEach((record, index) => {
      const name = record.get('name');
      const path = record.get('path');
      const files = record.get('files') || [];
      
      services.push({
        id: `service-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        owner: this.inferOwner(path || name),
        description: `Service handling ${name} functionality`,
        files,
        path
      });
    });

    // If no services in Neo4j, infer from file structure
    if (services.length === 0) {
      const asts = await ASTModel.find({});
      const folderMap = new Map();

      asts.forEach(ast => {
        const parts = ast.filePath.split('/');
        const folder = parts[parts.length - 2] || 'root';
        
        if (!folderMap.has(folder)) {
          folderMap.set(folder, []);
        }
        folderMap.get(folder).push(ast.filePath);
      });

      folderMap.forEach((files, folder) => {
        services.push({
          id: `service-${folder}`,
          name: folder.charAt(0).toUpperCase() + folder.slice(1),
          owner: this.inferOwner(folder),
          description: `${folder} service`,
          files,
          path: folder
        });
      });
    }

    return services;
  }

  /**
   * Extract APIs from function names and endpoints
   */
  async extractAPIs() {
    const apis = [];

    // Get functions that look like API endpoints
    const query = `
      MATCH (f:Function)
      OPTIONAL MATCH (f)-[:BELONGS_TO]->(s:Service)
      RETURN f.name as name, 
             f.startLine as startLine,
             f.endLine as endLine,
             s.name as service,
             f.id as id
    `;

    const result = await neo4jService.runQuery(query);

    result.records.forEach(record => {
      const name = record.get('name');
      const service = record.get('service');
      const id = record.get('id') || `api-${name}`;

      // Detect API-like functions
      if (this.isAPIFunction(name)) {
        const endpoint = this.extractEndpoint(name);
        apis.push({
          id: `api-${id}`,
          name,
          owner: this.inferOwner(service || 'platform'),
          endpoint: endpoint.path,
          method: endpoint.method,
          service: service ? `service-${service.toLowerCase().replace(/\s+/g, '-')}` : null
        });
      }
    });

    return apis;
  }

  /**
   * Infer databases from imports and connections
   */
  async inferDatabases() {
    const databases = [];
    const dbMap = new Map();

    // Get all ASTs and look for database imports
    const asts = await ASTModel.find({});

    asts.forEach(ast => {
      if (ast.parseResult && ast.parseResult.imports) {
        ast.parseResult.imports.forEach(imp => {
          const source = imp.source || imp;
          
          if (source.includes('mongoose') || source.includes('mongodb')) {
            if (!dbMap.has('mongodb')) {
              dbMap.set('mongodb', new Set());
            }
            dbMap.get('mongodb').add(this.extractServiceFromPath(ast.filePath));
          }
          
          if (source.includes('neo4j')) {
            if (!dbMap.has('neo4j')) {
              dbMap.set('neo4j', new Set());
            }
            dbMap.get('neo4j').add(this.extractServiceFromPath(ast.filePath));
          }
          
          if (source.includes('chromadb') || source.includes('chroma')) {
            if (!dbMap.has('chromadb')) {
              dbMap.set('chromadb', new Set());
            }
            dbMap.get('chromadb').add(this.extractServiceFromPath(ast.filePath));
          }
        });
      }
    });

    dbMap.forEach((services, dbType) => {
      databases.push({
        id: `db-${dbType}`,
        name: this.formatDBName(dbType),
        owner: 'team-data',
        type: dbType,
        usedBy: Array.from(services).map(s => `service-${s}`)
      });
    });

    return databases;
  }

  /**
   * Get ADRs (Architecture Decision Records) from Neo4j
   */
  async getADRs() {
    const adrs = [];

    const query = `
      MATCH (adr:ADR)
      OPTIONAL MATCH (adr)-[:AFFECTS]->(target)
      RETURN adr.id as id,
             adr.title as title,
             adr.decision as decision,
             adr.owner as owner,
             adr.date as date,
             collect(target.id) as affects
    `;

    try {
      const result = await neo4jService.runQuery(query);
      result.records.forEach(record => {
        adrs.push({
          id: record.get('id'),
          title: record.get('title'),
          decision: record.get('decision'),
          owner: record.get('owner') || 'team-architecture',
          date: record.get('date'),
          affects: record.get('affects') || []
        });
      });
    } catch (error) {
      // ADRs might not exist yet
      console.log('No ADRs found');
    }

    return adrs;
  }

  /**
   * Get Incidents from Neo4j
   */
  async getIncidents() {
    const incidents = [];

    const query = `
      MATCH (inc:INCIDENT)
      OPTIONAL MATCH (inc)-[:IMPACTS]->(target)
      RETURN inc.id as id,
             inc.title as title,
             inc.severity as severity,
             inc.status as status,
             inc.date as date,
             collect(target.id) as affects
    `;

    try {
      const result = await neo4jService.runQuery(query);
      result.records.forEach(record => {
        incidents.push({
          id: record.get('id'),
          title: record.get('title'),
          severity: record.get('severity') || 'medium',
          status: record.get('status') || 'open',
          date: record.get('date'),
          affects: record.get('affects') || []
        });
      });
    } catch (error) {
      // Incidents might not exist yet
      console.log('No incidents found');
    }

    return incidents;
  }

  /**
   * Extract service-to-service dependencies
   */
  async extractServiceDependencies(services) {
    const edges = [];

    // Get import relationships from AST
    const asts = await ASTModel.find({});
    const importMap = new Map();

    asts.forEach(ast => {
      const fromService = this.extractServiceFromPath(ast.filePath);
      
      if (ast.parseResult && ast.parseResult.imports) {
        ast.parseResult.imports.forEach(imp => {
          const source = imp.source || imp;
          // Check if importing from another service
          const toService = this.extractServiceFromImport(source);
          if (toService && toService !== fromService) {
            const key = `${fromService}->${toService}`;
            importMap.set(key, (importMap.get(key) || 0) + 1);
          }
        });
      }
    });

    importMap.forEach((count, key) => {
      const [from, to] = key.split('->');
      edges.push({
        id: `service-${from}-depends-service-${to}`,
        source: `service-${from}`,
        target: `service-${to}`,
        type: 'DEPENDS_ON',
        label: `depends on (${count})`,
        data: { importCount: count }
      });
    });

    return edges;
  }

  /**
   * Get functions in a service (for expansion)
   */
  async getServiceFunctions(serviceId) {
    const query = `
      MATCH (s:Service {id: $serviceId})<-[:BELONGS_TO]-(f:Function)
      RETURN f.name as name, f.id as id, f.startLine as line
      LIMIT 20
    `;

    const serviceName = serviceId.replace('service-', '');
    const result = await neo4jService.runQuery(query, { serviceId: serviceName });

    return result.records.map(record => ({
      id: record.get('id'),
      name: record.get('name'),
      type: 'FUNCTION',
      line: record.get('line')
    }));
  }

  /**
   * Get service dependencies (what it imports)
   */
  async getServiceDependencies(serviceId) {
    const edges = this.architectureGraph.edges.filter(e => 
      e.source === serviceId && e.type === 'DEPENDS_ON'
    );

    return edges.map(e => ({
      targetId: e.target,
      type: e.type,
      imports: e.data?.importCount || 0
    }));
  }

  /**
   * Get detailed service metrics
   */
  async getServiceDetails(serviceId) {
    const node = this.architectureGraph.nodes.find(n => n.id === serviceId);
    
    return {
      files: node?.data?.files?.length || 0,
      apis: this.architectureGraph.nodes.filter(n => 
        n.type === 'API' && n.data.service === serviceId
      ).length,
      dependencies: this.architectureGraph.edges.filter(e => 
        e.source === serviceId
      ).length
    };
  }

  /**
   * Get API implementation details
   */
  async getAPIDetails(apiId) {
    const functionName = apiId.replace('api-', '');
    
    const query = `
      MATCH (f:Function {id: $apiId})
      OPTIONAL MATCH (f)-[:CALLS]->(other:Function)
      RETURN f.name as name,
             f.startLine as startLine,
             f.endLine as endLine,
             collect(other.name) as calls
    `;

    try {
      const result = await neo4jService.runQuery(query, { apiId: functionName });
      if (result.records.length > 0) {
        const record = result.records[0];
        return {
          name: record.get('name'),
          lines: `${record.get('startLine')}-${record.get('endLine')}`,
          calls: record.get('calls') || []
        };
      }
    } catch (error) {
      console.log('Could not get API details');
    }

    return {};
  }

  /**
   * Get API dependencies
   */
  async getAPIDependencies(apiId) {
    const query = `
      MATCH (f:Function {id: $apiId})-[:CALLS]->(other:Function)
      RETURN other.name as name, other.id as id
    `;

    const functionName = apiId.replace('api-', '');
    
    try {
      const result = await neo4jService.runQuery(query, { apiId: functionName });
      return result.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        type: 'FUNCTION_CALL'
      }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get database schema information
   */
  async getDatabaseSchema(dbId) {
    const dbType = dbId.replace('db-', '');
    
    // This would need to be implemented based on actual DB introspection
    return {
      type: dbType,
      collections: [],
      schemas: []
    };
  }

  /**
   * Get database operations
   */
  async getDatabaseOperations(dbId) {
    return [];
  }

  /**
   * Save architecture graph to Neo4j for persistence
   */
  async saveArchitectureToNeo4j() {
    try {
      // Create architecture nodes
      for (const node of this.architectureGraph.nodes) {
        await neo4jService.runQuery(
          `MERGE (n:ArchNode {id: $id})
           SET n.type = $type,
               n.label = $label,
               n.data = $data`,
          {
            id: node.id,
            type: node.type,
            label: node.label,
            data: JSON.stringify(node.data)
          }
        );
      }

      // Create architecture edges
      for (const edge of this.architectureGraph.edges) {
        await neo4jService.runQuery(
          `MATCH (a:ArchNode {id: $source})
           MATCH (b:ArchNode {id: $target})
           MERGE (a)-[r:${edge.type}]->(b)
           SET r.label = $label`,
          {
            source: edge.source,
            target: edge.target,
            label: edge.label
          }
        );
      }

      console.log('Architecture graph saved to Neo4j');
    } catch (error) {
      console.error('Error saving architecture to Neo4j:', error);
    }
  }

  /**
   * Add a new ADR (Architecture Decision Record)
   */
  async addADR(adr) {
    const id = adr.id || `adr-${Date.now()}`;
    
    await neo4jService.runQuery(
      `CREATE (adr:ADR {
        id: $id,
        title: $title,
        decision: $decision,
        owner: $owner,
        date: $date
      })`,
      {
        id,
        title: adr.title,
        decision: adr.decision,
        owner: adr.owner || 'team-architecture',
        date: adr.date || new Date().toISOString()
      }
    );

    // Create AFFECTS relationships
    if (adr.affects) {
      for (const targetId of adr.affects) {
        await neo4jService.runQuery(
          `MATCH (adr:ADR {id: $adrId})
           MATCH (target:ArchNode {id: $targetId})
           MERGE (adr)-[:AFFECTS]->(target)`,
          { adrId: id, targetId }
        );
      }
    }

    return { id, ...adr };
  }

  /**
   * Add a new Incident
   */
  async addIncident(incident) {
    const id = incident.id || `inc-${Date.now()}`;
    
    await neo4jService.runQuery(
      `CREATE (inc:INCIDENT {
        id: $id,
        title: $title,
        severity: $severity,
        status: $status,
        date: $date
      })`,
      {
        id,
        title: incident.title,
        severity: incident.severity || 'medium',
        status: incident.status || 'open',
        date: incident.date || new Date().toISOString()
      }
    );

    // Create IMPACTS relationships
    if (incident.affects) {
      for (const targetId of incident.affects) {
        await neo4jService.runQuery(
          `MATCH (inc:INCIDENT {id: $incId})
           MATCH (target:ArchNode {id: $targetId})
           MERGE (inc)-[:IMPACTS]->(target)`,
          { incId: id, targetId }
        );
      }
    }

    return { id, ...incident };
  }

  // Helper methods
  isAPIFunction(name) {
    const apiPatterns = [
      /^get/i, /^post/i, /^put/i, /^delete/i, /^patch/i,
      /handler$/i, /controller$/i, /route$/i, /endpoint$/i,
      /api/i
    ];
    return apiPatterns.some(pattern => pattern.test(name));
  }

  extractEndpoint(functionName) {
    const method = ['get', 'post', 'put', 'delete', 'patch'].find(m => 
      functionName.toLowerCase().startsWith(m)
    ) || 'GET';
    
    const path = functionName
      .replace(new RegExp(`^${method}`, 'i'), '')
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
    
    return { method: method.toUpperCase(), path: `/${path}` };
  }

  inferOwner(name) {
    const ownerMap = {
      auth: 'team-security',
      user: 'team-platform',
      payment: 'team-commerce',
      order: 'team-commerce',
      product: 'team-catalog',
      api: 'team-platform',
      service: 'team-platform',
      data: 'team-data',
      graph: 'team-graph',
      mongodb: 'team-data',
      neo4j: 'team-graph',
      chromadb: 'team-platform'
    };

    const key = Object.keys(ownerMap).find(k => 
      name.toLowerCase().includes(k)
    );
    
    return ownerMap[key] || 'team-platform';
  }

  extractServiceFromPath(filePath) {
    const parts = filePath.split('/');
    return (parts[parts.length - 2] || 'root').toLowerCase();
  }

  extractServiceFromImport(importPath) {
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      const parts = importPath.split('/');
      return parts[1] || parts[0];
    }
    return null;
  }

  formatDBName(dbType) {
    const names = {
      mongodb: 'MongoDB',
      neo4j: 'Knowledge Graph DB',
      chromadb: 'Vector DB'
    };
    return names[dbType] || dbType;
  }

  generatePosition(index) {
    // Circular layout for initial positioning
    const radius = 300;
    const angle = (index * 2 * Math.PI) / 10;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle)
    };
  }
}

module.exports = new ArchitectureService();
