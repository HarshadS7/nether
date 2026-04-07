const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getRepositoryTree, getFileContent } = require('./github');
const {
  createService,
  createFile,
  createFunction,
  createEndpoint,
  createDependency,
  linkFileToService,
  linkFunctionToFile,
  linkEndpointToFunction
} = require('./neo4j');
const { addFunction } = require('./chroma');
const IngestionJob = require('../model/IngestionJob');

// Supported file extensions (must match utils/parsers)
const SUPPORTED_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go']);

// Language parsers (same mapping as utils/parsers/index.js)
const PARSERS = {
  '.js': require('../utils/parsers/javascript'),
  '.jsx': require('../utils/parsers/javascript'),
  '.ts': require('../utils/parsers/javascript'),
  '.tsx': require('../utils/parsers/javascript'),
  '.py': require('../utils/parsers/python'),
  '.java': require('../utils/parsers/java'),
  '.go': require('../utils/parsers/go')
};

// Batch size for GitHub API calls to avoid rate limits
const BATCH_SIZE = 10;

/**
 * Parse owner and repo from a GitHub URL.
 * Handles: https://github.com/owner/repo or https://github.com/owner/repo/
 */
function parseRepoUrl(repoUrl) {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error(`Invalid GitHub URL: ${repoUrl}`);
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/**
 * Start full codebase ingestion for a GitHub repository.
 * Returns immediately with a jobId; processing runs in the background.
 */
async function ingestRepository(token, repoUrl, serviceName, branch = 'main') {
  const { owner, repo } = parseRepoUrl(repoUrl);

  console.log(`🚀 Starting full codebase ingestion: ${owner}/${repo} (branch: ${branch})`);

  // Get the full file tree from GitHub
  const allFiles = await getRepositoryTree(token, owner, repo, branch);

  // Filter to supported extensions only
  const supportedFiles = allFiles.filter(file => {
    const ext = path.extname(file.path);
    return SUPPORTED_EXTENSIONS.has(ext);
  });

  console.log(`� Found ${allFiles.length} total files, ${supportedFiles.length} supported for parsing`);

  if (supportedFiles.length === 0) {
    return {
      success: true,
      message: 'No supported source files found in repository',
      jobId: null,
      totalFiles: 0
    };
  }

  // Create job record
  const jobId = uuidv4();
  const job = await IngestionJob.create({
    jobId,
    repoUrl,
    serviceName,
    status: 'in_progress',
    totalFiles: supportedFiles.length,
    filesProcessed: 0,
    functionsFound: 0,
    endpointsFound: 0,
    ingestionErrors: [],
    startedAt: new Date()
  });

  // Run processing in the background (don't await)
  processAllFiles(job, supportedFiles, token, owner, repo, serviceName, branch).catch(err => {
    console.error(`❌ Background ingestion failed for job ${jobId}:`, err.message);
  });

  return {
    success: true,
    jobId,
    message: 'Ingestion started',
    totalFiles: supportedFiles.length,
    repo: `${owner}/${repo}`
  };
}

/**
 * Process all files in batches.
 */
async function processAllFiles(job, files, token, owner, repo, serviceName, branch) {
  try {
    // Ensure service node exists in Neo4j
    await createService({
      name: serviceName,
      type: 'service',
      language: 'multi',
      version: '1.0.0',
      description: `Ingested from github.com/${owner}/${repo}`
    });

    console.log(`✅ Service node created: ${serviceName}`);

    // Process files in batches to respect API rate limits
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);

      // Fetch all file contents in parallel within the batch
      const contentResults = await Promise.allSettled(
        batch.map(file =>
          getFileContent(token, owner, repo, file.path, branch)
            .then(content => ({ file, content }))
        )
      );

      // Process each file that was fetched successfully
      for (const result of contentResults) {
        if (result.status === 'rejected') {
          console.warn(`⚠️  Failed to fetch file: ${result.reason?.message}`);
          continue;
        }

        const { file, content } = result.value;
        if (!content) continue;

        try {
          await processOneFile(file.path, content, serviceName, job);
        } catch (err) {
          console.error(`⚠️  Error processing ${file.path}:`, err.message);
          job.ingestionErrors.push({ file: file.path, message: err.message });
        }

        job.filesProcessed += 1;
      }

      await job.save();
      console.log(`📊 Progress: ${job.filesProcessed}/${job.totalFiles} files (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
    }

    job.status = 'completed';
    job.completedAt = new Date();
    await job.save();

    console.log(`🎉 Ingestion complete for ${serviceName}: ${job.filesProcessed} files, ${job.functionsFound} functions, ${job.endpointsFound} endpoints`);
  } catch (err) {
    console.error(`❌ Fatal ingestion error for job ${job.jobId}:`, err.message);
    job.status = 'failed';
    job.ingestionErrors.push({ file: null, message: err.message });
    await job.save();
  }
}

/**
 * Process a single file: parse → Neo4j → ChromaDB.
 */
async function processOneFile(filePath, content, serviceName, job) {
  const ext = path.extname(filePath);
  const parser = PARSERS[ext];
  if (!parser) return;

  // Parse file content
  const parsed = await parser.parse(filePath, content);
  if (!parsed) return;

  // Create File node in Neo4j
  await createFile({
    path: filePath,
    language: parsed.language,
    size: content.length
  });

  // Link file to service
  await linkFileToService(filePath, serviceName);

  // Process functions
  if (parsed.functions && parsed.functions.length > 0) {
    for (const func of parsed.functions) {
      const functionId = `${filePath}:${func.name}:${func.line}`;

      // Create Function node in Neo4j
      await createFunction({
        id: functionId,
        name: func.name,
        filePath,
        line: func.line,
        endLine: func.endLine,
        params: func.params || [],
        isAsync: func.isAsync || false,
        complexity: estimateComplexity(func)
      });

      // Link function to file
      await linkFunctionToFile(functionId, filePath);

      // Add to ChromaDB for semantic search
      await addFunction({
        id: functionId,
        name: func.name,
        filePath,
        line: func.line,
        params: func.params || [],
        language: parsed.language
      });

      job.functionsFound += 1;
    }
  }

  // Process classes
  if (parsed.classes && parsed.classes.length > 0) {
    for (const cls of parsed.classes) {
      if (cls.methods && cls.methods.length > 0) {
        for (const method of cls.methods) {
          const fullMethodName = `${cls.name}.${method.name}`;
          const functionId = `${filePath}:${fullMethodName}:${method.line}`;

          await createFunction({
            id: functionId,
            name: fullMethodName,
            filePath,
            line: method.line,
            endLine: method.endLine,
            params: method.params || [],
            isAsync: method.isAsync || false,
            complexity: estimateComplexity(method)
          });

          await linkFunctionToFile(functionId, filePath);

          await addFunction({
            id: functionId,
            name: fullMethodName,
            filePath,
            line: method.line,
            params: method.params || [],
            language: parsed.language
          });

          job.functionsFound += 1;
        }
      }
    }
  }

  // Process endpoints
  if (parsed.endpoints && parsed.endpoints.length > 0) {
    for (const endpoint of parsed.endpoints) {
      const endpointId = `${endpoint.method}:${endpoint.path}`;

      await createEndpoint({
        id: endpointId,
        method: endpoint.method,
        path: endpoint.path,
        handler: endpoint.handler || '',
        filePath,
        line: endpoint.line
      });

      // Link endpoint to handler
      if (endpoint.handler) {
        const handlerFunctionId = `${filePath}:${endpoint.handler}:0`;
        try {
          await linkEndpointToFunction(endpointId, handlerFunctionId);
        } catch { /* handler might not exist as a node */ }
      }

      job.endpointsFound += 1;
    }
  }

  // Process imports
  if (parsed.imports && parsed.imports.length > 0) {
    for (const imp of parsed.imports) {
      if (imp.source && imp.source.startsWith('.')) {
        const dir = path.dirname(filePath);
        const importedPath = path.join(dir, imp.source);
        try {
          await createDependency(filePath, importedPath, 'IMPORTS');
        } catch { /* target not ingested yet */ }
      }
    }
  }
}

/**
 * Estimate function complexity
 */
function estimateComplexity(func) {
  let complexity = 1;
  if (func.params && func.params.length > 3) complexity += func.params.length - 3;
  if (func.isAsync) complexity += 1;
  return complexity;
}

/**
 * Get job status
 */
async function getJobStatus(jobId) {
  const job = await IngestionJob.findByJobId(jobId);
  if (!job) return null;

  return {
    jobId: job.jobId,
    repoUrl: job.repoUrl,
    serviceName: job.serviceName,
    status: job.status,
    totalFiles: job.totalFiles,
    filesProcessed: job.filesProcessed,
    functionsFound: job.functionsFound,
    endpointsFound: job.endpointsFound,
    errors: job.ingestionErrors,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  };
}

module.exports = {
  ingestRepository,
  getJobStatus,
  parseRepoUrl
};
