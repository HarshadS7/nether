"""
Nether — Knowledge Graph Builder

Takes parsed file data and builds a NetworkX directed graph
with atomic nodes (module, file, class, function, external).
"""

import networkx as nx
from pathlib import Path


def _is_dunder(name: str) -> bool:
    return name.startswith('__') and name.endswith('__')


def build_graph(parsed_files: list[dict]) -> nx.DiGraph:
    """
    Builds an atomic knowledge graph from parsed file data.
    
    Nodes:
      - Module: id="module:path/to/dir", type="module", name="dir"
      - File: id="file:path/to/file.py", type="file", name="file.py"
      - Class: id="class:path:ClassName", type="class", name="ClassName"
      - Function: id="function:path:FuncName", type="function", name="FuncName"
      - External: id="external:name", type="external", name="name"
      
    Edges (type):
      - contains (module -> file, file -> class, file/class -> function)
      - imports (file -> file, file -> external)
      - calls (function -> function)
    """
    G = nx.DiGraph()
    
    # ── 1. Create File and Module Nodes ─────────────────
    for f in parsed_files:
        fpath = f['path']
        file_id = f"file:{fpath}"
        G.add_node(
            file_id, 
            type="file", 
            name=Path(fpath).name,
            path=fpath,
            language=f.get('language', 'unknown'),
            line_count=f.get('line_count', 0)
        )
        
        # Modules
        parts = Path(fpath).parent
        if str(parts) != '.':
            p = Path()
            prev_mod_id = None
            for part in parts.parts:
                p = p / part
                mod_id = f"module:{p}"
                if not G.has_node(mod_id):
                    G.add_node(mod_id, type="module", name=part, path=str(p))
                
                # Link parent module -> child module
                if prev_mod_id:
                    G.add_edge(prev_mod_id, mod_id, type="contains")
                prev_mod_id = mod_id
                
            # Link innermost module -> file
            if prev_mod_id:
                G.add_edge(prev_mod_id, file_id, type="contains")
        else:
            # Root module
            G.add_edge("module:_root", file_id, type="contains")
            if not G.has_node("module:_root"):
                G.add_node("module:_root", type="module", name="_root", path=".")

    # ── 2. Create Definition Nodes (Classes/Functions) ──
    # Build a lookup to resolve cross-file calls later
    def_lookup: dict[str, str] = {}  # def_name -> node_id
    
    for f in parsed_files:
        fpath = f['path']
        file_id = f"file:{fpath}"
        
        for d in f.get('definitions', []):
            if _is_dunder(d['name']):
                continue
                
            def_type = d['type'] # 'class' or 'function'
            def_name = d['name']
            node_id = f"{def_type}:{fpath}:{def_name}"
            
            G.add_node(
                node_id,
                type=def_type,
                name=def_name,
                path=fpath,
                line_number=d.get('line_number'),
                signature=d.get('signature'),
                docstring=d.get('docstring')
            )
            
            # File contains Definition
            G.add_edge(file_id, node_id, type="contains")
            
            # Add to lookup (if duplicates exist, last one wins for now—good enough heuristic)
            def_lookup[def_name] = node_id

    # ── 3. Create Import Edges ──────────────────────────
    file_lookup = {Path(f['path']).stem: f"file:{f['path']}" for f in parsed_files}
    file_lookup.update({f['path']: f"file:{f['path']}" for f in parsed_files})
    
    for f in parsed_files:
        file_id = f"file:{f['path']}"
        for imp in f.get('imports', []):
            imp_base = imp.split('.')[-1]
            if _is_dunder(imp_base):
                continue
                
            # Internal import
            if imp_base in file_lookup:
                target_id = file_lookup[imp_base]
                if target_id != file_id:
                    G.add_edge(file_id, target_id, type="imports")
            # External import
            else:
                ext_id = f"external:{imp}"
                if not G.has_node(ext_id):
                    G.add_node(ext_id, type="external", name=imp)
                G.add_edge(file_id, ext_id, type="imports")

    # ── 4. Create Call Edges ────────────────────────────
    for f in parsed_files:
        fpath = f['path']
        # Which function makes this call? (We approximate by attaching calls to the file if we don't know the exact caller scoped logic)
        # Because Phase 1 extract_calls was at the file level:
        # We will iterate through f['calls'] and link the FILE to the called FUNCTION.
        # To be purely atomic for Function -> Function, we'd need Phase 1 to scope calls inside functions.
        # Given current Phase 1, we link File -> calls -> Function
        file_id = f"file:{fpath}"
        unique_calls = list(dict.fromkeys(f.get('calls', [])))
        for call in unique_calls:
            if _is_dunder(call):
                continue
            if call in def_lookup:
                G.add_edge(file_id, def_lookup[call], type="calls")
            else:
                ext_id = f"external:{call}()"
                if not G.has_node(ext_id):
                    G.add_node(ext_id, type="external", name=f"{call}()")
                G.add_edge(file_id, ext_id, type="calls")

    return G


# Utility getters
def get_node_info(G: nx.DiGraph, node_id: str) -> dict:
    return G.nodes.get(node_id, {})

def get_dependencies(G: nx.DiGraph, node_id: str) -> list[str]:
    """Returns nodes this node points to (e.g. what it imports/calls)."""
    return list(G.successors(node_id))

def get_dependents(G: nx.DiGraph, node_id: str) -> list[str]:
    """Returns nodes that point to this node (e.g. who calls it)."""
    return list(G.predecessors(node_id))
