"""
Nether — Obsidian Vault Generator (Atomic)

Reads a NetworkX Directed Graph and generates interconnected markdown files
for Obsidian visualization. Every atomic node gets its own file.
by Team Kittens 🐱
"""

import re
import networkx as nx
from pathlib import Path


def _sanitize(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', '_', name).strip('. ')[:100]


def _get_filename(node_id: str, node_data: dict) -> str:
    """Consistently generate a clean filename for a given node."""
    ntype = node_data.get("type", "unknown")
    name = node_data.get("name", "Unknown")
    
    if ntype == "module":
        return _sanitize(f"📁 {name} (module)")
    elif ntype == "file":
        return _sanitize(f"📄 {name}")
    elif ntype == "class":
        # Keep it unique by prepending the filename if possible
        fstem = Path(node_data.get("path", "")).stem
        return _sanitize(f"🔷 {name} ({fstem})")
    elif ntype == "function":
        fstem = Path(node_data.get("path", "")).stem
        return _sanitize(f"🔹 {name} ({fstem})")
    elif ntype == "external":
        return _sanitize(f"📦 {name} (ext)")
    else:
        return _sanitize(name)


def generate_vault(G: nx.DiGraph, output_dir: str, repo_name: str = "repo") -> dict:
    """
    Generate a flat Obsidian vault from a NetworkX Knowledge Graph.
    """
    vault = Path(output_dir)
    vault.mkdir(parents=True, exist_ok=True)

    # Clear existing markdown
    for f in vault.glob("*.md"):
        f.unlink()
        
    # Build a lookup table from node_id -> exactly formatted markdown link text
    # e.g., node_id -> "📄 config.py"
    filenames = {}
    for node_id, data in G.nodes(data=True):
        filenames[node_id] = _get_filename(node_id, data)

    # ── Write Nodes ──────────────────────────────────────
    total_links = 0
    for node_id, data in G.nodes(data=True):
        fname = filenames[node_id]
        ntype = data.get("type", "unknown")
        
        lines = [
            f"---\n",
            f"tags: [{ntype}]\n",
            f"---\n\n",
            f"# {fname}\n",
        ]
        
        # Metadata properties
        lines.append("## Metadata\n")
        lines.append(f"**Type:** {ntype.title()}  \n")
        if "path" in data:
            lines.append(f"**Path:** `{data['path']}`  \n")
        if "language" in data:
            lines.append(f"**Language:** {data['language'].title()}  \n")
        if "line_number" in data:
            lines.append(f"**Line:** {data['line_number']}  \n")
        if "signature" in data:
            lines.append(f"**Signature:** `{data['signature']}`  \n")
        
        lines.append("\n")
        
        if "docstring" in data and data["docstring"]:
            lines.append(f"> {data['docstring']}\n\n")

        # Edges — Organize incoming/outgoing by edge type
        out_edges = G.out_edges(node_id, data=True)
        in_edges = G.in_edges(node_id, data=True)
        
        # Sort out edges by type
        out_by_type = {}
        for u, v, edata in out_edges:
            etype = edata.get("type", "links to")
            out_by_type.setdefault(etype, []).append(v)
            
        # Write Outgoing Links
        for etype, targets in out_by_type.items():
            lines.append(f"## {etype.title()}\n")
            for t in sorted(targets, key=lambda x: filenames[x]):
                lines.append(f"- [[{filenames[t]}]]\n")
                total_links += 1
            lines.append("\n")

        # Sort in edges by type
        in_by_type = {}
        for u, v, edata in in_edges:
            etype = edata.get("type", "linked from")
            in_by_type.setdefault(etype, []).append(u)
            
        # Write Incoming Links
        if in_by_type:
            lines.append("## Dependencies (Incoming)\n")
            for etype, sources in in_by_type.items():
                lines.append(f"### {etype.title()} by\n")
                for s in sorted(sources, key=lambda x: filenames[x]):
                    lines.append(f"- [[{filenames[s]}]]\n")
                lines.append("\n")

        # Write to disk
        (vault / f"{fname}.md").write_text("".join(lines))

    # ── Index ──────────────────────────────────────────
    idx = [
        "---\n",
        "tags: [index]\n",
        "---\n\n",
        "# 🧠 Nether — Atomic Knowledge Graph\n",
        f"**Repository:** `{repo_name}`  \n",
        f"**Total Nodes:** {G.number_of_nodes()} | **Total Edges:** {G.number_of_edges()}\n\n",
    ]
    
    # Overview lists
    kinds = ["module", "file", "class", "function", "external"]
    for k in kinds:
        nodes_of_type = [n for n, d in G.nodes(data=True) if d.get("type") == k]
        if not nodes_of_type:
            continue
            
        idx.append(f"## {k.title()}s ({len(nodes_of_type)})\n")
        
        # Limit index clutter to 50 max per category
        for n in sorted(nodes_of_type, key=lambda x: filenames[x])[:50]:
            idx.append(f"- [[{filenames[n]}]]\n")
            
        if len(nodes_of_type) > 50:
            idx.append(f"- *...and {len(nodes_of_type) - 50} more*\n")
        idx.append("\n")

    (vault / "_Index.md").write_text("".join(idx))

    return {
        "notes": G.number_of_nodes(),       # Each node is exactly 1 note
        "backlinks": total_links,           # Outgoing edges = links in Obsidian
        "vault_path": str(vault),
    }
