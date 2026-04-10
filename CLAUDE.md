# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Dev

```bash
npm install
npx expo start --android   # or --ios
```

Monitor auth flow logs:
```bash
adb logcat -v time | grep -E '\[(Bluelink|Europe|OAuth)\]'
```

## Architecture Overview

React Native (Expo) app for monitoring Hyundai/Kia EVs via Bluelink/Kia Connect APIs. Ported from the [egmp-bluelink-scriptable](https://github.com/andyfase/egmp-bluelink-scriptable) iOS widget.

- **`app/`** — Expo Router screens (tabs: status, commands, settings)
- **`src/api/`** — Bluelink API layer with per-region implementations
  - `base.ts` — Base class (auth, caching, HTTP)
  - `regions/europe.ts` — Hyundai (refresh token) + Kia (WebView OAuth)
  - `regions/` — canada, usa, usa-kia, india, australia
- **`src/store/carStore.ts`** — Zustand store (connection, commands, state)
- **`src/config/types.ts`** — Config types, `AuthMethod` routing
- **`src/storage/`** — Config persistence + secure storage adapter

### Auth Methods by Region
- **Hyundai Europe**: Refresh token (pasted from external tool, no in-app login)
- **Kia Europe**: WebView OAuth
- **All other regions**: Direct credentials (username/password)

## Agent Teams

When spawning agents in worktrees, always use `mode: "bypassPermissions"`. Worktrees are isolated and disposable — permission prompts just slow things down.

### Agent responsibilities (each agent does all of this before finishing):
- Implement the change on a feature branch
- Commit with a clear message
- Push the branch (`git push -u origin <branch-name>`)
- Create the PR via `gh pr create` with a summary and test plan
- Report the PR URL back to the orchestrator

### Orchestrator responsibilities:
- Sequence work into rounds to avoid file conflicts
- Merge PRs in order (`gh pr merge --squash --delete-branch`)
- Rebase and re-push later PRs if earlier merges cause conflicts
- Clean up worktrees and local branches after merging
- Close beads issues and track overall progress

## Quality Gates

Before committing, `npx tsc --noEmit` runs automatically via a PreToolUse hook. If TypeScript fails, the commit is blocked. Fix type errors before retrying.

## Conventions & Patterns

- TypeScript throughout
- Expo Router file-based navigation
- expo-secure-store for credentials/tokens
- Zustand for state management
- Console logging with `[Bluelink]`, `[Europe]`, `[OAuth]` tags for debugging
- GitHub PRs use squash merges only (`gh pr merge --squash --delete-branch`)
