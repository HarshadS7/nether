const fs = require('fs').promises;

class PythonParser {
  /**
   * Get the indentation level (number of leading spaces/tabs) of a line.
   * Tabs count as 4 spaces for consistency.
   */
  _getIndent(line) {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;
    return match[1].replace(/\t/g, '    ').length;
  }

  /**
   * Find the end line of an indented block starting at `startIdx`.
   * Scans forward to find where the indentation drops back to or below `baseIndent`.
   */
  _findBlockEnd(lines, startIdx, baseIndent) {
    let lastNonEmptyLine = startIdx;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      // Skip blank lines
      if (line.trim() === '') continue;
      const indent = this._getIndent(line);
      if (indent <= baseIndent) {
        // We've exited the block
        return lastNonEmptyLine + 1; // 1-indexed
      }
      lastNonEmptyLine = i;
    }
    // Reached end of file while still in the block
    return lastNonEmptyLine + 1; // 1-indexed
  }

  async parse(filePath, content) {
    try {
      const result = {
        filePath,
        language: 'python',
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        endpoints: [],
        calls: []
      };

      const lines = content.split('\n');
      let currentClass = null;
      let classBaseIndent = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const indent = this._getIndent(line);

        // Check if we've exited the current class scope
        if (currentClass && line.trim() !== '' && indent <= classBaseIndent) {
          currentClass = null;
          classBaseIndent = -1;
        }

        // Class definitions
        const classMatch = line.match(/^\s*class\s+(\w+)(?:\((.*?)\))?:/);
        if (classMatch) {
          const endLine = this._findBlockEnd(lines, i, indent);
          const cls = {
            name: classMatch[1],
            superClass: classMatch[2] || null,
            line: lineNum,
            endLine,
            methods: []
          };
          result.classes.push(cls);
          currentClass = cls;
          classBaseIndent = indent;
        }

        // Function / method definitions
        const funcMatch = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\((.*?)\)/);
        if (funcMatch) {
          const isAsync = line.trim().startsWith('async def');
          const endLine = this._findBlockEnd(lines, i, indent);
          const funcData = {
            name: funcMatch[1],
            type: 'function',
            params: funcMatch[2].split(',').map(p => p.trim()).filter(p => p),
            line: lineNum,
            endLine,
            isAsync
          };

          // If inside a class, add as method; otherwise top-level function
          if (currentClass && indent > classBaseIndent) {
            currentClass.methods.push(funcData);
          } else {
            result.functions.push(funcData);
          }
        }

        // Import statements
        const importMatch = line.match(/^\s*import\s+(.+)/);
        if (importMatch) {
          const modules = importMatch[1].split(',').map(m => m.trim());
          modules.forEach(mod => {
            result.imports.push({
              source: mod,
              type: 'import'
            });
          });
        }

        // From imports
        const fromImportMatch = line.match(/^\s*from\s+(\S+)\s+import\s+(.+)/);
        if (fromImportMatch) {
          result.imports.push({
            source: fromImportMatch[1],
            specifiers: fromImportMatch[2].split(',').map(s => s.trim()),
            type: 'from-import'
          });
        }

        // Flask/FastAPI endpoints
        const routeMatch = line.match(/@(?:app|router|api)\.(\w+)\(['"](.+?)['"]/);
        if (routeMatch) {
          result.endpoints.push({
            method: routeMatch[1].toUpperCase(),
            path: routeMatch[2],
            line: lineNum
          });
        }

        // Django URLs
        const djangoUrlMatch = line.match(/path\(['"](.+?)['"],\s*(\w+)/);
        if (djangoUrlMatch) {
          result.endpoints.push({
            method: 'ANY',
            path: djangoUrlMatch[1],
            handler: djangoUrlMatch[2],
            line: lineNum
          });
        }
      }

      return result;
    } catch (error) {
      console.error(`Error parsing Python file ${filePath}:`, error.message);
      return null;
    }
  }
}

module.exports = new PythonParser();
