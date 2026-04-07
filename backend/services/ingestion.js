const parserOrchestrator = require('../utils/parsers');
const { createService, createFile, createFunction, createEndpoint, createDependency, linkFileToService, linkFunctionToFile, linkEndpointToFunction } = require('./neo4j');
const { addFunction } = require('./chroma');
const path = require('path');
const crypto = require('crypto');

async function ingestCodebase(codebasePath, serviceName, options = {}) {
  console.log(`Starting ingestion of ${codebasePath}...`);
  
  try {
    // Step 1: Create or update service node
    const service = await createService({
      name: serviceName,
      type: options.type || 'service',
      language: options.language || 'multi',
      version: options.version || '1.0.0',
      description: options.description || ''
    });

    console.log(`✅ Service node created: ${serviceName}`);

    // Step 2: Parse all files in the codebase
    const parsedFiles = await parserOrchestrator.parseDirectory(codebasePath, {
      recursive: true,
      excludeDirs: options.excludeDirs || ['node_modules', 'dist', 'build', '.git'],
      maxFiles: options.maxFiles || 3000
    });

    console.log(`✅ Parsed ${parsedFiles.length} files`);

    // Step 3: Process each file and create graph nodes
    let stats = {
      files: 0,
      functions: 0,
      classes: 0,
      endpoints: 0,
      dependencies: 0
    };

    for (const fileData of parsedFiles) {
      await processFile(fileData, serviceName);
      
      stats.files++;
      stats.functions += fileData.functions?.length || 0;
      stats.classes += fileData.classes?.length || 0;
      stats.endpoints += fileData.endpoints?.length || 0;
    }

    // Step 4: Create cross-file dependencies
    const depCount = await createDependencies(parsedFiles);
    stats.dependencies = depCount;

    console.log(`✅ Ingestion complete:`, stats);

    return {
      success: true,
      service: serviceName,
      stats
    };

  } catch (error) {
    console.error('Ingestion error:', error);
    throw error;
  }
}

async function processFile(fileData, serviceName) {
  try {
    // Create file node
    const fileNode = await createFile({
      path: fileData.filePath,
      language: fileData.language,
      size: 0 // Could calculate actual size
    });

    // Link file to service
    await linkFileToService(fileData.filePath, serviceName);

    // Process functions
    if (fileData.functions && fileData.functions.length > 0) {
      for (const func of fileData.functions) {
        await processFunction(func, fileData);
      }
    }

    // Process classes
    if (fileData.classes && fileData.classes.length > 0) {
      for (const cls of fileData.classes) {
        await processClass(cls, fileData);
      }
    }

    // Process endpoints
    if (fileData.endpoints && fileData.endpoints.length > 0) {
      for (const endpoint of fileData.endpoints) {
        await processEndpoint(endpoint, fileData);
      }
    }

  } catch (error) {
    console.error(`Error processing file ${fileData.filePath}:`, error.message);
  }
}

async function processFunction(func, fileData) {
  try {
    const functionId = generateFunctionId(func, fileData.filePath);
    
    // Create function node in Neo4j
    const functionNode = await createFunction({
      id: functionId,
      name: func.name,
      filePath: fileData.filePath,
      line: func.line,
      endLine: func.endLine,
      params: func.params || [],
      isAsync: func.isAsync || false,
      complexity: estimateComplexity(func)
    });

    // Link function to file
    await linkFunctionToFile(functionId, fileData.filePath);

    // Add to ChromaDB for semantic search
    await addFunction({
      id: functionId,
      name: func.name,
      filePath: fileData.filePath,
      line: func.line,
      params: func.params || [],
      language: fileData.language
    });

  } catch (error) {
    console.error(`Error processing function ${func.name}:`, error.message);
  }
}

async function processClass(cls, fileData) {
  try {
    // Process each method in the class as a function
    if (cls.methods && cls.methods.length > 0) {
      for (const method of cls.methods) {
        const fullMethodName = `${cls.name}.${method.name}`;
        await processFunction({
          ...method,
          name: fullMethodName,
          className: cls.name
        }, fileData);
      }
    }
  } catch (error) {
    console.error(`Error processing class ${cls.name}:`, error.message);
  }
}

async function processEndpoint(endpoint, fileData) {
  try {
    const endpointId = `${endpoint.method}:${endpoint.path}`;
    
    // Create endpoint node
    const endpointNode = await createEndpoint({
      id: endpointId,
      method: endpoint.method,
      path: endpoint.path,
      handler: endpoint.handler || '',
      filePath: fileData.filePath,
      line: endpoint.line
    });

    // If handler is known, try to link to the handler function
    if (endpoint.handler) {
      const handlerFunctionId = findFunctionId(endpoint.handler, fileData.filePath);
      if (handlerFunctionId) {
        await linkEndpointToFunction(endpointId, handlerFunctionId);
      }
    }

  } catch (error) {
    console.error(`Error processing endpoint ${endpoint.method} ${endpoint.path}:`, error.message);
  }
}

async function createDependencies(parsedFiles) {
  let depCount = 0;

  try {
    // Build a map of all functions for quick lookup
    const functionMap = new Map();
    
    for (const fileData of parsedFiles) {
      if (fileData.functions) {
        for (const func of fileData.functions) {
          const id = generateFunctionId(func, fileData.filePath);
          functionMap.set(func.name, id);
          functionMap.set(`${fileData.filePath}:${func.name}`, id);
        }
      }
    }

    // Create dependencies based on function calls
    for (const fileData of parsedFiles) {
      if (fileData.calls && fileData.calls.length > 0) {
        for (const call of fileData.calls) {
          const targetFunctionId = functionMap.get(call.name);
          if (targetFunctionId) {
            // Find the calling function (based on line number)
            const callingFunction = findFunctionAtLine(fileData, call.line);
            if (callingFunction) {
              const callingFunctionId = generateFunctionId(callingFunction, fileData.filePath);
              await createDependency(callingFunctionId, targetFunctionId, 'CALLS');
              depCount++;
            }
          }
        }
      }

      // Create import-based dependencies
      if (fileData.imports && fileData.imports.length > 0) {
        for (const imp of fileData.imports) {
          // This is simplified - in production, resolve actual file paths
          const importedFilePath = resolveImportPath(imp.source, fileData.filePath);
          if (importedFilePath) {
            // Create file-level dependency
            await createDependency(fileData.filePath, importedFilePath, 'IMPORTS');
            depCount++;
          }
        }
      }
    }

    return depCount;

  } catch (error) {
    console.error('Error creating dependencies:', error.message);
    return depCount;
  }
}

// Helper functions
function generateFunctionId(func, filePath) {
  return `${filePath}:${func.name}:${func.line}`;
}

function findFunctionId(functionName, filePath) {
  // Simplified - would need access to parsed data
  return `${filePath}:${functionName}:0`;
}

function findFunctionAtLine(fileData, line) {
  if (!fileData.functions) return null;
  
  return fileData.functions.find(func => 
    func.line <= line && (func.endLine || func.line + 10) >= line
  );
}

function resolveImportPath(importSource, currentFilePath) {
  // Simplified import resolution
  // In production, this would handle relative paths, node_modules, etc.
  if (importSource.startsWith('.')) {
    const dir = path.dirname(currentFilePath);
    return path.join(dir, importSource);
  }
  return null; // External module
}

function estimateComplexity(func) {
  // Simplified complexity estimation
  // In production, calculate cyclomatic complexity
  let complexity = 1;
  
  if (func.params && func.params.length > 3) complexity += func.params.length - 3;
  if (func.isAsync) complexity += 1;
  
  return complexity;
}

module.exports = {
  ingestCodebase,
  processFile,
  processFunction,
  processClass,
  processEndpoint,
  createDependencies
};
