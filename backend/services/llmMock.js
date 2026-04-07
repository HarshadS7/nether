// Mock LLM Service for Testing (no OpenAI API key required)

const model = 'mock-gpt-4';

async function explainImpactAnalysis(impactData, context = {}) {
    const totalAffected = impactData.length;
    const depths = impactData.map(i => i.depth);
    const maxDepth = Math.max(...depths, 0);

    return `
## Impact Analysis Summary

**Target Component:** ${context.targetNode?.id || 'Unknown'}

**Blast Radius:** ${totalAffected} components affected (Max depth: ${maxDepth})

### What This Component Does
This component is a critical part of the system architecture. Based on the dependency graph analysis, changes here will propagate through multiple layers.

### Affected Components
${impactData.slice(0, 5).map(item => `
- **${getNodeLabel(item.node)}** (Depth ${item.depth})
  - Relationship: ${item.relationships.join(' → ')}
  - Impact: ${item.depth === 1 ? 'IMMEDIATE' : item.depth === 2 ? 'SECONDARY' : 'TERTIARY'}
`).join('\n')}

${totalAffected > 5 ? `\n... and ${totalAffected - 5} more components\n` : ''}

### Blast Radius Categorization
- **Immediate Impact (Depth 1):** ${impactData.filter(i => i.depth === 1).length} components
- **Secondary Impact (Depth 2):** ${impactData.filter(i => i.depth === 2).length} components
- **Tertiary Impact (Depth 3+):** ${impactData.filter(i => i.depth >= 3).length} components

### Recommended Testing Strategy
1. **Unit Tests:** Focus on direct dependencies (depth 1)
2. **Integration Tests:** Cover secondary effects (depth 2)
3. **End-to-End Tests:** Validate full system behavior

### Potential Risks
${totalAffected > 20 ? '⚠️ HIGH RISK: Large blast radius detected' : totalAffected > 10 ? '⚠️ MEDIUM RISK: Moderate blast radius' : '✅ LOW RISK: Limited blast radius'}

**Recommendation:** ${totalAffected > 20 ? 'Consider breaking down this component into smaller, more isolated modules.' : 'Proceed with comprehensive testing of affected components.'}
    `.trim();
}

async function answerArchitectureQuestion(question, graphContext, vectorContext) {
    return `
## Architecture Insights

**Question:** ${question}

### Analysis Based on System Knowledge

Based on the knowledge graph and semantic analysis, here's what I found:

#### Graph Structure Context
Found ${graphContext.length} relevant components in the architecture:

${graphContext.slice(0, 5).map((item, idx) => `
${idx + 1}. **${item.name || item.id}**
   - Type: ${item.labels?.join(', ') || 'Unknown'}
   - Location: ${item.path || item.filePath || 'N/A'}
`).join('\n')}

#### Semantic Matches
Found ${vectorContext.length} semantically related components.

${vectorContext.slice(0, 3).map((item, idx) => `
${idx + 1}. ${item.document}
   - Relevance Score: ${(1 - item.distance).toFixed(2)}
`).join('\n')}

### Answer
${generateArchitectureAnswer(question, graphContext, vectorContext)}

### Related Components
This answer is based on analysis of ${graphContext.length} graph nodes and ${vectorContext.length} semantic matches.

*Note: This is a simulated response. For production, enable real LLM integration.*
    `.trim();
}

async function generateDocumentation(serviceData, functions, endpoints) {
    return `
# ${serviceData.name} - Service Documentation

## Overview
- **Service Name:** ${serviceData.name}
- **Type:** ${serviceData.type || 'service'}
- **Language:** ${serviceData.language || 'multi-language'}
- **Version:** ${serviceData.version || '1.0.0'}

## API Endpoints

${endpoints.length === 0 ? 'No endpoints detected.' : ''}
${endpoints.slice(0, 10).map(e => `
### ${e.method} ${e.path}
- **Handler:** ${e.handler || 'Unknown'}
- **File:** ${e.filePath || 'N/A'}:${e.line || 0}
- **Description:** Auto-detected API endpoint

**Example Request:**
\`\`\`bash
curl -X ${e.method} http://localhost:5000${e.path}
\`\`\`
`).join('\n')}

## Key Functions

Total functions: ${functions.length}

${functions.slice(0, 10).map(f => `
### \`${f.name}(${f.params?.join(', ') || ''})\`
- **File:** ${f.filePath}:${f.line}
- **Complexity:** ${f.complexity || 1}
- **Async:** ${f.isAsync ? 'Yes' : 'No'}
`).join('\n')}

## Architecture Notes

This service is part of the larger system architecture. Key characteristics:
- Implements ${endpoints.length} API endpoints
- Contains ${functions.length} functions
- Primary language: ${serviceData.language}

## Development Guide

### Setup
1. Install dependencies
2. Configure environment variables
3. Run tests
4. Start development server

### Testing
- Unit tests: Test individual functions
- Integration tests: Test API endpoints
- E2E tests: Test full workflows

*Generated automatically by KA-CHOW*
    `.trim();
}

async function generateOnboardingGuide(serviceArchitecture, keyComponents) {
    return `
# ${serviceArchitecture.service?.name || 'Service'} - Onboarding Guide

Welcome to the team! This guide will help you understand and contribute to this service.

## System Overview

${serviceArchitecture.service?.description || 'This service is a key component of our system architecture.'}

### Quick Stats
- **Files:** ${serviceArchitecture.files?.length || 0}
- **Functions:** ${serviceArchitecture.functions?.length || 0}
- **API Endpoints:** ${serviceArchitecture.endpoints?.length || 0}

## Architecture Overview

This service follows a standard architecture pattern:

\`\`\`
Frontend Requests
    ↓
API Endpoints (${serviceArchitecture.endpoints?.length || 0})
    ↓
Business Logic (${serviceArchitecture.functions?.length || 0} functions)
    ↓
Data Layer
\`\`\`

## Key Entry Points

### Main Endpoints
${keyComponents.mainEndpoints?.slice(0, 5).map(e => `
- **${e.method} ${e.path}**
  - Handler: ${e.handler}
  - File: ${e.filePath}
`).join('\n') || 'No main endpoints identified'}

### Core Functions
${keyComponents.coreFunctions?.slice(0, 5).map(f => `
- **${f.name}()** - ${f.filePath}:${f.line}
`).join('\n') || 'No core functions identified'}

## Development Workflow

1. **Clone and Setup**
   - Clone repository
   - Install dependencies
   - Configure environment

2. **Understanding the Code**
   - Start with entry files
   - Follow the request flow
   - Review key functions

3. **Making Changes**
   - Create feature branch
   - Write tests first
   - Implement changes
   - Run test suite

4. **Common Tasks**
   - Adding new endpoint
   - Modifying business logic
   - Database changes
   - Adding dependencies

## Important Concepts

### Code Organization
Files are organized by domain and responsibility. Key directories include controllers, services, and models.

### Testing Strategy
- Write tests for all new code
- Maintain code coverage
- Run integration tests before PR

## Where to Find Help

- **Documentation:** Check README and inline comments
- **Architecture Diagrams:** See docs folder
- **Team:** Reach out on Slack/Teams
- **Code Examples:** Look at similar features

## Next Steps

1. Set up your development environment
2. Run the test suite successfully
3. Pick a starter task from the backlog
4. Pair with a team member on your first PR

Good luck! 🚀

*Generated by KA-CHOW - Your AI Engineering Assistant*
    `.trim();
}

async function analyzeSystemHealth(healthMetrics, issues) {
    const score = calculateHealthScore(healthMetrics, issues);
    
    return `
## System Health Analysis

**Overall Health Score: ${score}/100**

### System Metrics Overview
- **Services:** ${healthMetrics.services || 0}
- **Files:** ${healthMetrics.files || 0}
- **Functions:** ${healthMetrics.functions || 0}
- **Endpoints:** ${healthMetrics.endpoints || 0}
- **Dependencies:** ${healthMetrics.dependencies || 0}

### Critical Issues

${issues.orphanFunctions > 0 ? `
⚠️ **Orphan Functions Detected: ${issues.orphanFunctions}**
- These functions are not called anywhere
- Possible dead code
- Recommended: Review and remove if unused
` : ''}

${issues.highComplexityFunctions > 0 ? `
⚠️ **High Complexity Functions: ${issues.highComplexityFunctions}**
- Functions with complexity > 10
- Harder to maintain and test
- Recommended: Refactor into smaller functions
` : ''}

### Architecture Health Indicators

${getHealthIndicators(healthMetrics, issues)}

### Maintenance Burden Assessment
${assessMaintenanceBurden(healthMetrics, issues)}

### Recommended Actions (Prioritized)

1. **P0 - Critical**
   ${issues.orphanFunctions > 10 ? '- Clean up orphan functions to reduce codebase bloat' : '- No critical issues detected'}

2. **P1 - High Priority**
   ${issues.highComplexityFunctions > 5 ? '- Refactor high complexity functions' : '- Continue monitoring code complexity'}

3. **P2 - Medium Priority**
   - Review and update documentation
   - Add missing test coverage

4. **P3 - Low Priority**
   - Code style improvements
   - Performance optimizations

### Summary
${score >= 80 ? '✅ System health is good. Continue current practices.' : score >= 60 ? '⚠️ System health is acceptable but needs attention.' : '❌ System health needs immediate improvement.'}

*Analysis generated by KA-CHOW Health Monitor*
    `.trim();
}

async function suggestRefactoring(functionData, dependencies, metrics) {
    return `
## Refactoring Suggestions for ${functionData.id}

### Current State
- **Complexity:** ${metrics.complexity || 'Unknown'}
- **Dependencies:** ${dependencies.length} components affected
- **Blast Radius:** ${metrics.severity || 'Medium'}

### Identified Issues

${identifyCodeSmells(functionData, metrics)}

### Refactoring Recommendations

1. **Reduce Complexity**
   - Break down into smaller functions
   - Extract reusable logic
   - Simplify conditional statements

2. **Improve Testability**
   - Reduce dependencies
   - Use dependency injection
   - Create clear interfaces

3. **Better Separation of Concerns**
   - Separate business logic from I/O
   - Extract data transformation logic
   - Create dedicated utility functions

4. **Reduce Coupling**
   - Limit function dependencies
   - Use events/callbacks where appropriate
   - Consider introducing interfaces

### Suggested Approach

\`\`\`
Step 1: Add comprehensive tests for current behavior
Step 2: Extract smaller helper functions
Step 3: Refactor in small, safe increments
Step 4: Validate with existing tests
Step 5: Update documentation
\`\`\`

### Expected Benefits
- ✅ Easier to test
- ✅ More maintainable
- ✅ Better reusability
- ✅ Reduced cognitive load

*Suggestions generated by KA-CHOW Code Analyzer*
    `.trim();
}

// Helper functions
function getNodeLabel(node) {
    if (node.name) return node.name;
    if (node.path) return `File: ${node.path}`;
    if (node.id) return node.id;
    return 'Unknown';
}

function generateArchitectureAnswer(question, graphContext, vectorContext) {
    const lowerQ = question.toLowerCase();
    
    if (lowerQ.includes('auth') || lowerQ.includes('login')) {
      return 'Based on the system analysis, authentication is handled through dedicated auth middleware and token-based validation. The flow involves token verification, user context injection, and protected route handling.';
    }
    
    if (lowerQ.includes('endpoint') || lowerQ.includes('api')) {
      return `The system exposes ${graphContext.filter(n => n.method).length} API endpoints across ${graphContext.filter(n => n.labels?.includes('Service')).length} services. These handle various operations including data retrieval, mutations, and system management.`;
    }
    
    if (lowerQ.includes('database') || lowerQ.includes('data')) {
      return 'Data persistence is managed through a combination of graph database (Neo4j) for structural relationships and vector database (ChromaDB) for semantic search capabilities.';
    }
    
    return `Based on analyzing ${graphContext.length} components in the knowledge graph, the system is architected with clear separation of concerns. Key patterns include layered architecture, dependency injection, and event-driven communication where appropriate.`;
}

function calculateHealthScore(metrics, issues) {
    let score = 100;
    
    // Deduct for orphan functions
    score -= Math.min(issues.orphanFunctions * 2, 20);
    
    // Deduct for high complexity
    score -= Math.min(issues.highComplexityFunctions * 3, 30);
    
    return Math.max(score, 0);
}

function getHealthIndicators(metrics, issues) {
    const indicators = [];
    
    if (metrics.dependencies > metrics.functions * 2) {
      indicators.push('⚠️ High dependency coupling detected');
    } else {
      indicators.push('✅ Dependency coupling is reasonable');
    }
    
    if (issues.orphanFunctions > metrics.functions * 0.1) {
      indicators.push('⚠️ Significant dead code present');
    } else {
      indicators.push('✅ Minimal dead code');
    }
    
    if (issues.highComplexityFunctions > metrics.functions * 0.05) {
      indicators.push('⚠️ Too many complex functions');
    } else {
      indicators.push('✅ Complexity is well managed');
    }
    
    return indicators.join('\n');
}

function assessMaintenanceBurden(metrics, issues) {
    const totalIssues = issues.orphanFunctions + issues.highComplexityFunctions;
    
    if (totalIssues < 5) {
      return '✅ **Low** - System is well maintained with minimal technical debt.';
    } else if (totalIssues < 15) {
      return '⚠️ **Medium** - Some technical debt exists but is manageable.';
    } else {
      return '❌ **High** - Significant technical debt requires attention.';
    }
}

function identifyCodeSmells(functionData, metrics) {
    const smells = [];
    
    if (metrics.complexity > 10) {
      smells.push('- **High Cyclomatic Complexity:** Function is doing too much');
    }
    
    if (metrics.totalNodes > 50) {
      smells.push('- **Large Blast Radius:** Changes affect many components');
    }
    
    if (functionData.params?.length > 5) {
      smells.push('- **Too Many Parameters:** Consider using object parameter');
    }
    
    return smells.length > 0 ? smells.join('\n') : '- No major code smells detected';
}

module.exports = {
  explainImpactAnalysis,
  answerArchitectureQuestion,
  generateDocumentation,
  generateOnboardingGuide,
  analyzeSystemHealth,
  suggestRefactoring
};
