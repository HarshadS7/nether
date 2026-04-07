const javascriptParser = require('../utils/parsers/javascript');
const typescriptParser = require('../utils/parsers/javascript'); // TypeScript uses same parser
const pythonParser = require('../utils/parsers/python');
const javaParser = require('../utils/parsers/java');
const goParser = require('../utils/parsers/go');

const { createService, createFile, createFunction, linkFunctionToFile, linkFileToService } = require('./neo4j');
const { addFunction } = require('./chroma');
const { explainImpactAnalysis } = require('./llm');
const documentationService = require('./documentation');
const AST = require('../model/AST');
const GitHubCommit = require('../model/GitHubCommit');
const crypto = require('crypto');

// Supported language parsers
const PARSERS = {
  javascript: javascriptParser,
  typescript: typescriptParser,
  python: pythonParser,
  java: javaParser,
  go: goParser
};

// Get file extension for language
function getFileExtension(language) {
  const extensions = {
    javascript: '.js',
    typescript: '.ts',
    python: '.py',
    java: '.java',
    go: '.go'
  };
  return extensions[language.toLowerCase()] || '.txt';
}

// Main pipeline orchestration function
async function processCodePipeline(code, language, options = {}) {
  const pipelineId = `pipeline_${crypto.randomBytes(8).toString('hex')}`;
  const startTime = Date.now();
  
  console.log(`🚀 Starting code pipeline: ${pipelineId} (${language})`);

  const result = {
    pipelineId,
    status: 'pending',
    steps: {
      parsing: { status: 'pending', result: null },
      graph: { status: 'pending', result: null },
      vector: { status: 'pending', result: null },
      llmAnalysis: { status: 'pending', result: null }
    },
    stats: {
      functionsFound: 0,
      classesFound: 0,
      nodesCreated: 0,
      documentsIndexed: 0
    },
    processingTime: 0
  };

  try {
    // Step 1: Parse Code to AST
    result.steps.parsing.status = 'running';
    const parseResult = await parseCode(code, language, options);
    result.steps.parsing.status = 'completed';
    result.steps.parsing.result = parseResult;
    result.stats.functionsFound = parseResult.functions?.length || 0;
    result.stats.classesFound = parseResult.classes?.length || 0;
    console.log(`✅ Parsing complete: ${result.stats.functionsFound} functions, ${result.stats.classesFound} classes`);

    // Step 1.5: Save AST to MongoDB
    result.steps.astStorage = { status: 'running', result: null };
    const astResult = await saveASTToMongoDB(parseResult, pipelineId);
    result.steps.astStorage.status = 'completed';
    result.steps.astStorage.result = astResult;

    // Step 2: Build Knowledge Graph in Neo4j
    result.steps.graph.status = 'running';
    const graphResult = await buildKnowledgeGraph(parseResult, pipelineId, language);
    result.steps.graph.status = 'completed';
    result.steps.graph.result = graphResult;
    result.stats.nodesCreated = graphResult.nodesCreated || 0;
    console.log(`✅ Graph building complete: ${result.stats.nodesCreated} nodes created`);

    // Step 3: Update Vector Database in ChromaDB
    result.steps.vector.status = 'running';
    const vectorResult = await updateVectorDatabase(parseResult, pipelineId);
    result.steps.vector.status = 'completed';
    result.steps.vector.result = vectorResult;
    result.stats.documentsIndexed = vectorResult.documentsIndexed || 0;
    console.log(`✅ Vector indexing complete: ${result.stats.documentsIndexed} documents indexed`);

    // Step 4: Analyze with LLM (with optional commit summary)
    result.steps.llmAnalysis.status = 'running';
    const llmResult = await analyzewithLLM(code, language, parseResult, options);
    result.steps.llmAnalysis.status = 'completed';
    result.steps.llmAnalysis.result = llmResult;
    console.log(`✅ LLM analysis complete`);
    
    // If commit summary was generated, save it to GitHubCommit
    if (llmResult.commitSummary && options.commitData) {
      try {
        const commit = await GitHubCommit.findOne({
          repositoryUrl: options.commitData.repositoryUrl,
          commitHash: options.commitData.commitHash
        });
        
        if (commit && llmResult.commitSummary.line1) {
          await commit.updateSummary(
            llmResult.commitSummary.line1,
            llmResult.commitSummary.line2,
            'llm'
          );
          console.log(`✅ Commit summary saved: ${llmResult.commitSummary.line1.substring(0, 50)}...`);
        }
      } catch (commitErr) {
        console.error('Error saving commit summary:', commitErr);
      }
    }

    // Step 5: Re-run pipeline to update AST, Knowledge Graph & Vector DB (without LLM)
    console.log(`🔄 Re-running pipeline to update databases...`);
    result.steps.postLlmUpdate = { status: 'running', result: null };
    
    try {
      // Re-parse the code (update AST)
      const updatedParseResult = await parseCode(code, language, options);
      
      // Re-build Knowledge Graph
      const updatedGraphResult = await buildKnowledgeGraph(updatedParseResult, pipelineId + '_updated', language);
      
      // Re-update Vector Database
      const updatedVectorResult = await updateVectorDatabase(updatedParseResult, pipelineId + '_updated');
      
      result.steps.postLlmUpdate.status = 'completed';
      result.steps.postLlmUpdate.result = {
        astUpdated: true,
        graphUpdated: updatedGraphResult,
        vectorUpdated: updatedVectorResult
      };
      console.log(`✅ Post-LLM database update complete`);
    } catch (updateError) {
      console.error('Post-LLM update error:', updateError);
      result.steps.postLlmUpdate.status = 'failed';
      result.steps.postLlmUpdate.error = updateError.message;
    }

    // Step 6: Generate Documentation
    console.log(`📝 Generating documentation...`);
    result.steps.documentation = { status: 'running', result: null };
    
    try {
      const docResult = await documentationService.generateDocumentation({
        workspaceId: options.workspaceId || null,
        repositoryUrl: options.repositoryUrl || `pipeline://${pipelineId}`,
        repositoryName: options.repositoryName || `Pipeline ${pipelineId}`,
        pipelineId,
        parseResult: result.steps.parsing.result,
        graphResult: result.steps.graph.result,
        useLLM: result.steps.llmAnalysis.status === 'completed' // Only use LLM if step 4 succeeded
      });
      
      result.steps.documentation.status = 'completed';
      result.steps.documentation.result = docResult;
      result.stats.documentationBlocks = docResult.blocksUpdated?.length || 0;
      console.log(`✅ Documentation generated: ${result.stats.documentationBlocks} blocks updated`);
    } catch (docError) {
      console.error('Documentation generation error:', docError);
      result.steps.documentation.status = 'failed';
      result.steps.documentation.error = docError.message;
      // Don't fail the entire pipeline if documentation fails
    }

    result.status = 'completed';
    result.processingTime = Date.now() - startTime;
    console.log(`🎉 Pipeline complete in ${result.processingTime}ms`);

    return result;

  } catch (error) {
    console.error('Pipeline error:', error);
    result.status = 'failed';
    result.error = error.message;
    result.processingTime = Date.now() - startTime;
    throw error;
  }
}

// Step 1: Parse code to AST
async function parseCode(code, language, options = {}) {
  const parser = PARSERS[language.toLowerCase()];
  
  if (!parser) {
    throw new Error(`No parser available for language: ${language}`);
  }

  try {
    // Create a virtual file path for the code snippet
    const virtualPath = options.filename || `snippet${getFileExtension(language)}`;
    
    // Parse the code using the parser's parse method
    const parseResult = await parser.parse(virtualPath, code);
    
    return {
      ...parseResult,
      filePath: virtualPath,
      language: language.toLowerCase(),
      codeLength: code.length,
      linesOfCode: code.split('\n').length
    };
  } catch (error) {
    console.error('Parsing error:', error);
    throw new Error(`Failed to parse ${language} code: ${error.message}`);
  }
}

// Step 2: Build Knowledge Graph in Neo4j
async function buildKnowledgeGraph(parseResult, pipelineId, language) {
  try {
    let nodesCreated = 0;

    // Create service node for this pipeline run
    const serviceName = `pipeline_${pipelineId}`;
    await createService({
      name: serviceName,
      type: 'code-snippet',
      language: language,
      version: '1.0.0',
      description: `Code pipeline analysis: ${pipelineId}`
    });
    nodesCreated++;

    // Create file node
    const fileNode = await createFile({
      path: parseResult.filePath,
      language: parseResult.language,
      size: parseResult.codeLength || 0
    });
    nodesCreated++;

    // Link file to service
    await linkFileToService(parseResult.filePath, serviceName);

    // Create function nodes
    if (parseResult.functions && parseResult.functions.length > 0) {
      for (const func of parseResult.functions) {
        const functionId = `${parseResult.filePath}:${func.name}:${func.line}`;
        await createFunction({
          id: functionId,
          name: func.name,
          filePath: parseResult.filePath,
          line: func.line,
          endLine: func.endLine || func.line,
          params: func.params || [],
          returnType: func.returnType || 'unknown',
          isAsync: func.isAsync || false,
          isExported: func.isExported || false,
          complexity: func.complexity || 1
        });
        
        // Link function to file (requires function ID, not name)
        await linkFunctionToFile(functionId, parseResult.filePath);
        nodesCreated++;
      }
    }

    // Create class nodes (if applicable)
    if (parseResult.classes && parseResult.classes.length > 0) {
      for (const cls of parseResult.classes) {
        const classId = `${parseResult.filePath}:${cls.name}:${cls.line}`;
        // Classes can be stored as special function nodes or separate nodes
        await createFunction({
          id: classId,
          name: cls.name,
          filePath: parseResult.filePath,
          line: cls.line,
          endLine: cls.endLine || cls.line,
          params: [],
          returnType: 'class',
          isAsync: false,
          isExported: cls.isExported || false
        });
        
        await linkFunctionToFile(classId, parseResult.filePath);
        nodesCreated++;
      }
    }

    return {
      nodesCreated,
      serviceName,
      filePath: parseResult.filePath
    };

  } catch (error) {
    console.error('Graph building error:', error);
    throw new Error(`Failed to build knowledge graph: ${error.message}`);
  }
}

// Step 3: Update Vector Database
async function updateVectorDatabase(parseResult, pipelineId) {
  try {
    let documentsIndexed = 0;

    // Index functions in ChromaDB
    if (parseResult.functions && parseResult.functions.length > 0) {
      for (const func of parseResult.functions) {
        const functionId = `${parseResult.filePath}:${func.name}:${func.line}`;
        await addFunction({
          id: functionId,
          name: func.name,
          filePath: parseResult.filePath,
          line: func.line,
          code: func.code || '',
          documentation: func.documentation || '',
          params: func.params || [],
          returnType: func.returnType || 'unknown',
          language: parseResult.language
        });
        documentsIndexed++;
      }
    }

    // Index classes in ChromaDB
    if (parseResult.classes && parseResult.classes.length > 0) {
      for (const cls of parseResult.classes) {
        const classId = `${parseResult.filePath}:${cls.name}:${cls.line}`;
        await addFunction({
          id: classId,
          name: cls.name,
          filePath: parseResult.filePath,
          line: cls.line,
          code: cls.code || '',
          documentation: cls.documentation || '',
          params: [],
          returnType: 'class',
          language: parseResult.language
        });
        documentsIndexed++;
      }
    }

    return {
      documentsIndexed,
      pipelineId
    };

  } catch (error) {
    console.error('Vector database update error:', error);
    throw new Error(`Failed to update vector database: ${error.message}`);
  }
}

// Step 4: Analyze with LLM
async function analyzewithLLM(code, language, parseResult, options = {}) {
  try {
    // Prepare context for LLM
    const context = {
      language,
      linesOfCode: parseResult.linesOfCode || 0,
      functionsCount: parseResult.functions?.length || 0,
      classesCount: parseResult.classes?.length || 0,
      imports: parseResult.imports || [],
      exports: parseResult.exports || [],
      targetNode: {
        name: parseResult.filePath,
        type: 'code-snippet',
        language
      },
      code: code.substring(0, 1000) // Limit code preview to 1000 chars
    };
    
    // Add commit data to context if provided
    if (options.commitData) {
      context.commitData = options.commitData;
    }

    // Build analysis data
    const impactData = [];
    
    if (parseResult.functions) {
      parseResult.functions.forEach(func => {
        impactData.push({
          node: {
            name: func.name,
            type: 'function',
            path: parseResult.filePath,
            line: func.line
          },
          depth: 0,
          relationships: []
        });
      });
    }

    // Call LLM for code analysis (and commit summary if commit data provided)
    const llmResponse = await explainImpactAnalysis(impactData, context);
    
    // If commit data was provided, response will have both impactAnalysis and commitSummary
    if (options.commitData && typeof llmResponse === 'object' && llmResponse.impactAnalysis) {
      return {
        analysis: llmResponse.impactAnalysis,
        commitSummary: llmResponse.commitSummary,
        context,
        summary: {
          language,
          complexity: estimateComplexity(parseResult),
          maintainability: estimateMaintainability(parseResult),
          testability: 'medium'
        }
      };
    }

    // Regular response without commit summary
    return {
      analysis: typeof llmResponse === 'string' ? llmResponse : llmResponse.impactAnalysis || llmResponse,
      context,
      summary: {
        language,
        complexity: estimateComplexity(parseResult),
        maintainability: estimateMaintainability(parseResult),
        testability: 'medium'
      }
    };

  } catch (error) {
    console.error('LLM analysis error:', error);
    // Don't throw error, return partial result
    return {
      analysis: 'LLM analysis unavailable',
      context: { language },
      error: error.message
    };
  }
}

// Helper: Estimate code complexity
function estimateComplexity(parseResult) {
  const functionsCount = parseResult.functions?.length || 0;
  const classesCount = parseResult.classes?.length || 0;
  const linesOfCode = parseResult.linesOfCode || 0;

  if (linesOfCode > 500 || functionsCount > 20) return 'high';
  if (linesOfCode > 200 || functionsCount > 10) return 'medium';
  return 'low';
}

// Helper: Estimate maintainability
function estimateMaintainability(parseResult) {
  const functionsCount = parseResult.functions?.length || 0;
  const avgFunctionSize = parseResult.linesOfCode / (functionsCount || 1);
  
  if (avgFunctionSize > 50) return 'low';
  if (avgFunctionSize > 25) return 'medium';
  return 'high';
}

// Save AST to MongoDB
async function saveASTToMongoDB(parseResult, pipelineId, fullAST = null) {
  try {
    // Calculate numeric complexity
    const complexityValue = estimateComplexity(parseResult);
    const complexityMap = { 'low': 1, 'medium': 2, 'high': 3 };
    const numericComplexity = complexityMap[complexityValue] || 1;

    // Properly serialize functions and classes to avoid Mongoose casting issues
    const functions = (parseResult.functions || []).map(f => ({
      name: f.name || '',
      type: f.type || 'function',
      params: f.params || [],
      line: f.line || 0,
      endLine: f.endLine || f.line || 0,
      isAsync: Boolean(f.isAsync),
      isGenerator: Boolean(f.isGenerator),
      isStatic: Boolean(f.isStatic),
      isExported: Boolean(f.isExported)
    }));

    const classes = (parseResult.classes || []).map(c => ({
      name: c.name || '',
      methods: (c.methods || []).map(m => ({
        name: m.name || '',
        type: m.type || 'method',
        params: m.params || [],
        line: m.line || 0,
        isAsync: Boolean(m.isAsync),
        isStatic: Boolean(m.isStatic)
      })),
      line: c.line || 0,
      endLine: c.endLine || c.line || 0,
      superClass: c.superClass || null
    }));

    const astDoc = new AST({
      pipelineId,
      filePath: parseResult.filePath,
      language: parseResult.language,
      ast: fullAST || { type: 'ParseResult', content: 'Full AST storage optional' },
      parseResult: {
        functions,
        classes,
        imports: parseResult.imports || [],
        exports: parseResult.exports || [],
        endpoints: parseResult.endpoints || [],
        calls: parseResult.calls || []
      },
      metadata: {
        codeLength: parseResult.codeLength || 0,
        linesOfCode: parseResult.linesOfCode || 0,
        complexity: numericComplexity,
        functionsCount: functions.length,
        classesCount: classes.length,
        importsCount: (parseResult.imports || []).length,
        exportsCount: (parseResult.exports || []).length
      }
    });

    await astDoc.save();
    console.log(`💾 AST saved to MongoDB for ${parseResult.filePath}`);
    
    return {
      astId: astDoc._id.toString(),
      filePath: parseResult.filePath,
      saved: true
    };
  } catch (error) {
    console.error('Error saving AST to MongoDB:', error.message);
    return {
      saved: false,
      error: error.message
    };
  }
}

module.exports = {
  processCodePipeline,
  parseCode,
  buildKnowledgeGraph,
  updateVectorDatabase,
  analyzewithLLM,
  saveASTToMongoDB
};
