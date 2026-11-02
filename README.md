# dsh-bm-contract

Injects the Basic Memory knowledge-base contract into DSH sessions.

## What it does

- **Router (always on)** — registers a `systemPrompt.section` with the compact
  router from `CONTRACT.md`.
- **Contract (on trigger)** — on `agent/pre-step`, when the user message matches
  a trigger (知识库 / 记到 / 笔记 / basic-memory / reference/ / inbox/ …), injects
  the full `KB-CONTRACT` block as a user message. One injection per user message.

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
    # contractPath: "C:\\Users\\you\\.dsh\\dsh-bm-contract\\CONTRACT.md"
    # maxChars: 4000
    # triggers: ["知识库", "记到", "笔记"]
```

- `vaultPath` — required in your profile patch; without it the header tells the model to configure it.
- `contractPath` — optional; relative paths resolve against the package root.
- `maxChars` — cap for one injected block (default 4000).
- `triggers` — case-insensitive substrings for the conditional injection.

The package's `cordis.patch.yml` intentionally has no personal path, so the
source can be published without leaking a local directory layout.

## Install

```powershell
dsh plugin --profile web add link:C:\Users\you\.dsh\local-plugins\dsh-bm-contract
```

For npm, publish this package and install it by name; the `defaults/` directory
is included via `package.json#files`.

## If you remove `cordis.patch.yml`

`dsh.bundle.patch` is what lets `dsh plugin add` activate the bundle. Without it,
install the package as a dependency and add the row to your profile manually:

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

