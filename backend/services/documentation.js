const Documentation = require('../model/Documentation');
const { runQuery } = require('./neo4j');
const llmService = require('./llm');

/**
 * Documentation Service
 * Generates and manages documentation blocks for repositories
 */

/**
 * Generate documentation for a repository
 */
async function generateDocumentation(options) {
  const {
    workspaceId,
    repositoryUrl,
    repositoryName,
    pipelineId,
    parseResult,
    graphResult,
    useLLM = true
  } = options;

  try {
    // Find or create documentation
    const doc = await Documentation.findOrCreateByRepository(
      repositoryUrl,
      repositoryName,
      workspaceId
    );

    // Update metadata
    doc.metadata.fileCount = (doc.metadata.fileCount || 0) + 1;
    doc.metadata.functionCount = (doc.metadata.functionCount || 0) + (parseResult?.functions?.length || 0);
    doc.metadata.apiEndpointsCount = (doc.metadata.apiEndpointsCount || 0) + (parseResult?.endpoints?.length || 0);
    doc.metadata.language = parseResult?.language || doc.metadata.language;

    // Determine which blocks need updates
    const blocksToUpdate = determineBlocksToUpdate(doc, parseResult, graphResult);

    // Generate content for each block
    for (const blockName of blocksToUpdate) {
      const content = await generateBlockContent(
        blockName,
        {
          repositoryName,
          repositoryUrl,
          parseResult,
          graphResult,
          pipelineId,
          existingDoc: doc
        },
        useLLM
      );

      if (content) {
        doc.updateBlock(blockName, content, useLLM ? 'llm' : 'ast');
      }
    }

    // Mark last full regeneration if all major blocks updated
    if (blocksToUpdate.length >= 3) {
      doc.metadata.lastFullRegeneration = new Date();
    }

    await doc.save();

    return {
      success: true,
      documentationId: doc._id,
      blocksUpdated: blocksToUpdate,
      totalBlocks: doc.metadata.totalBlocks
    };
  } catch (error) {
    console.error('Error generating documentation:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Determine which blocks need updating based on changes
 */
function determineBlocksToUpdate(doc, parseResult, graphResult) {
  const blocks = [];

  // Introduction - update if new repo or major changes
  if (!doc.blocks.introduction?.content || doc.metadata.fileCount < 5) {
    blocks.push('introduction');
  }

  // Environment - update if imports changed
  if (parseResult?.imports?.length > 0) {
    blocks.push('environment');
  }

  // Installation - update if package dependencies detected
  if (parseResult?.imports?.some(imp => imp.includes('require') || imp.includes('import'))) {
    blocks.push('installation');
  }

  // Running - update if endpoints or main functions found
  if (parseResult?.endpoints?.length > 0 || parseResult?.functions?.some(f => f.name === 'main')) {
    blocks.push('running');
  }

  // Dynamic blocks based on code structure
  if (parseResult?.endpoints?.length > 0) {
    blocks.push('api-reference');
  }

  if (parseResult?.classes?.length > 0) {
    blocks.push('class-reference');
  }

  if (parseResult?.functions?.length > 5) {
    blocks.push('function-reference');
  }

  // Architecture block if graph has significant relationships
  if (graphResult?.nodesCreated > 10) {
    blocks.push('architecture');
  }

  return blocks;
}

/**
 * Generate content for a specific documentation block
 */
async function generateBlockContent(blockName, context, useLLM) {
  const { repositoryName, parseResult, graphResult, existingDoc } = context;

  // If LLM is available and enabled, use it
  if (useLLM && llmService.callGemini) {
    return await generateBlockWithLLM(blockName, context);
  }

  // Fallback to AST-based generation
  return generateBlockFromAST(blockName, context);
}

/**
 * Generate block content using LLM
 */
async function generateBlockWithLLM(blockName, context) {
  const { repositoryName, parseResult, graphResult } = context;

  const prompts = {
    introduction: `Generate a brief introduction section for the documentation of "${repositoryName}". 
      Based on this code analysis:
      - ${parseResult?.functions?.length || 0} functions
      - ${parseResult?.classes?.length || 0} classes
      - ${parseResult?.endpoints?.length || 0} API endpoints
      - Main imports: ${parseResult?.imports?.slice(0, 5).join(', ') || 'none'}
      
      Write a 2-3 sentence introduction explaining what this repository does.`,

    environment: `Generate an "Environment Setup" section for "${repositoryName}". 
      Dependencies detected: ${parseResult?.imports?.join(', ') || 'none'}
      Language: ${parseResult?.language || 'javascript'}
      
      List the required environment setup and dependencies.`,

    installation: `Generate an "Installation" section for "${repositoryName}".
      Language: ${parseResult?.language || 'javascript'}
      Known imports: ${parseResult?.imports?.slice(0, 10).join(', ') || 'none'}
      
      Provide installation instructions (npm install, pip install, etc).`,

    running: `Generate a "Running the Application" section for "${repositoryName}".
      ${parseResult?.endpoints?.length > 0 ? `API Endpoints: ${parseResult.endpoints.map(e => `${e.method} ${e.path}`).join(', ')}` : ''}
      ${parseResult?.functions?.some(f => f.name === 'main') ? 'Has main function' : ''}
      
      Explain how to run this application.`,

    'api-reference': `Generate an "API Reference" section for "${repositoryName}".
      Endpoints found:
      ${parseResult?.endpoints?.map(e => `- ${e.method} ${e.path} (handler: ${e.handler})`).join('\n      ') || 'none'}
      
      Document these API endpoints in a clear format.`,

    'class-reference': `Generate a "Class Reference" section for "${repositoryName}".
      Classes found:
      ${parseResult?.classes?.map(c => `- ${c.name} (methods: ${c.methods?.join(', ') || 'none'})`).join('\n      ') || 'none'}
      
      Document these classes.`,

    'function-reference': `Generate a "Function Reference" section for "${repositoryName}".
      Key functions (first 10):
      ${parseResult?.functions?.slice(0, 10).map(f => `- ${f.name}(${f.params?.join(', ') || ''})`).join('\n      ') || 'none'}
      
      Document the most important functions.`,

    architecture: `Generate an "Architecture" section for "${repositoryName}".
      Code structure:
      - ${graphResult?.nodesCreated || 0} nodes in knowledge graph
      - ${graphResult?.relationshipsCreated || 0} relationships
      - ${parseResult?.functions?.length || 0} total functions
      
      Describe the high-level architecture and how components interact.`
  };

  const prompt = prompts[blockName] || `Generate documentation for the "${blockName}" section of ${repositoryName}.`;

  try {
    const content = await llmService.callGemini(
      'You are a technical documentation writer. Generate clear, concise documentation.',
      prompt,
      0.3
    );

    return content || `*Documentation for ${blockName} will be generated.*`;
  } catch (error) {
    console.error(`LLM generation failed for ${blockName}:`, error.message);
    return generateBlockFromAST(blockName, context);
  }
}

/**
 * Generate block content from AST (fallback when no LLM)
 */
function generateBlockFromAST(blockName, context) {
  const { repositoryName, parseResult, graphResult } = context;

  const generators = {
    introduction: () => {
      return `# ${repositoryName}\n\n` +
        `This repository contains ${parseResult?.functions?.length || 0} functions, ` +
        `${parseResult?.classes?.length || 0} classes, and ` +
        `${parseResult?.endpoints?.length || 0} API endpoints.\n\n` +
        `Language: ${parseResult?.language || 'javascript'}`;
    },

    environment: () => {
      const imports = parseResult?.imports || [];
      if (imports.length === 0) return 'No external dependencies detected.';

      return `## Dependencies\n\n` +
        imports.slice(0, 20).map(imp => `- \`${imp}\``).join('\n');
    },

    installation: () => {
      const lang = parseResult?.language || 'javascript';
      const installCmd = {
        javascript: 'npm install',
        typescript: 'npm install',
        python: 'pip install -r requirements.txt',
        java: 'mvn install',
        go: 'go get'
      };

      return `\`\`\`bash\n${installCmd[lang] || 'npm install'}\n\`\`\``;
    },

    running: () => {
      const lang = parseResult?.language || 'javascript';
      const runCmd = {
        javascript: 'node index.js',
        typescript: 'npm start',
        python: 'python main.py',
        java: 'mvn exec:java',
        go: 'go run main.go'
      };

      let content = `\`\`\`bash\n${runCmd[lang] || 'npm start'}\n\`\`\`\n\n`;

      if (parseResult?.endpoints?.length > 0) {
        content += `Server will start and expose ${parseResult.endpoints.length} API endpoint(s).`;
      }

      return content;
    },

    'api-reference': () => {
      if (!parseResult?.endpoints || parseResult.endpoints.length === 0) {
        return 'No API endpoints detected.';
      }

      return '## Endpoints\n\n' +
        parseResult.endpoints.map(e => 
          `### ${e.method} ${e.path}\n\nHandler: \`${e.handler}\`\n`
        ).join('\n');
    },

    'class-reference': () => {
      if (!parseResult?.classes || parseResult.classes.length === 0) {
        return 'No classes detected.';
      }

      return parseResult.classes.map(c =>
        `### ${c.name}\n\nMethods: ${c.methods?.join(', ') || 'none'}\n`
      ).join('\n');
    },

    'function-reference': () => {
      if (!parseResult?.functions || parseResult.functions.length === 0) {
        return 'No functions detected.';
      }

      return parseResult.functions.slice(0, 20).map(f =>
        `- **${f.name}**(${f.params?.join(', ') || ''}) - Line ${f.line || '?'}`
      ).join('\n');
    },

    architecture: () => {
      return `## System Architecture\n\n` +
        `- **Nodes**: ${graphResult?.nodesCreated || 0}\n` +
        `- **Relationships**: ${graphResult?.relationshipsCreated || 0}\n` +
        `- **Functions**: ${parseResult?.functions?.length || 0}\n` +
        `- **Files**: ${parseResult?.imports?.length || 0}`;
    }
  };

  const generator = generators[blockName];
  return generator ? generator() : `*${blockName} documentation pending.*`;
}

/**
 * Get documentation for a repository
 */
async function getDocumentation(repositoryUrl) {
  const doc = await Documentation.findOne({ repositoryUrl });
  return doc;
}

/**
 * Get documentation as markdown
 */
async function getDocumentationMarkdown(repositoryUrl) {
  const doc = await Documentation.findOne({ repositoryUrl });
  if (!doc) return null;
  
  return doc.generateMarkdown();
}

/**
 * Update a specific block
 */
async function updateBlock(repositoryUrl, blockName, content, generatedBy = 'manual') {
  const doc = await Documentation.findOne({ repositoryUrl });
  if (!doc) throw new Error('Documentation not found');

  doc.updateBlock(blockName, content, generatedBy);
  await doc.save();

  return doc;
}

/**
 * Get all documentation for a workspace
 */
async function getWorkspaceDocumentation(workspaceId) {
  const docs = await Documentation.find({ workspaceId });
  return docs;
}

module.exports = {
  generateDocumentation,
  getDocumentation,
  getDocumentationMarkdown,
  updateBlock,
  getWorkspaceDocumentation,
  generateBlockContent,
  determineBlocksToUpdate
};
