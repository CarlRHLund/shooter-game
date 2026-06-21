@AGENTS.md

# Git Workflow

After every meaningful change, commit and push to GitHub so work is never lost and any version can be restored.

## Rules
- Commit after each feature, fix, or significant edit — do not batch unrelated changes into one commit
- Write clear, descriptive commit messages: what changed and why, not just "update game.tsx"
- Always push to GitHub immediately after committing (`git push origin master`)
- Never commit `node_modules`, `.next`, or build artifacts — the `.gitignore` already handles this

## Commit message format
```
Short summary in imperative mood (50 chars max)

Optional longer explanation if the change is non-obvious.
```

## Example good commit messages
- `Add piercing bullet weapon upgrade`
- `Fix boss HP not resetting between stages`
- `Increase spawn rate scaling per stage`
- `Add touch/mobile support for ship movement`

## Repository
- Remote: https://github.com/CarlRHLund/shooter-game
- Branch: master

