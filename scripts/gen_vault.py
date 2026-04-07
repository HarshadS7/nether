"""Quick script: convert demo_output.json → flat Obsidian vault in tempVault/"""
import json, os, re
from pathlib import Path
from collections import defaultdict

VAULT = Path(__file__).parent / "tempVault"
VAULT.mkdir(exist_ok=True)
for f in VAULT.glob("*.md"):
    f.unlink()

with open(Path(__file__).parent / "demo_output.json") as f:
    files = json.load(f)

def sanitize(name):
    return re.sub(r'[/\\:*?"<>|]', '_', name).strip('. ')[:100]

def is_dunder(name):
    return name.startswith('__') and name.endswith('__')

# ── Collect modules ──────────────────────────────────
modules = set()
for f in files:
    parts = Path(f['path']).parent
    if str(parts) != '.':
        p = Path()
        for part in parts.parts:
            p = p / part
            modules.add(str(p))
modules.add('_root')

module_files = defaultdict(list)
for f in files:
    parent = str(Path(f['path']).parent)
    module_files[parent if parent != '.' else '_root'].append(f)

# ── Collect non-dunder definitions ───────────────────
all_defs = [(d, f) for f in files for d in f['definitions'] if not is_dunder(d['name'])]

name_counts = defaultdict(int)
for d, f in all_defs:
    name_counts[d['name']] += 1

def def_note_name(d, f):
    if name_counts[d['name']] > 1:
        return f"{d['name']} ({Path(f['path']).stem})"
    return d['name']

def file_note_name(f):
    basename = Path(f['path']).name
    dupes = [x for x in files if Path(x['path']).name == basename]
    if len(dupes) > 1:
        return sanitize(f['path'].replace('/', '_'))
    return basename

def module_note_name(m):
    return '_ Root Module' if m == '_root' else m.replace('/', ' → ')

# ── Track backlinks ──────────────────────────────────
backlinks = defaultdict(set)
def add_link(src, tgt):
    backlinks[tgt].add(src)

# ── Module notes ─────────────────────────────────────
for m in sorted(modules):
    nn = module_note_name(m)
    contained = module_files.get(m, [])
    lines = [f"---\ntags: [module]\n---\n", f"# 📦 {nn}\n", "**Type:** Module/Package\n"]
    if contained:
        lines.append("## Contains\n")
        for f in contained:
            fn = file_note_name(f)
            lines.append(f"- [[{fn}]]")
            add_link(nn, fn)
    sub = [sm for sm in modules if sm != m and sm.startswith(m + '/') and sm.count('/') == m.count('/') + 1]
    if sub:
        lines.append("\n## Sub-modules\n")
        for sm in sorted(sub):
            smn = module_note_name(sm)
            lines.append(f"- [[{smn}]]")
            add_link(nn, smn)
    (VAULT / f"{sanitize(nn)}.md").write_text('\n'.join(lines))

# ── File notes ───────────────────────────────────────
for f in files:
    nn = file_note_name(f)
    parent = str(Path(f['path']).parent)
    mod = module_note_name(parent if parent != '.' else '_root')
    lines = [
        f"---\ntags: [file, {f['language']}]\n---\n",
        f"# 📄 {Path(f['path']).name}\n",
        f"**Path:** `{f['path']}`  ",
        f"**Language:** {f['language'].title()}  ",
        f"**Lines:** {f['line_count']}  ",
        f"**Module:** [[{mod}]]\n",
    ]
    add_link(nn, mod)

    non_dunder = [d for d in f['definitions'] if not is_dunder(d['name'])]
    if non_dunder:
        lines.append("## Defines\n")
        for d in non_dunder:
            dn = def_note_name(d, f)
            e = "🔷" if d['type'] == 'class' else "🔹"
            lines.append(f"- {e} [[{dn}]] ({d['type']})")
            add_link(nn, dn)

    if f['imports']:
        lines.append("\n## Imports\n")
        for imp in f['imports']:
            if is_dunder(imp.split('.')[-1]):
                continue
            resolved = None
            for other in files:
                if Path(other['path']).stem == imp.split('.')[-1]:
                    resolved = file_note_name(other)
                    break
            if resolved and resolved != nn:
                lines.append(f"- [[{resolved}]]")
                add_link(nn, resolved)
            else:
                lines.append(f"- `{imp}` (external)")

    if f.get('calls'):
        unique = list(dict.fromkeys(f['calls']))
        non_dunder_calls = [c for c in unique if not is_dunder(c)]
        if non_dunder_calls:
            lines.append("\n## Uses\n")
            for call in non_dunder_calls:
                found = False
                for d, df in all_defs:
                    if d['name'] == call:
                        dn = def_note_name(d, df)
                        lines.append(f"- [[{dn}]]")
                        add_link(nn, dn)
                        found = True
                        break
                if not found:
                    lines.append(f"- `{call}()` (unresolved)")

    (VAULT / f"{sanitize(nn)}.md").write_text('\n'.join(lines))

# ── Definition notes ─────────────────────────────────
for d, f in all_defs:
    nn = def_note_name(d, f)
    fn = file_note_name(f)
    e = "🔷" if d['type'] == 'class' else "🔹"
    lines = [
        f"---\ntags: [{d['type']}, {f['language']}]\n---\n",
        f"# {e} {d['name']}\n",
        f"**Type:** {d['type'].title()}  ",
        f"**File:** [[{fn}]]  ",
        f"**Line:** {d['line_number']}  ",
        f"**Signature:** `{d['signature']}`\n",
    ]
    add_link(nn, fn)
    if d.get('docstring'):
        lines.append(f"> {d['docstring']}\n")
    (VAULT / f"{sanitize(nn)}.md").write_text('\n'.join(lines))

# ── Inject backlinks ─────────────────────────────────
for md_file in VAULT.glob("*.md"):
    nn = md_file.stem
    incoming = backlinks.get(nn, set())
    if not incoming:
        continue
    content = md_file.read_text()
    existing = set(re.findall(r'\[\[([^\]]+)\]\]', content))
    new_bl = incoming - existing
    if new_bl:
        content += "\n## Linked From\n\n"
        for bl in sorted(new_bl):
            content += f"- [[{bl}]]\n"
        md_file.write_text(content)

# ── Index ────────────────────────────────────────────
idx = ["---\ntags: [index]\n---\n", "# 🧠 Nether — Knowledge Graph\n",
       f"**Repository:** `pallets/markupsafe`  ",
       f"**Files:** {len(files)} | **Definitions:** {len(all_defs)} | **Modules:** {len(modules)}\n",
       "## Modules\n"]
for m in sorted(modules):
    idx.append(f"- [[{module_note_name(m)}]]")
idx.append("\n## Files\n")
for f in files:
    idx.append(f"- [[{file_note_name(f)}]] ({f['line_count']} lines)")
idx.append("\n## Key Definitions\n")
for d, f in all_defs:
    e = "🔷" if d['type'] == 'class' else "🔹"
    idx.append(f"- {e} [[{def_note_name(d, f)}]]")
(VAULT / "_Index.md").write_text('\n'.join(idx))

total = len(list(VAULT.glob('*.md')))
links = sum(len(v) for v in backlinks.values())
print(f"\n✅ Vault generated at {VAULT}")
print(f"   📄 {total} markdown files")
print(f"   📦 {len(modules)} modules | 📄 {len(files)} files | 🔹 {len(all_defs)} definitions")
print(f"   🔗 {links} backlinks registered")
