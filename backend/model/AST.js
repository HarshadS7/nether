const mongoose = require('mongoose');

const ASTSchema = new mongoose.Schema({
  pipelineId: {
    type: String,
    required: true,
    index: true
  },
  filePath: {
    type: String,
    required: true,
    index: true
  },
  language: {
    type: String,
    required: true,
    enum: ['javascript', 'typescript', 'python', 'java', 'go'],
    index: true
  },
  ast: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  parseResult: {
    functions: mongoose.Schema.Types.Mixed,
    classes: mongoose.Schema.Types.Mixed,
    imports: mongoose.Schema.Types.Mixed,
    exports: mongoose.Schema.Types.Mixed,
    endpoints: mongoose.Schema.Types.Mixed,
    calls: mongoose.Schema.Types.Mixed
  },
  metadata: {
    codeLength: Number,
    linesOfCode: Number,
    complexity: Number,
    functionsCount: Number,
    classesCount: Number,
    importsCount: Number,
    exportsCount: Number
  }
}, {
  timestamps: true
});

// Indexes for better query performance
ASTSchema.index({ pipelineId: 1, filePath: 1 });
ASTSchema.index({ 'parseResult.functions.name': 1 });
ASTSchema.index({ 'parseResult.classes.name': 1 });
ASTSchema.index({ language: 1, createdAt: -1 });

// Virtual for getting function names
ASTSchema.virtual('functionNames').get(function() {
  return this.parseResult.functions?.map(f => f.name) || [];
});

// Virtual for getting class names
ASTSchema.virtual('classNames').get(function() {
  return this.parseResult.classes?.map(c => c.name) || [];
});

// Method to find by function name
ASTSchema.statics.findByFunction = function(functionName) {
  return this.find({ 'parseResult.functions.name': functionName });
};

// Method to find by class name
ASTSchema.statics.findByClass = function(className) {
  return this.find({ 'parseResult.classes.name': className });
};

// Method to find by file path
ASTSchema.statics.findByFile = function(filePath) {
  return this.find({ filePath });
};

// Method to get latest AST for a file
ASTSchema.statics.getLatestByFile = function(filePath) {
  return this.findOne({ filePath }).sort({ createdAt: -1 });
};

const AST = mongoose.model('AST', ASTSchema);

module.exports = AST;
