const { GoogleGenerativeAI } = require('@google/generative-ai');
const mockLLMService = require('./llmMock');

// Module-level variables
let useMock = !process.env.GEMINI_API_KEY || process.env.USE_MOCK_LLM === 'true';
let genAI = null;
let model = null;
let modelName = null;

// Initialize on module load
if (!useMock) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  model = genAI.getGenerativeModel({ model: modelName });
  console.log('✅ Using real Gemini LLM service');
} else {
  console.log('⚠️  Using mock LLM service (set GEMINI_API_KEY to use real LLM)');
}

// Helper function to call Gemini API
async function callGemini(systemPrompt, userPrompt, temperature = 0.3, maxTokens = 1500) {
  try {
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: maxTokens,
      },
    });

    const response = result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API error:', error.message);
    throw error;
  }
}

async function explainImpactAnalysis(impactData, context = {}) {
  if (useMock) {
    const mockResult = mockLLMService.explainImpactAnalysis(impactData, context);
    // Add mock commit summary if commit data provided
    if (context.commitData) {
      return {
        impactAnalysis: mockResult,
        commitSummary: {
          line1: `Modified ${context.commitData.filesChanged?.length || 0} files`,
          line2: `Changes: ${context.commitData.message?.substring(0, 50) || 'development work'}`
        }
      };
    }
    return mockResult;
  }

  const systemPrompt = 'You are an expert software architect analyzing system dependencies and impact. Provide clear, technical explanations with specific references to code elements.';
  const userPrompt = buildImpactAnalysisPrompt(impactData, context);

  const response = await callGemini(systemPrompt, userPrompt, 0.3, context.commitData ? 1800 : 1500);

  // If commit data was provided, parse response for both impact analysis and commit summary
  if (context.commitData) {
    return parseImpactAnalysisWithCommitSummary(response);
  }

  return response;
}

async function answerArchitectureQuestion(question, graphContext, vectorContext) {
  if (useMock) {
    return mockLLMService.answerArchitectureQuestion(question, graphContext, vectorContext);
  }

  const systemPrompt = 'You are an expert software architect with deep knowledge of the system. Answer questions based on the provided graph structure and semantic context. Always cite specific files, functions, or services when making claims.';
  const userPrompt = buildArchitectureQuestionPrompt(question, graphContext, vectorContext);

  return await callGemini(systemPrompt, userPrompt, 0.4, 2000);
}

async function generateDocumentation(serviceData, functions, endpoints) {
  if (useMock) {
    return mockLLMService.generateDocumentation(serviceData, functions, endpoints);
  }

  const systemPrompt = 'You are a technical writer generating comprehensive API documentation. Create clear, structured documentation with examples where appropriate.';
  const userPrompt = buildDocumentationPrompt(serviceData, functions, endpoints);

  return await callGemini(systemPrompt, userPrompt, 0.5, 3000);
}

async function generateOnboardingGuide(serviceArchitecture, keyComponents) {
  if (useMock) {
    return mockLLMService.generateOnboardingGuide(serviceArchitecture, keyComponents);
  }

  const systemPrompt = 'You are creating an onboarding guide for new engineers. Make it comprehensive yet approachable, highlighting the most important concepts and entry points.';
  const userPrompt = buildOnboardingPrompt(serviceArchitecture, keyComponents);

  return await callGemini(systemPrompt, userPrompt, 0.6, 3000);
}

async function analyzeSystemHealth(healthMetrics, issues) {
  if (useMock) {
    return mockLLMService.analyzeSystemHealth(healthMetrics, issues);
  }

  const systemPrompt = 'You are a system health analyst providing insights on architecture quality and potential issues. Be specific about problems and actionable in recommendations.';
  const userPrompt = buildHealthAnalysisPrompt(healthMetrics, issues);

  return await callGemini(systemPrompt, userPrompt, 0.3, 2000);
}

async function suggestRefactoring(functionData, dependencies, metrics) {
  if (useMock) {
    return mockLLMService.suggestRefactoring(functionData, dependencies, metrics);
  }

  const systemPrompt = 'You are a code quality expert suggesting refactoring improvements. Focus on maintainability, testability, and reducing coupling.';
  const userPrompt = buildRefactoringPrompt(functionData, dependencies, metrics);

  return await callGemini(systemPrompt, userPrompt, 0.4, 1500);
}

// Prompt builder functions
function buildImpactAnalysisPrompt(impactData, context) {
  let prompt = `
Analyze the impact of changes to the following component:

**Target Component:**
${JSON.stringify(context.targetNode, null, 2)}

**Affected Components (${impactData.length} total):**
${impactData.slice(0, 20).map(item => `
- ${getNodeLabel(item.node)} (Depth: ${item.depth})
  Relationship: ${item.relationships.join(' → ')}
`).join('\n')}

${impactData.length > 20 ? `... and ${impactData.length - 20} more components` : ''}

**Task:**
Provide a clear explanation of:
1. What this component does
2. Which components are affected and why
3. The blast radius of changes (categorize by severity)
4. Recommended testing strategy
5. Potential risks

Keep the explanation technical but clear.`;

  // ADD commit summary request if commit data is provided (don't replace, ADD)
  if (context.commitData) {
    prompt += `

---

**ADDITIONAL TASK - Commit Summary:**

This code change is from a Git commit. Generate a concise 2-line summary:

**Commit Details:**
- Message: ${context.commitData.message}
- Author: ${context.commitData.author?.username || 'Unknown'}
- Files Changed: ${context.commitData.filesChanged?.length || 0}
${context.commitData.filesChanged?.slice(0, 3).map(f => `  - ${f.filename} (${f.status}): +${f.additions || 0} -${f.deletions || 0}`).join('\n') || ''}

**Required Format:**
After your impact analysis, add a section:

### COMMIT SUMMARY
Line 1: [What changed - focus on functionality/feature]
Line 2: [Why or impact - focus on benefits/fixes]`;
  }

  return prompt.trim();
}

function buildArchitectureQuestionPrompt(question, graphContext, vectorContext) {
  return `
**Question:** ${question}

**Graph Structure Context:**
${JSON.stringify(graphContext, null, 2)}

**Semantic Context (Top Matches):**
${vectorContext.map(item => `
- ${item.document}
  Metadata: ${JSON.stringify(item.metadata)}
`).join('\n')}

**Task:**
Answer the question using the provided context. Reference specific files, functions, or services. If the context is insufficient, clearly state what information is missing.
    `.trim();
}

function buildDocumentationPrompt(serviceData, functions, endpoints) {
  return `
Generate comprehensive API documentation for the following service:

**Service:** ${serviceData.name}
**Type:** ${serviceData.type}
**Language:** ${serviceData.language}

**Endpoints (${endpoints.length}):**
${endpoints.map(e => `
- ${e.method} ${e.path}
  Handler: ${e.handler}
`).join('\n')}

**Key Functions (${functions.length}):**
${functions.slice(0, 10).map(f => `
- ${f.name}(${f.params?.join(', ') || ''})
  File: ${f.filePath}:${f.line}
`).join('\n')}

**Task:**
Create structured documentation including:
1. Service Overview
2. API Endpoints (with request/response schemas if inferable)
3. Key Functions and their purposes
4. Authentication/Authorization (if applicable)
5. Error Handling
6. Examples

Format in Markdown.
    `.trim();
}

function buildOnboardingPrompt(serviceArchitecture, keyComponents) {
  return `
Create an onboarding guide for the following service architecture:

**Architecture Overview:**
${JSON.stringify(serviceArchitecture, null, 2)}

**Key Components:**
${JSON.stringify(keyComponents, null, 2)}

**Task:**
Generate a comprehensive onboarding guide including:
1. System Overview (what problem does it solve?)
2. Architecture Diagram (describe in text)
3. Key Concepts and Terminology
4. Important Files and Entry Points
5. Development Setup
6. Common Tasks and Workflows
7. Where to Find More Information

Format in Markdown. Make it friendly for new engineers.
    `.trim();
}

function buildHealthAnalysisPrompt(healthMetrics, issues) {
  return `
Analyze the health of the system based on these metrics and issues:

**System Metrics:**
${JSON.stringify(healthMetrics, null, 2)}

**Detected Issues:**
${JSON.stringify(issues, null, 2)}

**Task:**
Provide a health analysis including:
1. Overall System Health Score (0-100)
2. Critical Issues (with severity)
3. Architecture Drift Indicators
4. Maintenance Burden Assessment
5. Recommended Actions (prioritized)

Be specific and actionable.
    `.trim();
}

function buildRefactoringPrompt(functionData, dependencies, metrics) {
  return `
Suggest refactoring improvements for this function:

**Function:**
${JSON.stringify(functionData, null, 2)}

**Dependencies:**
${JSON.stringify(dependencies, null, 2)}

**Metrics:**
${JSON.stringify(metrics, null, 2)}

**Task:**
Provide refactoring suggestions focusing on:
1. Reducing complexity
2. Improving testability
3. Better separation of concerns
4. Reducing coupling
5. Code smell detection

Be specific about what to change and why.
    `.trim();
}

function getNodeLabel(node) {
  if (node.name) return `${node.name}`;
  if (node.path) return `File: ${node.path}`;
  if (node.id) return node.id;
  return 'Unknown';
}

/**
 * Parse LLM response that contains both impact analysis and commit summary
 */
function parseImpactAnalysisWithCommitSummary(response) {
  try {
    // Look for the COMMIT SUMMARY section
    const summaryMatch = response.match(/###\s*COMMIT SUMMARY([\s\S]*?)(?:###|$)/i);

    let impactAnalysis = response;
    let commitSummary = { line1: '', line2: '' };

    if (summaryMatch) {
      // Extract impact analysis (everything before COMMIT SUMMARY)
      const summaryIndex = response.indexOf(summaryMatch[0]);
      impactAnalysis = response.substring(0, summaryIndex).trim();

      // Extract the two lines
      const summaryText = summaryMatch[1].trim();
      const lines = summaryText.split('\n').filter(l => l.trim() && l.includes(':'));

      if (lines.length >= 2) {
        // Extract content after "Line 1:" and "Line 2:"
        const line1Match = lines[0].match(/Line 1:\s*(.+)/i);
        const line2Match = lines[1].match(/Line 2:\s*(.+)/i);

        if (line1Match) commitSummary.line1 = line1Match[1].trim();
        if (line2Match) commitSummary.line2 = line2Match[1].trim();
      }
    }

    return {
      impactAnalysis,
      commitSummary
    };
  } catch (error) {
    console.error('Error parsing commit summary from LLM response:', error);
    return {
      impactAnalysis: response,
      commitSummary: { line1: '', line2: '' }
    };
  }
}

module.exports = {
  callGemini,
  explainImpactAnalysis,
  answerArchitectureQuestion,
  generateDocumentation,
  generateOnboardingGuide,
  analyzeSystemHealth,
  suggestRefactoring
};
