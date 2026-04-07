const fs = require('fs').promises;

class JavaParser {
  async parse(filePath, content) {
    try {
      const result = {
        filePath,
        language: 'java',
        functions: [],
        classes: [],
        imports: [],
        exports: [],
        endpoints: [],
        calls: []
      };

      const lines = content.split('\n');
      let currentClass = null;
      let inAnnotation = false;
      let lastAnnotation = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNum = i + 1;

        // Package declaration
        const packageMatch = line.match(/^package\s+([\w.]+);/);
        if (packageMatch) {
          result.package = packageMatch[1];
        }

        // Import statements
        const importMatch = line.match(/^import\s+(static\s+)?([\w.*]+);/);
        if (importMatch) {
          result.imports.push({
            source: importMatch[2],
            isStatic: !!importMatch[1]
          });
        }

        // Annotations (for Spring endpoints, etc.)
        const annotationMatch = line.match(/^@(\w+)(?:\((.*?)\))?/);
        if (annotationMatch) {
          lastAnnotation = {
            name: annotationMatch[1],
            params: annotationMatch[2]
          };
          inAnnotation = true;
        }

        // Class declarations
        const classMatch = line.match(/(?:public|private|protected)?\s*(?:abstract|final)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?/);
        if (classMatch) {
          currentClass = {
            name: classMatch[1],
            superClass: classMatch[2] || null,
            line: lineNum,
            methods: [],
            annotations: lastAnnotation ? [lastAnnotation] : []
          };
          result.classes.push(currentClass);
          lastAnnotation = null;
        }

        // Method declarations
        const methodMatch = line.match(/(?:public|private|protected)?\s*(?:static)?\s*(?:final)?\s*(\w+(?:<.*?>)?)\s+(\w+)\s*\((.*?)\)/);
        if (methodMatch && currentClass && !line.includes('class')) {
          const method = {
            returnType: methodMatch[1],
            name: methodMatch[2],
            params: methodMatch[3] ? methodMatch[3].split(',').map(p => p.trim()) : [],
            line: lineNum
          };

          // Check for Spring endpoints
          if (lastAnnotation) {
            const endpointAnnotations = ['GetMapping', 'PostMapping', 'PutMapping', 'DeleteMapping', 'RequestMapping'];
            if (endpointAnnotations.includes(lastAnnotation.name)) {
              const pathMatch = lastAnnotation.params?.match(/["'](.*?)["']/);
              result.endpoints.push({
                method: lastAnnotation.name.replace('Mapping', '').toUpperCase() || 'ANY',
                path: pathMatch ? pathMatch[1] : '/',
                handler: method.name,
                line: lineNum,
                annotation: lastAnnotation.name
              });
            }
            method.annotations = [lastAnnotation];
          }

          currentClass.methods.push(method);
          lastAnnotation = null;
        }
      }

      return result;
    } catch (error) {
      console.error(`Error parsing Java file ${filePath}:`, error.message);
      return null;
    }
  }
}

module.exports = new JavaParser();
