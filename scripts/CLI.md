# 🧠 Nether CLI — Command Reference

> **Prerequisite:** Activate the virtual environment first:
> ```bash
> cd scripts/
> source venv/bin/activate
> ```

---

## `ingest` — Ingest a Codebase

Clones (or reads) a codebase, scans source files, extracts imports/definitions/function calls, and outputs structured data with benchmarks.

### From a GitHub repo

```bash
python main.py ingest --repo <github_url>
python main.py ingest -r <github_url>
```

**Example:**
```bash
python main.py ingest --repo https://github.com/pallets/flask
```

### From a local folder

```bash
python main.py ingest --folder <path>
python main.py ingest -f <path>
```

**Example:**
```bash
python main.py ingest --folder ~/projects/my-app
```

### Generate an Obsidian vault

```bash
python main.py ingest --repo <url> --vault <output_path>
python main.py ingest -r <url> -v <output_path>
```

**Example:**
```bash
python main.py ingest --repo https://github.com/pallets/flask --vault ./myVault
python main.py ingest --folder ~/projects/my-app --vault ./myVault
```

This generates a flat folder of interconnected markdown files you can open in Obsidian:
1. Open Obsidian → "Open folder as vault" → select the vault path
2. Press **⌘+G** (or **Ctrl+G**) to open graph view
3. Use tag filters (`#module`, `#file`, `#class`, `#function`) to explore layers


### Save parsed output to JSON

```bash
python main.py ingest --repo <url> --output <file.json>
python main.py ingest -r <url> -o <file.json>
```

**Example:**
```bash
python main.py ingest -r https://github.com/fastapi/fastapi -o fastapi.json
```

### What it does

1. **Clone** (repo mode) or **locate** (folder mode) the source
2. **Scan** for files matching supported extensions (`.py`, `.js`, `.ts`, `.jsx`, `.tsx`, `.java`, `.go`, `.rs`, `.rb`, `.cpp`, `.c`, `.h`)
3. **Parse** each file — extract imports, functions, classes, docstrings
4. **Detect** cross-file function calls (2nd pass)
5. **Generate** Obsidian vault (if `--vault` specified)
6. **Benchmark** — prints per-stage timing with a visual bar chart
7. **Save** `benchmark.json` (always) and parsed output (if `--output` specified)

### Output

```
  ⏱  BENCHMARK REPORT
==================================================
  Clone repository            0.000s  ░░░░░░░░░░░░░░
  Scan files                  0.149s  ░░░░░░░░░░░░░░  files=1082
  Parse files                 0.136s  ░░░░░░░░░░░░░░  parsed=909
  Detect function calls      77.925s  ████████████████  known_functions=3122
  TOTAL                      78.210s
==================================================
```

---

## `ask` — Ask a Question *(Phase 5 — not yet implemented)*

```bash
python main.py ask "<question>"
```

**Example:**
```bash
python main.py ask "What depends on AuthService?"
```

---

## `interactive` — Interactive Q&A *(Phase 5 — not yet implemented)*

```bash
python main.py interactive
```

Starts a REPL where you can ask multiple questions. Type `quit`, `exit`, or `q` to leave.

---

## Configuration

Editable in `config.py` and `.env`:

| Setting | Default | File |
|---------|---------|------|
| Supported extensions | `.py .js .ts .jsx .tsx .java .go .rs .rb .cpp .c .h` | `config.py` |
| Ignored directories | `node_modules .git __pycache__ venv dist build .next` … | `config.py` |
| Max file size | 100 KB | `config.py` |
| LLM model | `qwen2.5:1.5b` | `.env` |
| Embedding model | `all-MiniLM-L6-v2` | `.env` |

---

## Help

```bash
python main.py --help
python main.py ingest --help
```
