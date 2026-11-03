# Knowledge Base Specification (template)

> Machine-injected rules: `CONTRACT.md` in the same directory. This file is the
> full human specification; it lives outside the vault and is not injected.

## 1. Structure

    vault/
    ├── projects/    # one project or workflow per folder
    ├── reference/   # cross-project knowledge, grouped by discipline
    └── inbox/       # not sure yet; triage later

`CONTRACT.md` and `SPEC.md` live under `~/.dsh/dsh-bm-contract/`, outside the vault.

Folders answer "where does this note live"; tags answer "how will I filter it
later"; wiki-links answer "what is it related to". Store general knowledge once;
keep project-specific knowledge in its project.

Placement:

- Multiple projects → `reference/<discipline>/`
- One project → `projects/<project>/<function>/`
- Unsure → `inbox/`
- Second project references it → promote to `reference/`

Split cross-discipline material into atomic notes and connect them with wiki-links.

## 2. Atomic notes and names

One note = one topic. Use a clear, stable, readable **Chinese** topic name.

- Chinese file name: Obsidian resolves `[[wiki-link]]` by file name, so
  `[[Basic Memory 底层模型 × 运行时选型]]` matches the Chinese file directly.
- English permalink: allowed as a stable reference/URL; it is not the wiki-link
  target. Do not rename the file to English just for the permalink.
- Moves/renames: use `bm_move`, keep the permalink stable, check broken links.

Example: `Basic Memory 底层模型 × 运行时选型.md` · permalink
`main/reference/computer/basic-memory-embedding-model-runtime-selection` ·
wiki-link `[[Basic Memory 底层模型 × 运行时选型]]`.

## 3. Tags

Tags are retrieval filters, not descriptions.

- 1 home tag (required) + 0–2 retrieval tags, at most 3 total.
- Lowercase English; `/` for hierarchy; depth at most 2.
- One spelling per concept; merge synonyms and delete unused tags.
- Avoid broad tags such as `knowledge` or `important`.

## 4. Wiki-links

- Express relationships with `[[wiki-link]]`, not tags.
- Link names should be the target note's file name or stable title.
- Reference `reference/` from projects; a project note may link several general notes.

## 5. Maintenance

- Weekly: empty `inbox/`, promote notes referenced by a second project, merge synonymous tags.
- Monthly: review tag usage and check for broken links.
- Archive before deleting; folder moves are cheap, tags and links are the real structure.

## 6. Checklist before writing

- Does this note express exactly one topic?
- Does it belong in `projects/`, `reference/`, or `inbox/`?
- Is the file name Chinese and stable?
- Does it have one home tag and at most two retrieval tags?
- Are relationships expressed with wiki-links rather than tags?
- Is the permalink stable, or does it need an English slug?
