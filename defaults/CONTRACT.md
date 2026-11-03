<!-- KB-ROUTER:START -->
- Knowledge base = Basic Memory project `main` (the vault path is in the header above).
- Before writing a knowledge note, decide its folder, tags, and links; the full specification is at the SPEC path in the header.
- Keep knowledge notes under `projects/`, `reference/`, or `inbox/`; keep repository docs in their repository.
- If unsure whether something belongs in the knowledge base, ask; do not copy repository docs by default.
<!-- KB-ROUTER:END -->

<!-- KB-CONTRACT:START -->
- Multi-project knowledge → `reference/<discipline>/`; single-project knowledge → `projects/<project>/<function>/`; unsure → `inbox/`.
- One note = one topic; use a stable, readable Chinese filename; the permalink may be an English slug.
- Each note: 1 home tag (required) + 0–2 retrieval tags, at most 3 total; lowercase English, `/` depth at most 2.
- Express relationships with `[[wiki-link]]`, not tags.
- Promote a note from a project to `reference/` when a second project references it; archive before deleting.
- Use `bm_move` for moves and renames; check for broken links afterwards.
- `CONTRACT.md` and `SPEC.md` live in `~/.dsh/dsh-bm-contract/`, outside the vault; do not link to them from notes.
<!-- KB-CONTRACT:END -->
