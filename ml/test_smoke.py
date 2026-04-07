"""Smoke test — validates all ML service modules work together."""
import sys
sys.path.insert(0, ".")

# ── Test 1: Schema imports ──
from models.schemas import PushRequest, PushResponse, PushType, ParseResult
print("OK: schemas")

# ── Test 2: Parser factory ──
from parser.parser_factory import ParserFactory
print("OK: parser factory")

# ── Test 3: Python parser ──
py_code = """
import os
from pathlib import Path

class FileManager:
    def __init__(self, path):
        self.path = path
    def read(self):
        return open(self.path).read()
    def write(self, data):
        with open(self.path, 'w') as f:
            f.write(data)

def process(file_name):
    manager = FileManager(file_name)
    content = manager.read()
    return validate(content)
"""
result = ParserFactory.parse("test.py", py_code)
print(f"Python: {len(result.functions)} funcs, {len(result.classes)} classes, imports={result.imports}, calls={result.calls}")

# ── Test 4: C++ parser ──
cpp_code = """
#include <iostream>
#include "db.h"

class AuthService {
public:
    bool login(string username, string password) {
        bool valid = validate(username, password);
        return valid;
    }
};

int main() {
    AuthService auth;
    return 0;
}
"""
result2 = ParserFactory.parse("app.cpp", cpp_code)
print(f"C++: {len(result2.functions)} funcs, {len(result2.classes)} classes, imports={result2.imports}, calls={result2.calls}")

# ── Test 5: JavaScript parser ──
js_code = """
import express from "express";
import { db } from "./database";

class UserController {
    async getUser(id) {
        return db.findOne({ id });
    }
}

async function handleRequest(req, res) {
    const user = await getUser(token.id);
    res.json(user);
}

export const validateInput = (data) => {
    return schema.validate(data);
};
"""
result3 = ParserFactory.parse("app.js", js_code)
print(f"JS: {len(result3.functions)} funcs, {len(result3.classes)} classes, imports={result3.imports}, calls={result3.calls}")

# ── Test 6: Java parser ──
java_code = """
import java.util.List;
import com.example.service.UserService;

public class App extends BaseApp implements Runnable {
    public void run() {
        List users = getAll();
        process(users);
    }
    public String getName() {
        return "App";
    }
}
"""
result4 = ParserFactory.parse("App.java", java_code)
print(f"Java: {len(result4.functions)} funcs, {len(result4.classes)} classes, imports={result4.imports}, calls={result4.calls}")

# ── Test 7: Versioning + Diff ──
from versioning.version_store import VersionStore
from versioning.diff_engine import DiffEngine
import tempfile

with tempfile.TemporaryDirectory() as tmpdir:
    store = VersionStore(tmpdir)
    v1 = store.store_version("proj", "test.py", py_code, result)
    print(f"Version stored: v{v1.version}")

    py_code_v2 = """
import os
from pathlib import Path

class FileManager:
    def __init__(self, path):
        self.path = path
    def read(self):
        return open(self.path).read()
    def delete(self):
        import os; os.remove(self.path)

def process(file_name):
    manager = FileManager(file_name)
    return validate(manager.read())

def new_function():
    pass
"""
    result_v2 = ParserFactory.parse("test.py", py_code_v2)
    v2 = store.store_version("proj", "test.py", py_code_v2, result_v2)
    print(f"Version stored: v{v2.version}")

    diff = DiffEngine.compute_diff(result, result_v2, 1, 2)
    print(f"Diff: added={diff.added_functions}, removed={diff.removed_functions}, modified={diff.modified_functions}")

# ── Test 8: Graph client ──
from integrations.graph_client import GraphClient
graph = GraphClient()
update = graph.sync_file("test.py", result)
print(f"Graph: +{len(update.nodes_to_add)} nodes, +{len(update.edges_to_add)} edges")
print(f"Graph state: {graph.get_graph_summary()}")

# ── Test 9: Context builder ──
from integrations.vector_client import VectorClient
from context.context_builder import ContextBuilder

vector = VectorClient()
ctx_builder = ContextBuilder(graph, vector)
ctx = ctx_builder.build("test.py", py_code, PushType.NEW, result)
prompt = ctx_builder.format_prompt(ctx)
print(f"Context prompt length: {len(prompt)} chars")
print("Prompt preview:")
print(prompt[:300])

# ── Test 10: Reasoning engine (stub mode) ──
from llm.reasoning import ReasoningEngine
engine = ReasoningEngine()
output = engine.reason(ctx, prompt)
print(f"Reasoning: risk={output.risk_level}, suggestions={len(output.suggestions)}")
print(f"Doc preview: {output.documentation[:100]}...")

print()
print("=" * 50)
print("ALL TESTS PASSED")
print("=" * 50)
