"""
Nether — Neo4j Exporter

Takes an atomic NetworkX Graph and pushes it to a local Neo4j database using Cypher.
"""

from neo4j import GraphDatabase
import networkx as nx
import os
from dotenv import load_dotenv

# Try to load backend/.env relative to the scripts folder
# Assuming scripts/ and backend/ are siblings
dotenv_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
load_dotenv(dotenv_path)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "neo4j")

class Neo4jExporter:
    def __init__(self):
        self.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

    def close(self):
        self.driver.close()

    def clear_database(self):
        """Wipes the database before a fresh import."""
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

    def export_graph(self, G: nx.DiGraph):
        with self.driver.session() as session:
            # 1. Create Nodes
            # We batch these for performance, although pure Cypher MERGE is fine for small/medium graphs
            for node_id, data in G.nodes(data=True):
                ntype = data.get("type", "unknown").capitalize()
                name = data.get("name", "Unknown")
                path = data.get("path", "")
                language = data.get("language", "")
                
                query = f"""
                MERGE (n:{ntype} {{id: $id}})
                SET n.name = $name, n.path = $path, n.language = $language
                """
                session.run(query, id=node_id, name=name, path=path, language=language)

            # 2. Create Edges
            for u, v, edata in G.edges(data=True):
                etype = edata.get("type", "LINKS_TO").replace(" ", "_").upper()
                
                query = f"""
                MATCH (a {{id: $source_id}})
                MATCH (b {{id: $target_id}})
                MERGE (a)-[r:{etype}]->(b)
                """
                session.run(query, source_id=u, target_id=v)

def export_to_neo4j(G: nx.DiGraph) -> dict:
    exporter = Neo4jExporter()
    try:
        # We assume we wipe the DB for a clean ingest during the hackathon
        exporter.clear_database()
        exporter.export_graph(G)
        return {"status": "success", "nodes": G.number_of_nodes(), "edges": G.number_of_edges(), "uri": NEO4J_URI}
    finally:
        exporter.close()
