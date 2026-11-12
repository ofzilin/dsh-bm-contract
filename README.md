# dsh-bm-contract

Injects the Basic Memory knowledge-base contract into DSH sessions.

## What it does

- **Router (always on)** — registers a `systemPrompt.section` with the compact
  router from `CONTRACT.md`.
- **Contract (on trigger)** — on `agent/pre-step`, when the user message matches
  a trigger (知识库 / 记到 / 笔记 / basic-memory / reference/ / inbox/ …), injects
  the full `KB-CONTRACT` block as a user message. One injection per user message.
- **Recall (on every new message)** — builds a few search terms from the vault
  vocabulary, calls `bm_search` through `ctx.tools.execute`, and injects up to
  two matching notes (title, permalink, conclusion) as a user message. Skips
  quietly when nothing matches or the tool is unavailable. One attempt per user
  message; the same note is never injected twice in a session.

Recall and the contract are independent: the contract teaches how to *write*
notes, recall surfaces what is already *written*.

## Files

- `defaults/CONTRACT.md` — machine contract (`KB-ROUTER` + `KB-CONTRACT` markers).
- `defaults/SPEC.md` — full human specification.

On first load the plugin copies both defaults to:

```text
$DSH_HOME/dsh-bm-contract/CONTRACT.md
$DSH_HOME/dsh-bm-contract/SPEC.md
```

(`$DSH_HOME` defaults to `~/.dsh`; the user directory is created by the plugin,
not by hand.)

The user files are the source of truth. Edit them directly, or override the
contract path with `contractPath`. The plugin reads `CONTRACT.md` on each prompt
assembly and refreshes on mtime change, so edits apply without restarting DSH.

## Defaults and privacy

- `defaults/` contains generic templates intended for publication.
- `defaults.local/` is optional and gitignored. When present, the plugin uses it
  for first-run copies and Reset; put personal rules there, not in `defaults/`.
- Runtime files in `$DSH_HOME/dsh-bm-contract/` are personal. Never commit them.
- A published package ships only `defaults/`; `defaults.local/` is excluded by
  `package.json#files` and `.gitignore`.

## Configuration

```yaml
- id: bm-contract
  name: dsh-bm-contract
  config:
    vaultPath: 'C:\Users\you\Documents\basic-memory'
    # contractPath: 'C:\Users\you\.dsh\dsh-bm-contract\CONTRACT.md'
    # maxChars: 4000
    # triggers: ["知识库", "记到", "笔记"]
    # recall:
    #   enabled: true
    #   project: main
    #   toolName: mcp__basic-memory__bm_search
    #   maxTerms: 3
    #   minScore: 0.5
    #   minSimilarity: 0.2
    #   topK: 5
    #   maxItems: 2
    #   vocabTtlMs: 300000
    #   ledger: true
```

- `vaultPath` — required in your profile patch; without it the header tells the model to configure it.
- `contractPath` — optional; relative paths resolve against the package root.
- `maxChars` — cap for one injected block (default 4000).
- `triggers` — case-insensitive substrings for the conditional injection.
- `routerStart` / `routerEnd` / `contractStart` / `contractEnd` — optional marker overrides.
  The defaults are the `<!-- KB-ROUTER:START/END -->` and `<!-- KB-CONTRACT:START/END -->`
  comments written by `defaults/CONTRACT.md`; you only need these if you invent your own markers.

### Recall options

- `enabled` — default `true`; set `false` to keep the contract behavior only.
- `project` — Basic Memory project name (default `main`).
- `toolName` — registered tool name (default `mcp__basic-memory__bm_search`).
- `mode` — `bm_search` mode (default `hybrid`).
- `maxTerms` — search terms per message (default 3).
- `minScore` — keep hits at or above this score (default 0.5); tune from the ledger.
- `minSimilarity` — passed to `bm_search` (default 0.2).
- `topK` — `page_size` requested from `bm_search` (default 5).
- `maxItems` — notes injected per message (default 2).
- `vocabTtlMs` — vocabulary refresh interval (default 5 minutes).
- `ledger` — append one JSON line per hit to `$DSH_HOME/dsh-bm-contract/recall-ledger.jsonl`
  (terms, scores, permalinks; no message text). Default `true`.

Recall builds its term vocabulary from note titles, tags, headings, and quoted
conclusions, then refreshes it at most once per `vocabTtlMs`. A hit is injected
only when its score is at least `minScore`; otherwise the turn continues with no
extra context. When `bm_search` is unavailable, recall fails open and the turn
is unaffected.

The package's `cordis.patch.yml` intentionally has no personal path, so the
source can be published without leaking a local directory layout.

## Install

Install from GitHub:

```powershell
dsh plugin --profile web add "github:ofzilin/dsh-bm-contract#v0.3.2"
```

`#v0.3.2` pins the release; omit it or use `#main` to follow the default branch.

Then add the vault path override to your profile
(`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- id: bm-contract
  name: dsh-bm-contract
  config:
    vaultPath: 'C:\Users\you\Documents\basic-memory'
```

Restart DSH; the first load creates the two user files under
`$DSH_HOME/dsh-bm-contract/`. Open **Plugins → dsh-bm-contract** to edit them.

Local development only (machine-specific path):

```powershell
dsh plugin --profile web add "link:C:\path\to\dsh-bm-contract"
```

For npm, publish this package and install it by name; the `defaults/` directory
is included via `package.json#files`.

## If you remove `cordis.patch.yml`

`dsh.bundle.patch` is what lets `dsh plugin add` activate the bundle. Without it,
install the package as a dependency and add the row to your profile manually.
If you delete the file, also remove `dsh.bundle.patch` from `package.json` (or
keep a minimal placeholder patch); otherwise the loader still looks for the
missing file.

```yaml
- insert:
    - id: bm-contract
      name: dsh-bm-contract
      config:
        vaultPath: 'C:\Users\you\Documents\basic-memory'
```

Restart DSH; the first load creates the two user files from `defaults/` (or
`defaults.local/`). The plugin page and routes are unavailable until the row is
active.

## Plugins page

Open **Plugins → dsh-bm-contract → Configuration**. The card has two editors:

- `CONTRACT.md` — injected rules (required markers);
- `SPEC.md` — full human specification.

Save writes both user files; Reset to default copies both from the active
defaults (`defaults.local/` if present, else `defaults/`).
The host routes are loopback-only: `GET /bm-contract/state`,
`POST /bm-contract/save`, `POST /bm-contract/reset`.

Refresh the browser after updating the plugin so the client bundle reloads.

## License

MIT. See [LICENSE](LICENSE).

