const mongoose = require('mongoose');

const documentationBlockSchema = new mongoose.Schema({
  content: {
    type: String,
    required: false,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  generatedBy: {
    type: String,
    enum: ['llm', 'ast', 'manual'],
    default: 'ast'
  },
  version: {
    type: Number,
    default: 1
  }
}, { _id: false });

const documentationSchema = new mongoose.Schema({
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    index: true
  },
  repositoryUrl: {
    type: String,
    required: true,
    index: true
  },
  repositoryName: {
    type: String,
    required: true
  },
  
  // Fixed documentation blocks
  blocks: {
    introduction: {
      type: documentationBlockSchema,
      default: () => ({ content: '', updatedAt: new Date() })
    },
    environment: {
      type: documentationBlockSchema,
      default: () => ({ content: '', updatedAt: new Date() })
    },
    running: {
      type: documentationBlockSchema,
      default: () => ({ content: '', updatedAt: new Date() })
    },
    installation: {
      type: documentationBlockSchema,
      default: () => ({ content: '', updatedAt: new Date() })
    },
    configuration: {
      type: documentationBlockSchema,
      default: () => ({ content: '', updatedAt: new Date() })
    }
  },
  
  // Dynamic blocks based on AST/Knowledge Graph
  dynamicBlocks: {
    type: Map,
    of: documentationBlockSchema,
    default: () => new Map()
  },
  
  // Metadata
  metadata: {
    totalBlocks: { type: Number, default: 0 },
    lastFullRegeneration: { type: Date },
    fileCount: { type: Number, default: 0 },
    functionCount: { type: Number, default: 0 },
    apiEndpointsCount: { type: Number, default: 0 },
    language: { type: String, default: 'javascript' }
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for fast lookups
documentationSchema.index({ workspaceId: 1, repositoryUrl: 1 }, { unique: true });
documentationSchema.index({ repositoryName: 1 });

// Instance methods
documentationSchema.methods.updateBlock = function(blockName, content, generatedBy = 'ast') {
  const blockPath = this.blocks[blockName] ? 'blocks' : 'dynamicBlocks';
  
  if (blockPath === 'blocks') {
    this.blocks[blockName] = {
      content,
      updatedAt: new Date(),
      generatedBy,
      version: (this.blocks[blockName]?.version || 0) + 1
    };
  } else {
    this.dynamicBlocks.set(blockName, {
      content,
      updatedAt: new Date(),
      generatedBy,
      version: (this.dynamicBlocks.get(blockName)?.version || 0) + 1
    });
  }
  
  this.updatedAt = new Date();
  this.metadata.totalBlocks = Object.keys(this.blocks).length + this.dynamicBlocks.size;
};

documentationSchema.methods.getBlock = function(blockName) {
  if (this.blocks[blockName]) {
    return this.blocks[blockName];
  }
  return this.dynamicBlocks.get(blockName);
};

documentationSchema.methods.getAllBlocks = function() {
  const allBlocks = { ...this.blocks };
  this.dynamicBlocks.forEach((value, key) => {
    allBlocks[key] = value;
  });
  return allBlocks;
};

documentationSchema.methods.generateMarkdown = function() {
  let markdown = `# ${this.repositoryName} Documentation\n\n`;
  markdown += `*Last Updated: ${this.updatedAt.toISOString()}*\n\n`;
  markdown += '---\n\n';
  
  // Add fixed blocks in order
  const blockOrder = ['introduction', 'installation', 'environment', 'configuration', 'running'];
  
  for (const blockName of blockOrder) {
    if (this.blocks[blockName]?.content) {
      const title = blockName.charAt(0).toUpperCase() + blockName.slice(1);
      markdown += `## ${title}\n\n`;
      markdown += `${this.blocks[blockName].content}\n\n`;
    }
  }
  
  // Add dynamic blocks
  if (this.dynamicBlocks.size > 0) {
    markdown += '---\n\n';
    this.dynamicBlocks.forEach((block, name) => {
      if (block.content) {
        const title = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        markdown += `## ${title}\n\n`;
        markdown += `${block.content}\n\n`;
      }
    });
  }
  
  return markdown;
};

// Static methods
documentationSchema.statics.findOrCreateByRepository = async function(repositoryUrl, repositoryName, workspaceId = null) {
  let doc = await this.findOne({ repositoryUrl });
  
  if (!doc) {
    doc = new this({
      repositoryUrl,
      repositoryName,
      workspaceId
    });
    await doc.save();
  }
  
  return doc;
};

const Documentation = mongoose.model('Documentation', documentationSchema);

module.exports = Documentation;
