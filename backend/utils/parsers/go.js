const fs = require('fs').promises;

class GoParser {
  async parse(filePath, content) {
    try {
      const result = {
        filePath,
        language: 'go',
        functions: [],
        classes: [], // Go uses structs, not classes
        structs: [],
        imports: [],
        exports: [],
        endpoints: [],
        calls: []
      };

      const lines = content.split('\n');
      let inImport = false;
      let currentStruct = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;

        // Package declaration
        const packageMatch = line.match(/^package\s+(\w+)/);
        if (packageMatch) {
          result.package = packageMatch[1];
        }

        // Import statements (single line)
        const singleImportMatch = line.match(/^import\s+"(.+)"/);
        if (singleImportMatch) {
          result.imports.push({
            source: singleImportMatch[1]
          });
        }

        // Import block start
        if (line === 'import (') {
          inImport = true;
          continue;
        }

        // Import block end
        if (inImport && line === ')') {
          inImport = false;
          continue;
        }

        // Import within block
        if (inImport) {
          const importMatch = line.match(/"(.+)"/);
          if (importMatch) {
            result.imports.push({
              source: importMatch[1]
            });
          }
        }

        // Struct declarations
        const structMatch = line.match(/^type\s+(\w+)\s+struct\s*{?/);
        if (structMatch) {
          currentStruct = {
            name: structMatch[1],
            fields: [],
            methods: [],
            line: lineNum
          };
          result.structs.push(currentStruct);
        }

        // Function declarations
        const funcMatch = line.match(/^func\s+(\w+)\s*\((.*?)\)\s*(?:\((.*?)\))?\s*{?/);
        if (funcMatch) {
          result.functions.push({
            name: funcMatch[1],
            type: 'function',
            params: funcMatch[2] ? funcMatch[2].split(',').map(p => p.trim()) : [],
            returns: funcMatch[3] || '',
            line: lineNum
          });
        }

        // Method declarations (receiver functions)
        const methodMatch = line.match(/^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\((.*?)\)\s*(?:\((.*?)\))?\s*{?/);
        if (methodMatch && currentStruct) {
          const method = {
            receiver: methodMatch[1],
            receiverType: methodMatch[2],
            name: methodMatch[3],
            params: methodMatch[4] ? methodMatch[4].split(',').map(p => p.trim()) : [],
            returns: methodMatch[5] || '',
            line: lineNum
          };

          // Find the struct this method belongs to
          const struct = result.structs.find(s => s.name === methodMatch[2]);
          if (struct) {
            struct.methods.push(method);
          }
        }

        // HTTP endpoint detection (common Go frameworks)
        // Gin framework
        const ginMatch = line.match(/\.(\w+)\(['"](.*?)['"],/);
        if (ginMatch && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(ginMatch[1].toUpperCase())) {
          result.endpoints.push({
            method: ginMatch[1].toUpperCase(),
            path: ginMatch[2],
            line: lineNum,
            framework: 'gin'
          });
        }

        // Chi/Gorilla mux
        const muxMatch = line.match(/\.Handle(?:Func)?\(['"](.*?)['"],/);
        if (muxMatch) {
          result.endpoints.push({
            method: 'ANY',
            path: muxMatch[1],
            line: lineNum,
            framework: 'mux'
          });
        }
      }

      return result;
    } catch (error) {
      console.error(`Error parsing Go file ${filePath}:`, error.message);
      return null;
    }
  }
}

module.exports = new GoParser();
