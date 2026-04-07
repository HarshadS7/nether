#!/usr/bin/env python3
"""
🧠 Nether — Engineering Brain CLI

Usage:
    python main.py ingest --repo <github_url>    # Clone & ingest a GitHub repo
    python main.py ingest --folder <path>        # Ingest a local folder
    python main.py ask "<question>"              # Ask about the codebase
    python main.py interactive                   # Interactive Q&A mode
"""

import argparse
import json
import sys
import time
from pathlib import Path

from config import GRAPH_PATH

BANNER = """
╔══════════════════════════════════════════╗
║          🧠  N E T H E R                ║
║       Engineering Brain — by Kittens 🐱  ║
╚══════════════════════════════════════════╝
"""


class Benchmark:
    """Collects timing data for each pipeline stage."""

    def __init__(self):
        self.stages: list[dict] = []
        self._start: float = 0

    def start(self, name: str):
        self._start = time.perf_counter()
        self._name = name

    def stop(self, **extra):
        elapsed = time.perf_counter() - self._start
        entry = {"stage": self._name, "time_s": round(elapsed, 3), **extra}
        self.stages.append(entry)
        return elapsed

    def report(self):
        total = sum(s["time_s"] for s in self.stages)
        print("\n" + "=" * 50)
        print("  ⏱  BENCHMARK REPORT")
        print("=" * 50)
        for s in self.stages:
            bar_len = int(s["time_s"] / max(total, 0.001) * 30)
            bar = "█" * bar_len + "░" * (30 - bar_len)
            extras = "  ".join(
                f"{k}={v}" for k, v in s.items() if k not in ("stage", "time_s")
            )
            print(f"  {s['stage']:<25} {s['time_s']:>7.3f}s  {bar}  {extras}")
        print(f"  {'TOTAL':<25} {total:>7.3f}s")
        print("=" * 50)
        return {"stages": self.stages, "total_s": round(total, 3)}


# ── Commands ─────────────────────────────────────────

def cmd_ingest(args):
    """Run the ingestion pipeline with benchmarks."""
    from ingest import ingest_repo, ingest_folder, summarize

    print(BANNER)
    bench = Benchmark()

    if args.repo:
        source = args.repo
        print(f"  🌐 Source: {source}\n")

        bench.start("Clone repository")
        from ingest import clone_repo
        repo_path = clone_repo(source)
        bench.stop()

        bench.start("Scan files")
        from ingest import scan_files
        files = scan_files(repo_path)
        bench.stop(files=len(files))
        print(f"  ✔ Found {len(files)} source files")

        bench.start("Parse files")
        from ingest import parse_file
        from tqdm import tqdm
        parsed = []
        for fpath in tqdm(files, desc="  Parsing", unit="file"):
            result = parse_file(fpath, repo_path)
            if result["line_count"] > 0:
                parsed.append(result)
        bench.stop(parsed=len(parsed))

        bench.start("Detect function calls")
        from ingest import extract_function_calls
        all_functions = []
        for pf in parsed:
            for defn in pf["definitions"]:
                if defn["type"] == "function":
                    all_functions.append(defn["name"])
        for pf in parsed:
            own_funcs = {d["name"] for d in pf["definitions"]}
            external_funcs = [f for f in all_functions if f not in own_funcs]
            pf["calls"] = extract_function_calls(pf["content"], external_funcs)
        bench.stop(known_functions=len(all_functions))

    elif args.folder:
        source = str(Path(args.folder).resolve())
        print(f"  📂 Source: {source}\n")

        bench.start("Scan files")
        from ingest import scan_files
        files = scan_files(source)
        bench.stop(files=len(files))
        print(f"  ✔ Found {len(files)} source files")

        bench.start("Parse files")
        from ingest import parse_file
        from tqdm import tqdm
        parsed = []
        for fpath in tqdm(files, desc="  Parsing", unit="file"):
            result = parse_file(fpath, source)
            if result["line_count"] > 0:
                parsed.append(result)
        bench.stop(parsed=len(parsed))

        bench.start("Detect function calls")
        from ingest import extract_function_calls
        all_functions = []
        for pf in parsed:
            for defn in pf["definitions"]:
                if defn["type"] == "function":
                    all_functions.append(defn["name"])
        for pf in parsed:
            own_funcs = {d["name"] for d in pf["definitions"]}
            external_funcs = [f for f in all_functions if f not in own_funcs]
            pf["calls"] = extract_function_calls(pf["content"], external_funcs)
        bench.stop(known_functions=len(all_functions))

    else:
        print("  ❌ Provide --repo <url> or --folder <path>")
        sys.exit(1)

    # ── Summary ──────────────────────────────────────
    stats = summarize(parsed)
    print(f"\n  ✔ Parsed {stats['files']} files ({stats['total_lines']:,} lines)")
    print(f"    {stats['classes']} classes, {stats['functions']} functions")
    print(f"    {stats['imports']} imports, {stats['calls']} cross-file calls")

    # ── Benchmark report ─────────────────────────────
    bench_data = bench.report()

    # ── Save benchmark ───────────────────────────────
    bench_out = {
        "source": args.repo or args.folder,
        "stats": stats,
        "benchmark": bench_data,
    }
    bench_path = Path(__file__).parent / "benchmark.json"
    with open(bench_path, "w") as f:
        json.dump(bench_out, f, indent=2)
    print(f"\n  💾 Benchmark saved to {bench_path}")

    # ── Build knowledge graph ────────────────────────
    bench.start("Build knowledge graph")
    from graph_builder import build_graph
    import networkx as nx
    G = build_graph(parsed)
    bench.stop(nodes=G.number_of_nodes(), edges=G.number_of_edges())
    
    # Save graph.json locally
    graph_path = Path(__file__).parent / "graph.json"
    with open(graph_path, "w") as f:
        json.dump(nx.node_link_data(G), f, indent=2)

    # ── Generate Obsidian vault (optional) ────────────
    if args.vault:
        bench.start("Generate Obsidian vault")
        from obsidian_generator import generate_vault
        vault_name = args.repo.rstrip('/').split('/')[-1] if args.repo else Path(args.folder).name
        vault_stats = generate_vault(G, args.vault, repo_name=vault_name)
        bench.stop(
            notes=vault_stats['notes'],
            backlinks=vault_stats['backlinks'],
        )
        print(f"\n  📓 Vault: {vault_stats['notes']} notes, {vault_stats['backlinks']} backlinks")
        print(f"     → Open in Obsidian: {vault_stats['vault_path']}")

    # ── Save parsed output (optional) ────────────────
    if args.output:
        out = []
        for r in parsed:
            entry = {k: v for k, v in r.items() if k != "content"}
            entry["content_preview"] = r["content"].splitlines()[:3]
            out.append(entry)
        with open(args.output, "w") as f:
            json.dump(out, f, indent=2)
        print(f"  💾 Parsed output saved to {args.output}")


def cmd_ask(args):
    """Answer a single question."""
    print(BANNER)
    print(f"  Q: {args.question}\n")
    # TODO: Phase 5 — wire up Q&A
    print("  ⚠ Q&A not yet implemented (Phase 5)")


def cmd_interactive(args):
    """Interactive Q&A REPL."""
    print(BANNER)
    print("  Interactive mode — type 'quit' to exit\n")
    while True:
        try:
            question = input("❓ Ask: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if question.lower() in ("exit", "quit", "q"):
            break
        # TODO: Phase 5 — wire up Q&A
        print(f"\n  Q: {question}")
        print("  ⚠ Q&A not yet implemented (Phase 5)\n")


# ── Argument parser ──────────────────────────────────

def build_parser():
    parser = argparse.ArgumentParser(
        prog="nether",
        description="🧠 Nether — Engineering Brain CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py ingest --repo https://github.com/pallets/flask --vault ./myVault
  python main.py ingest --folder ./my-project --vault ./myVault
  python main.py ingest --repo https://github.com/fastapi/fastapi --output fastapi.json
  python main.py ask "What depends on AuthService?"
  python main.py interactive
        """,
    )
    sub = parser.add_subparsers(dest="command", help="Available commands")

    # ingest
    ingest_p = sub.add_parser("ingest", help="Ingest a codebase")
    source = ingest_p.add_mutually_exclusive_group(required=True)
    source.add_argument("--repo", "-r", help="GitHub repo URL to clone & ingest")
    source.add_argument("--folder", "-f", help="Local folder path to ingest")
    ingest_p.add_argument("--vault", "-v", help="Generate Obsidian vault at this path")
    ingest_p.add_argument("--output", "-o", help="Save parsed JSON output to file")
    ingest_p.set_defaults(func=cmd_ingest)

    # ask
    ask_p = sub.add_parser("ask", help="Ask a question about the codebase")
    ask_p.add_argument("question", help="Your question")
    ask_p.set_defaults(func=cmd_ask)

    # interactive
    inter_p = sub.add_parser("interactive", help="Interactive Q&A mode")
    inter_p.set_defaults(func=cmd_interactive)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
