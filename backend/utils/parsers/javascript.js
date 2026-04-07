const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs').promises;
const path = require('path');

class JavaScriptParser {
  async parse(filePath, content) {
    try {
      const ast = parser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
      });

      const result = {
        filePath,
        language: 'javascript',
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        endpoints: [],
        calls: []
      };

      let currentClass = null;

      // Store reference to this for use in callbacks
      const self = this;

      traverse(ast, {
        // Function declarations
        FunctionDeclaration(path) {
          const func = {
            name: path.node.id?.name,
            type: 'function',
            params: path.node.params.map(p => self.getParamName(p)),
            line: path.node.loc?.start.line,
            endLine: path.node.loc?.end.line,
            isAsync: path.node.async,
            isGenerator: path.node.generator
          };
          result.functions.push(func);
        },

        // Arrow functions and function expressions
        VariableDeclarator(path) {
          if (path.node.init && 
              (path.node.init.type === 'ArrowFunctionExpression' || 
               path.node.init.type === 'FunctionExpression')) {
            const func = {
              name: path.node.id.name,
              type: 'function',
              params: path.node.init.params.map(p => self.getParamName(p)),
              line: path.node.loc?.start.line,
              endLine: path.node.loc?.end.line,
              isAsync: path.node.init.async
            };
            result.functions.push(func);
          }
        },

        // Class declarations
        ClassDeclaration(path) {
          currentClass = {
            name: path.node.id.name,
            methods: [],
            line: path.node.loc?.start.line,
            endLine: path.node.loc?.end.line,
            superClass: path.node.superClass?.name
          };
          result.classes.push(currentClass);
        },

        // Class methods
        ClassMethod(path) {
          if (currentClass) {
            const method = {
              name: path.node.key.name,
              type: path.node.kind,
              params: path.node.params.map(p => self.getParamName(p)),
              line: path.node.loc?.start.line,
              isAsync: path.node.async,
              isStatic: path.node.static
            };
            currentClass.methods.push(method);
          }
        },

        // Import statements
        ImportDeclaration(path) {
          result.imports.push({
            source: path.node.source.value,
            specifiers: path.node.specifiers.map(s => ({
              name: s.local.name,
              imported: s.imported?.name || 'default'
            }))
          });
        },

        // Export statements
        ExportNamedDeclaration(path) {
          if (path.node.declaration) {
            result.exports.push({
              type: 'named',
              name: path.node.declaration.id?.name
            });
          }
        },

        ExportDefaultDeclaration(path) {
          result.exports.push({
            type: 'default',
            name: path.node.declaration.id?.name || 'default'
          });
        },

        // Express/API endpoint detection
        CallExpression(path) {
          const callee = path.node.callee;
          
          // Detect Express routes: app.get(), router.post(), etc.
          if (callee.type === 'MemberExpression' && 
              callee.property.type === 'Identifier') {
            const method = callee.property.name.toUpperCase();
            const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
            
            if (httpMethods.includes(method) && path.node.arguments.length > 0) {
              const routePath = self.getStringValue(path.node.arguments[0]);
              if (routePath) {
                result.endpoints.push({
                  method,
                  path: routePath,
                  line: path.node.loc?.start.line
                });
              }
            }
          }

          // Track function calls for dependency graph
          if (callee.type === 'Identifier') {
            result.calls.push({
              name: callee.name,
              line: path.node.loc?.start.line
            });
          } else if (callee.type === 'MemberExpression') {
            const fullName = self.getMemberExpressionName(callee);
            if (fullName) {
              result.calls.push({
                name: fullName,
                line: path.node.loc?.start.line
              });
            }
          }
        }
      });

      return result;
    } catch (error) {
      console.error(`Error parsing JavaScript file ${filePath}:`, error.message);
      return null;
    }
  }

  getParamName(param) {
    if (param.type === 'Identifier') return param.name;
    if (param.type === 'RestElement') return `...${param.argument.name}`;
    if (param.type === 'AssignmentPattern') return this.getParamName(param.left);
    return 'unknown';
  }

  getStringValue(node) {
    if (node.type === 'StringLiteral') return node.value;
    if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
      return node.quasis[0].value.raw;
    }
    return null;
  }

  getMemberExpressionName(node) {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression') {
      const obj = this.getMemberExpressionName(node.object);
      const prop = node.property.name;
      return obj ? `${obj}.${prop}` : prop;
    }
    return null;
  }
}

module.exports = new JavaScriptParser();
