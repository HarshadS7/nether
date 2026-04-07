const fs = require('fs').promises;
const path = require('path');
const javascriptParser = require('./javascript');
const pythonParser = require('./python');
const javaParser = require('./java');
const goParser = require('./go');

class ParserOrchestrator {
  constructor() {
    this.parsers = {
      '.js': javascriptParser,
      '.jsx': javascriptParser,
      '.ts': javascriptParser,
      '.tsx': javascriptParser,
      '.py': pythonParser,
      '.java': javaParser,
      '.go': goParser
    };
  }

  async parseFile(filePath) {
    try {
      const ext = path.extname(filePath);
      const parser = this.parsers[ext];

      if (!parser) {
        console.warn(`No parser available for ${ext} files`);
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return await parser.parse(filePath, content);
    } catch (error) {
      console.error(`Error parsing file ${filePath}:`, error.message);
      return null;
    }
  }

  async parseDirectory(dirPath, options = {}) {
    const {
      recursive = true,
      excludeDirs = ['node_modules', 'dist', 'build', '.git', '__pycache__', 'venv'],
      maxFiles = 1000
    } = options;

    const results = [];
    const queue = [dirPath];
    let filesProcessed = 0;

    while (queue.length > 0 && filesProcessed < maxFiles) {
      const currentPath = queue.shift();
      
      try {
        const stats = await fs.stat(currentPath);

        if (stats.isDirectory()) {
          const dirName = path.basename(currentPath);
          if (excludeDirs.includes(dirName)) continue;

          const entries = await fs.readdir(currentPath);
          for (const entry of entries) {
            const fullPath = path.join(currentPath, entry);
            if (recursive) {
              queue.push(fullPath);
            } else {
              const entryStats = await fs.stat(fullPath);
              if (entryStats.isFile()) {
                queue.push(fullPath);
              }
            }
          }
        } else if (stats.isFile()) {
          const parsed = await this.parseFile(currentPath);
          if (parsed) {
            results.push(parsed);
            filesProcessed++;
          }
        }
      } catch (error) {
        console.warn(`Error processing ${currentPath}:`, error.message);
      }
    }

    return results;
  }

  getSupportedExtensions() {
    return Object.keys(this.parsers);
  }
}

module.exports = new ParserOrchestrator();
