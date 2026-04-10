# Agent Instructions

## Project

React Native (Expo) app for monitoring/controlling Hyundai/Kia EVs via Bluelink API. See `README.md` for full details.

### Key Areas

- **Auth layer** (`src/api/regions/`) — Region-specific authentication. Hyundai EU uses refresh token flow, Kia EU uses WebView OAuth, others use direct credentials.
- **Base API** (`src/api/base.ts`) — Shared auth, caching, and HTTP logic. All region classes extend this.
- **State** (`src/store/carStore.ts`) — Zustand store managing connection lifecycle, car selection, and command dispatch.
- **UI** (`app/`) — Expo Router screens. Settings screen handles auth config and car selection.

## Multi-Session / Parallel Work

Multiple Claude Code sessions can work simultaneously on this repo. Follow these rules to avoid conflicts.

### Branch Conventions

- Each parallel session MUST work on its own branch: `agent/<short-description>`
- Never push directly to `main` from a parallel session — open a PR instead
- Before starting work, pull latest main: `git fetch origin && git checkout -b agent/<name> origin/main`

### File Ownership

When multiple sessions run in parallel, coordinate by area to minimize merge conflicts:

| Area | Path patterns | Notes |
|------|--------------|-------|
| Auth/API | `src/api/**` | One session at a time |
| UI screens | `app/**` | Can parallelize if touching different screens |
| Store | `src/store/**` | One session at a time |
| Config/types | `src/config/**` | One session at a time |
| Storage | `src/storage/**` | One session at a time |

### Worktree Sessions

For true isolation, use git worktrees:

```bash
# Create a worktree for parallel work
git worktree add ../egmp-worktree-<name> -b agent/<name> origin/main

# When done, clean up
git worktree remove ../egmp-worktree-<name>
```

Beads automatically redirects to the main repo's `.beads/` in worktrees. Use `bd` commands normally — they work across worktrees.

### Subagent Definitions

Custom subagents are defined in `.claude/agents/`:

| Agent | Role | Isolation | Model |
|-------|------|-----------|-------|
| `code-writer` | Implements features, fixes, refactors | worktree | sonnet |
| `researcher` | Read-only codebase/web investigation | none | sonnet |
| `reviewer` | Code review for correctness and security | none | sonnet |

### Subagent Isolation Rules

When the orchestrator spawns subagents via the Agent tool:
- Use `isolation: "worktree"` for any agent that writes code
- Research/exploration agents don't need isolation
- Each subagent should commit its work and the orchestrator merges results
- Subagents do NOT inherit the parent's conversation — prompts must be self-contained
- Include file paths, line numbers, and specific context in subagent prompts
- Max 4 parallel code-writing agents to avoid resource exhaustion

### Agent Teams (Experimental)

Agent teams are enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.json. Use for:
- Parallel investigation from different angles
- Competing implementation approaches
- Large migrations via `/batch`

Limitations:
- No session resumption with in-process teammates
- One team per session
- No nested teams (teammates can't spawn teammates)
- Permissions are set at spawn time

## Issue Tracking

This project uses **bd** (beads) for issue tracking. Run `bd prime` for full workflow context.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd close <id>         # Complete work
bd dolt push          # Push beads data to remote
```

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

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
