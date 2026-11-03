# Knowledge Base Specification (template)

> Machine-injected rules: `CONTRACT.md` in the same directory. This file is the
> full human specification; it lives outside the vault and is not indexed as a
> note. Replace this template with your own rules.

## 1. Purpose

Keep notes findable, reusable, and maintainable. The goal is not a perfect
taxonomy: folders answer "where does this note live", tags answer "how will I
filter it later", and wiki-links answer "what specific notes is it related to".

## 2. Top-level layout

Keep knowledge notes in three areas:

    vault/
    ├── projects/       # one project or workflow per folder
    ├── reference/      # cross-project knowledge, grouped by discipline
    └── inbox/          # not sure yet; triage later

`CONTRACT.md` and `SPEC.md` are meta files under `~/.dsh/dsh-bm-contract/`;
they are not vault notes.

## 3. Placement

Ask: if this note disappeared, how many projects would be affected?

- Multiple projects → `reference/<discipline>/`.
- One project → `projects/<project>/<function>/`.
- Unsure → `inbox/`.
- Referenced by a second project later → promote to `reference/`.

Split cross-discipline material into atomic notes and connect them with
wiki-links instead of forcing one folder to own everything.

## 4. Atomic notes and names

One note expresses one topic. Use clear, stable, readable filenames; avoid
names like `notes1`, `misc`, or `new-document`.

Use a Chinese topic name as the file name. Obsidian resolves `[[wiki-link]]` by
file name, so a Chinese filename lets a Chinese link such as
`[[Basic Memory 底层模型 × 运行时选型]]` resolve directly.

The permalink may be an English slug; it is a stable reference, not the
wiki-link target. Do not rename the file to English just to make the permalink
English. Example:

- file: `Basic Memory 底层模型 × 运行时选型.md`
- permalink: `main/reference/computer/basic-memory-embedding-model-runtime-selection`
- wiki-link: `[[Basic Memory 底层模型 × 运行时选型]]`

Use `bm_move` for moves and renames, and check for broken links afterwards.

## 5. Tags

Tags are retrieval filters, not a description of every subject mentioned.

- 1 home tag is required; add 0–2 cross-project retrieval tags only when they
  have real filtering value.
- At most 3 tags total; hierarchy depth at most 2 levels; lowercase English
  with `/` as the separator.
- Do not use broad tags such as `knowledge`, `important`, or a whole discipline
  when a more specific tag exists.
- Merge synonyms and delete tags that are never used for retrieval.

## 6. Wiki-links

Use `[[wiki-link]]` to express a relationship to a specific note. Link names
should be the target note's filename or stable title. Do not use tags to express
specific relationships.

## 7. Maintenance

Weekly:

- Empty `inbox/`.
- Promote notes referenced by a second project.
- Merge duplicate or synonymous tags.

Monthly:

- Review tag usage.
- Check for broken wiki-links.
- Fix clearly misplaced notes; leave harmless misfiling alone.

Archive before deleting. Folder moves are cheap; tags and links are the real
structure.

## 8. Checklist before writing

- Does this note express exactly one topic?
- How many projects does it affect, and therefore where does it belong?
- Does it have one home tag and at most two retrieval tags?
- Are relationships expressed with wiki-links rather than tags?
- Is the filename stable and readable?
- Is the filename a Chinese topic name, with an English permalink where needed?
