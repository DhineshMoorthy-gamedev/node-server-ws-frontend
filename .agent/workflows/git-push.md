---
description: Commit and push changes to GitHub
---

# Git Commit & Push Workflow

This workflow helps you commit and push your changes to GitHub.

## Steps

// turbo-all

1. **Check Status**
```bash
git status
```

2. **Stage All Changes**
```bash
git add .
```

3. **Commit with Message**
```bash
git commit -m "Your commit message here"
```
Replace "Your commit message here" with a descriptive message about your changes.

4. **Push to GitHub**
```bash
git push
```

## Quick Commit Template

For quick commits, you can combine steps:
```bash
git add . && git commit -m "feat: your feature description" && git push
```

## Commit Message Conventions

Use these prefixes for clarity:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring
- `style:` - Formatting changes
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Examples

```bash
git add . && git commit -m "feat: add Feature Aggregator tool" && git push
git add . && git commit -m "fix: resolve compilation errors in FeatureAggregatorWindow" && git push
git add . && git commit -m "docs: update README with new tool" && git push
```
