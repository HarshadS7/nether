"""
Graph sync client — interface to Neo4j for storing the dependency graph.

The ML service never directly manipulates the database.
All graph operations go through this client, which talks to the backend
(or directly to Neo4j in prototype mode).

Current implementation: stub that maintains an in-memory graph
and logs operations. Replace with real Neo4j driver when deploying.
"""

import logging
from typing import Optional

from models.schemas import (
    GraphNode,
    GraphEdge,
    GraphUpdate,
    GraphNodeType,
    GraphEdgeType,
    ParseResult,
)

logger = logging.getLogger(__name__)


class GraphClient:
    """
    Graph database sync client.

    Prototype: in-memory dict-based graph.
    Production: swap internals with neo4j.Driver calls.
    """

    def __init__(self):
        # In-memory graph for prototype
        self._nodes: dict[str, GraphNode] = {}
        self._edges: list[GraphEdge] = []
        # Index: file_name -> list of node IDs owned by that file
        self._file_nodes: dict[str, list[str]] = {}

    # ══════════════════════════════════════════════════
    # Core sync — called on every push
    # ══════════════════════════════════════════════════

    def sync_file(self, file_name: str, parse_result: ParseResult) -> GraphUpdate:
        """
        Full re-sync for a file.

        Strategy (from the spec):
          1. Remove ALL old nodes/edges owned by this file
          2. Insert new nodes/edges from fresh parse

        This keeps the graph always consistent — no partial updates.
        """

        # 1. Compute what to remove
        old_node_ids = self._file_nodes.get(file_name, [])

        # 2. Build new nodes and edges
        nodes_to_add: list[GraphNode] = []
        edges_to_add: list[GraphEdge] = []

        # File node
        file_node_id = f"file:{file_name}"
        nodes_to_add.append(GraphNode(
            id=file_node_id,
            label=file_name,
            node_type=GraphNodeType.FILE,
            file_name=file_name,
        ))

        # Function nodes + DEFINES edges
        for func in parse_result.functions:
            func_id = f"func:{file_name}:{func.name}"
            nodes_to_add.append(GraphNode(
                id=func_id,
                label=func.name,
                node_type=GraphNodeType.FUNCTION,
                file_name=file_name,
                metadata={"params": func.parameters, "return_type": func.return_type},
            ))
            edges_to_add.append(GraphEdge(
                source=file_node_id,
                target=func_id,
                edge_type=GraphEdgeType.DEFINES,
            ))

        # Class nodes + DEFINES edges + CONTAINS edges for methods
        for cls in parse_result.classes:
            cls_id = f"class:{file_name}:{cls.name}"
            nodes_to_add.append(GraphNode(
                id=cls_id,
                label=cls.name,
                node_type=GraphNodeType.CLASS,
                file_name=file_name,
                metadata={"methods": cls.methods, "bases": cls.bases},
            ))
            edges_to_add.append(GraphEdge(
                source=file_node_id,
                target=cls_id,
                edge_type=GraphEdgeType.DEFINES,
            ))

            # INHERITS edges
            for base in cls.bases:
                edges_to_add.append(GraphEdge(
                    source=cls_id,
                    target=f"class:*:{base}",  # Wildcard — resolved at query time
                    edge_type=GraphEdgeType.INHERITS,
                ))

            # CONTAINS edges for methods
            for method in cls.methods:
                method_id = f"func:{file_name}:{method}"
                edges_to_add.append(GraphEdge(
                    source=cls_id,
                    target=method_id,
                    edge_type=GraphEdgeType.CONTAINS,
                ))

        # CALLS edges
        for call in parse_result.calls:
            edges_to_add.append(GraphEdge(
                source=file_node_id,
                target=f"func:*:{call}",  # Wildcard — resolved at query time
                edge_type=GraphEdgeType.CALLS,
            ))

        # IMPORTS edges
        for imp in parse_result.imports:
            imp_node_id = f"module:{imp}"
            # Ensure module node exists
            if imp_node_id not in self._nodes:
                nodes_to_add.append(GraphNode(
                    id=imp_node_id,
                    label=imp,
                    node_type=GraphNodeType.MODULE,
                ))
            edges_to_add.append(GraphEdge(
                source=file_node_id,
                target=imp_node_id,
                edge_type=GraphEdgeType.IMPORTS,
            ))

        # 3. Execute: remove old, insert new
        self._remove_file_nodes(file_name)
        new_node_ids = []
        for node in nodes_to_add:
            self._nodes[node.id] = node
            new_node_ids.append(node.id)
        self._edges.extend(edges_to_add)
        self._file_nodes[file_name] = new_node_ids

        update = GraphUpdate(
            file_name=file_name,
            nodes_to_add=nodes_to_add,
            edges_to_add=edges_to_add,
            nodes_to_remove=old_node_ids,
        )

        logger.info(
            f"Graph sync: {file_name} — "
            f"+{len(nodes_to_add)} nodes, +{len(edges_to_add)} edges, "
            f"-{len(old_node_ids)} old nodes"
        )

        return update

    # ══════════════════════════════════════════════════
    # Query helpers
    # ══════════════════════════════════════════════════

    def get_dependents(self, file_name: str) -> list[str]:
        """Find files that depend on (call/import) this file."""
        file_node_id = f"file:{file_name}"
        # Find all nodes owned by this file
        owned = set(self._file_nodes.get(file_name, []))

        dependents: set[str] = set()
        for edge in self._edges:
            # If any edge targets a node in this file from another file
            if edge.target in owned and edge.source not in owned:
                # Extract file name from source node ID
                parts = edge.source.split(":")
                if len(parts) >= 2 and parts[0] == "file":
                    dependents.add(parts[1])
            # Also check wildcard matches
            if ":*:" in edge.target:
                target_name = edge.target.split(":*:")[-1]
                for func in [n for n in owned if target_name in n]:
                    parts = edge.source.split(":")
                    if len(parts) >= 2 and parts[0] == "file":
                        dependents.add(parts[1])

        return sorted(dependents)

    def get_dependencies(self, file_name: str) -> list[str]:
        """Find files that this file depends on (calls/imports)."""
        owned = set(self._file_nodes.get(file_name, []))
        dependencies: set[str] = set()

        for edge in self._edges:
            if edge.source in owned and edge.target not in owned:
                # Extract file name from target node ID
                parts = edge.target.split(":")
                if len(parts) >= 3:
                    dep_file = parts[1]
                    if dep_file != "*":
                        dependencies.add(dep_file)

        return sorted(dependencies)

    def get_all_nodes(self) -> list[GraphNode]:
        """Return all nodes in the graph."""
        return list(self._nodes.values())

    def get_all_edges(self) -> list[GraphEdge]:
        """Return all edges in the graph."""
        return list(self._edges)

    def get_graph_summary(self) -> dict:
        """Return a summary of the current graph state."""
        return {
            "total_nodes": len(self._nodes),
            "total_edges": len(self._edges),
            "files_tracked": len(self._file_nodes),
            "node_types": self._count_by_type(),
        }

    # ══════════════════════════════════════════════════
    # Internal
    # ══════════════════════════════════════════════════

    def _remove_file_nodes(self, file_name: str):
        """Remove all nodes and edges belonging to a file."""
        old_ids = set(self._file_nodes.get(file_name, []))
        if not old_ids:
            return

        # Remove nodes
        for nid in old_ids:
            self._nodes.pop(nid, None)

        # Remove edges that reference any removed node
        self._edges = [
            e for e in self._edges
            if e.source not in old_ids and e.target not in old_ids
        ]

        self._file_nodes.pop(file_name, None)

    def _count_by_type(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for node in self._nodes.values():
            t = node.node_type.value
            counts[t] = counts.get(t, 0) + 1
        return counts
