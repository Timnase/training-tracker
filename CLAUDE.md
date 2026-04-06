# Training Tracker — Claude Instructions

## PR Workflow (REQUIRED for every change)

**Every code change must go through a PR.** Never commit directly to `main`.

### Steps for every change:
1. Create a feature branch: `git checkout -b <descriptive-branch-name>`
2. Make all code changes and verify build passes (`npm run build`)
3. Commit with a clear message
4. Push the branch: `git push -u origin <branch-name>`
5. Create a PR: `gh pr create --title "..." --body "..."`
6. Auto-approve and merge immediately:
   ```
   gh pr review --approve --body "Auto-approved"
   gh pr merge --squash --auto --delete-branch
   ```
   If auto-merge fails (no required checks), use:
   ```
   gh pr merge --squash --delete-branch
   ```
7. Switch back to main and pull: `git checkout main && git pull`

### Branch naming:
- `feature/<name>` — new functionality
- `fix/<name>` — bug fixes
- `chore/<name>` — config, deps, tooling

### gh CLI path:
Always use `export PATH="/opt/homebrew/bin:$PATH"` before `gh` commands.

## Project Context
- React 18 + TypeScript + Vite + Tailwind CSS v3
- Supabase JS v2 (PKCE auth flow)
- TanStack Query v5
- Deployed to GitHub Pages via GitHub Actions (`timnase.github.io/training-tracker`)
- HashRouter (required for GitHub Pages — no server rewrites)
- `vite.config.ts` base: `/training-tracker/`

## Code Style
- Use existing hooks/service patterns (see `src/hooks/`, `src/services/`)
- Keep components in `src/pages/` or `src/components/`
- No new abstractions for one-off use cases
- Build must pass with zero TypeScript errors before merging
