# Fix: "neon_vault.zip exceeds 100 MB" on push

GitHub rejects files over 100 MB. That zip is in your Git history, so you need to remove it from **every commit** and then push again.

Run these in **Git Bash** (from the project folder), one block at a time.

## Step 1: Find the exact path (optional but helpful)

```bash
cd /c/BL4/Borderlands4-SaveEditor-3.4.5.2
git log --all --full-history -- "**/neon_vault.zip" --name-only
```

Note the path it prints (e.g. `neon_vault.zip` or `dist/neon_vault.zip`).

## Step 2: Remove it from entire history

This removes `neon_vault.zip` from root, `dist/`, and `build/` in every commit (so it works no matter where it was committed):

```bash
cd /c/BL4/Borderlands4-SaveEditor-3.4.5.2
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch neon_vault.zip dist/neon_vault.zip build/neon_vault.zip" --prune-empty HEAD
```

## Step 3: Clean up refs and push

```bash
rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive

git add .gitignore
git commit -m "Ignore zips, build, dist" --allow-empty
git push -u origin main --force
```

If the push still fails with the same error, the file might be under another path. Run Step 1 and use that path in Step 2, e.g.:

```bash
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch THE_PATH_FROM_STEP_1" --prune-empty HEAD
```
