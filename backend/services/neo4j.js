const neo4jConnection = require('../db/neo4j');

function getSession() {
  if (!neo4jConnection.isConnected()) {
    return null;
  }
  return neo4jConnection.getDriver().session();
}

async function runQuery(query, params = {}) {
  if (!neo4jConnection.isConnected()) {
    console.warn('⚠️  Neo4j not connected, skipping query');
    return { records: [] };
  }
  
  const session = getSession();
  try {
    return await session.run(query, params);
  } finally {
    await session.close();
  }
}

async function createService(serviceData) {
  const result = await runQuery(
    `
    MERGE (s:Service {name: $name})
    SET s.type = $type,
        s.language = $language,
        s.version = $version,
        s.description = $description,
        s.updatedAt = datetime()
    RETURN s
    `,
    {
      name: serviceData.name,
      type: serviceData.type || 'service',
      language: serviceData.language,
      version: serviceData.version || '1.0.0',
      description: serviceData.description || ''
    }
  );

  return result.records[0]?.get('s').properties;
}

async function createFile(fileData) {
  const result = await runQuery(
    `
    MERGE (f:File {path: $path})
    SET f.language = $language,
        f.size = $size,
        f.updatedAt = datetime()
    RETURN f
    `,
    {
      path: fileData.path,
      language: fileData.language,
      size: fileData.size || 0
    }
  );

  return result.records[0]?.get('f').properties;
}

async function createFunction(functionData) {
  const result = await runQuery(
    `
    MERGE (fn:Function {id: $id})
    SET fn.name = $name,
        fn.filePath = $filePath,
        fn.line = $line,
        fn.endLine = $endLine,
        fn.params = $params,
        fn.returnType = $returnType,
        fn.isAsync = $isAsync,
        fn.complexity = $complexity,
        fn.updatedAt = datetime()
    RETURN fn
    `,
    {
      id:
        functionData.id ||
        `${functionData.filePath}:${functionData.name}:${functionData.line}`,
      name: functionData.name,
      filePath: functionData.filePath,
      line: functionData.line,
      endLine: functionData.endLine || functionData.line || 0,
      params: functionData.params || [],
      returnType: functionData.returnType || 'void',
      isAsync: functionData.isAsync || false,
      complexity: functionData.complexity || 1
    }
  );

  return result.records[0]?.get('fn').properties;
}

async function createEndpoint(endpointData) {
  const result = await runQuery(
    `
    MERGE (e:Endpoint {id: $id})
    SET e.method = $method,
        e.path = $path,
        e.handler = $handler,
        e.filePath = $filePath,
        e.line = $line,
        e.updatedAt = datetime()
    RETURN e
    `,
    {
      id: endpointData.id || `${endpointData.method}:${endpointData.path}`,
      method: endpointData.method,
      path: endpointData.path,
      handler: endpointData.handler || '',
      filePath: endpointData.filePath,
      line: endpointData.line
    }
  );

  return result.records[0]?.get('e').properties;
}

async function createDependency(fromId, toId, relationshipType = 'DEPENDS_ON') {
  // Whitelist allowed relationship types to prevent Cypher injection
  const ALLOWED_RELS = new Set(['DEPENDS_ON', 'CALLS', 'IMPORTS', 'DEFINES', 'INHERITS', 'CONTAINS', 'BELONGS_TO', 'DEFINED_IN', 'HANDLED_BY']);
  if (!ALLOWED_RELS.has(relationshipType)) {
    throw new Error(`Invalid relationship type: ${relationshipType}`);
  }

  await runQuery(
    `
    MATCH (from {id: $fromId})
    MATCH (to {id: $toId})
    MERGE (from)-[r:${relationshipType}]->(to)
    SET r.createdAt = coalesce(r.createdAt, datetime()),
        r.updatedAt = datetime()
    `,
    { fromId, toId }
  );
}

async function linkFileToService(filePath, serviceName) {
  await runQuery(
    `
    MATCH (f:File {path: $filePath})
    MATCH (s:Service {name: $serviceName})
    MERGE (f)-[r:BELONGS_TO]->(s)
    SET r.updatedAt = datetime()
    `,
    { filePath, serviceName }
  );
}

async function linkFunctionToFile(functionId, filePath) {
  await runQuery(
    `
    MATCH (fn:Function {id: $functionId})
    MATCH (f:File {path: $filePath})
    MERGE (fn)-[r:DEFINED_IN]->(f)
    SET r.updatedAt = datetime()
    `,
    { functionId, filePath }
  );
}

async function linkEndpointToFunction(endpointId, functionId) {
  await runQuery(
    `
    MATCH (e:Endpoint {id: $endpointId})
    MATCH (fn:Function {id: $functionId})
    MERGE (e)-[r:HANDLED_BY]->(fn)
    SET r.updatedAt = datetime()
    `,
    { endpointId, functionId }
  );
}

async function getImpactAnalysis(nodeId, maxDepth = 3) {
  // Sanitize maxDepth to prevent Cypher injection
  const safeDepth = Math.max(1, Math.min(10, parseInt(maxDepth) || 3));

  const result = await runQuery(
    `
    MATCH path = (start {id: $nodeId})-[*1..${safeDepth}]->(affected)
    RETURN DISTINCT affected, length(path) as depth, relationships(path) as rels
    ORDER BY depth
    `,
    { nodeId }
  );

  return result.records.map(r => ({
    node: r.get('affected').properties,
    depth: r.get('depth').toNumber(),
    relationships: r.get('rels').map(rel => rel.type)
  }));
}

async function getReverseImpactAnalysis(nodeId, maxDepth = 3) {
  // Sanitize maxDepth to prevent Cypher injection
  const safeDepth = Math.max(1, Math.min(10, parseInt(maxDepth) || 3));

  const result = await runQuery(
    `
    MATCH path = (dependent)-[*1..${safeDepth}]->(target {id: $nodeId})
    RETURN DISTINCT dependent, length(path) as depth, relationships(path) as rels
    ORDER BY depth
    `,
    { nodeId }
  );

  return result.records.map(r => ({
    node: r.get('dependent').properties,
    depth: r.get('depth').toNumber(),
    relationships: r.get('rels').map(rel => rel.type)
  }));
}

async function getServiceArchitecture(serviceName) {
  const result = await runQuery(
    `
    MATCH (s:Service {name: $serviceName})
    OPTIONAL MATCH (s)<-[:BELONGS_TO]-(f:File)
    OPTIONAL MATCH (f)<-[:DEFINED_IN]-(fn:Function)
    OPTIONAL MATCH (e:Endpoint)-[:HANDLED_BY]->(fn)
    RETURN s,
           collect(DISTINCT f) as files,
           collect(DISTINCT fn) as functions,
           collect(DISTINCT e) as endpoints
    `,
    { serviceName }
  );

  if (!result.records.length) return null;

  const r = result.records[0];

  return {
    service: r.get('s').properties,
    files: r.get('files').map(f => f.properties),
    functions: r.get('functions').map(fn => fn.properties),
    endpoints: r.get('endpoints').map(e => e.properties)
  };
}

async function getSystemHealth() {
  const result = await runQuery(`
    MATCH (s:Service)
    OPTIONAL MATCH (s)<-[:BELONGS_TO]-(f:File)
    OPTIONAL MATCH (f)<-[:DEFINED_IN]-(fn:Function)
    OPTIONAL MATCH (e:Endpoint)
    OPTIONAL MATCH (fn1:Function)-[d:DEPENDS_ON]->(fn2:Function)
    RETURN
      count(DISTINCT s) as serviceCount,
      count(DISTINCT f) as fileCount,
      count(DISTINCT fn) as functionCount,
      count(DISTINCT e) as endpointCount,
      count(DISTINCT d) as dependencyCount
  `);

  const r = result.records[0];

  return {
    services: r.get('serviceCount').toNumber(),
    files: r.get('fileCount').toNumber(),
    functions: r.get('functionCount').toNumber(),
    endpoints: r.get('endpointCount').toNumber(),
    dependencies: r.get('dependencyCount').toNumber()
  };
}

async function findOrphanFunctions() {
  const result = await runQuery(`
    MATCH (fn:Function)
    WHERE NOT (fn)<-[:CALLS]-() AND NOT (fn)<-[:HANDLED_BY]-()
    RETURN fn
    LIMIT 100
  `);

  return result.records.map(r => r.get('fn').properties);
}

async function getHighComplexityFunctions(threshold = 10) {
  const result = await runQuery(
    `
    MATCH (fn:Function)
    WHERE fn.complexity > $threshold
    RETURN fn
    ORDER BY fn.complexity DESC
    LIMIT 50
    `,
    { threshold }
  );

  return result.records.map(r => r.get('fn').properties);
}

async function searchNodes(query, nodeType = null) {
  // Validate nodeType to prevent Cypher injection via label filter
  const ALLOWED_TYPES = new Set(['Service', 'File', 'Function', 'Endpoint']);
  let nodeFilter = '';
  if (nodeType && ALLOWED_TYPES.has(nodeType)) {
    nodeFilter = `:${nodeType}`;
  } else if (nodeType) {
    throw new Error(`Invalid node type: ${nodeType}`);
  }

  const result = await runQuery(
    `
    MATCH (n${nodeFilter})
    WHERE toLower(n.name) CONTAINS toLower($query)
       OR toLower(n.path) CONTAINS toLower($query)
       OR toLower(n.id) CONTAINS toLower($query)
    RETURN n
    LIMIT 50
    `,
    { query }
  );

  return result.records.map(r => ({
    ...r.get('n').properties,
    labels: r.get('n').labels
  }));
}

// Get database metrics (node and relationship counts)
async function getDatabaseMetrics() {
  try {
    if (!neo4jConnection.isConnected()) {
      return { totalNodes: 0, totalRelationships: 0 };
    }

    // Query total nodes
    const nodeResult = await runQuery('MATCH (n) RETURN count(n) as total');
    const totalNodes = nodeResult.records[0]?.get('total').toNumber() || 0;

    // Query total relationships
    const relResult = await runQuery('MATCH ()-[r]->() RETURN count(r) as total');
    const totalRelationships = relResult.records[0]?.get('total').toNumber() || 0;

    return {
      totalNodes,
      totalRelationships
    };
  } catch (error) {
    console.error('Error getting Neo4j metrics:', error.message);
    return { totalNodes: 0, totalRelationships: 0 };
  }
}

// Get detailed database statistics
async function getDatabaseStatistics() {
  try {
    if (!neo4jConnection.isConnected()) {
      return null;
    }

    // Get node counts by label
    const labelCounts = await runQuery(`
      CALL db.labels() YIELD label
      CALL apoc.cypher.run('MATCH (n:' + label + ') RETURN count(n) as count', {}) YIELD value
      RETURN label, value.count as count
    `);

    // Get relationship counts by type
    const relCounts = await runQuery(`
      CALL db.relationshipTypes() YIELD relationshipType
      CALL apoc.cypher.run('MATCH ()-[r:' + relationshipType + ']->() RETURN count(r) as count', {}) YIELD value
      RETURN relationshipType, value.count as count
    `);

    return {
      nodesByLabel: labelCounts.records.map(r => ({
        label: r.get('label'),
        count: r.get('count').toNumber()
      })),
      relationshipsByType: relCounts.records.map(r => ({
        type: r.get('relationshipType'),
        count: r.get('count').toNumber()
      }))
    };
  } catch (error) {
    console.warn('Detailed statistics unavailable (APOC may not be installed):', error.message);
    return null;
  }
}

module.exports = {
  createService,
  createFile,
  createFunction,
  createEndpoint,
  createDependency,
  linkFileToService,
  linkFunctionToFile,
  linkEndpointToFunction,
  getImpactAnalysis,
  getReverseImpactAnalysis,
  getServiceArchitecture,
  getSystemHealth,
  findOrphanFunctions,
  getHighComplexityFunctions,
  searchNodes,
  getDatabaseMetrics,
  getDatabaseStatistics,
  runQuery
};