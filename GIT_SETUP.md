# Git setup for https://github.com/skeletor601/BL4-SaveEditor

Run these in **Command Prompt** or **PowerShell** from the project folder.  
If Git isn’t in your PATH, use **Git Bash** or install Git for Windows and choose “Git from the command line”.

---

## One-time: create repo and push everything

Use this if the folder has **no** `.git` yet (brand new repo):

```bash
cd C:\BL4\Borderlands4-SaveEditor-3.4.5.2

git init
git config core.longpaths true
git remote add origin https://github.com/skeletor601/BL4-SaveEditor.git
git add .
git commit -m "Initial commit: BL4 Save Editor"
git branch -M main
git push -u origin main
```

If the folder **already has** a repo (you see a `.git` folder):

```bash
cd C:\BL4\Borderlands4-SaveEditor-3.4.5.2

git config core.longpaths true
git remote add origin https://github.com/skeletor601/BL4-SaveEditor.git
git add .
git commit -m "Initial commit: BL4 Save Editor"
git branch -M main
git push -u origin main
```

- If it says `remote 'origin' already exists`, skip the `git remote add` line.
- When you run `git push`, GitHub will ask you to sign in (browser or token); you have to do that on your machine.

---

## News (dashboard “News & Updates” panel)

The app loads news from:

`https://raw.githubusercontent.com/skeletor601/BL4-SaveEditor/main/news.txt`

So you need a file named **`news.txt`** in the **root** of your repo (same folder as this file).

### First time (add news to the repo)

1. Create or edit `news.txt` in the project root. Use plain text; line breaks are fine.
2. Then run:

```bash
cd C:\BL4\Borderlands4-SaveEditor-3.4.5.2
git add news.txt
git commit -m "Add news.txt for dashboard"
git push
```

### Later (update news)

1. Edit `news.txt` (e.g. add a new update at the top).
2. Then run:

```bash
cd C:\BL4\Borderlands4-SaveEditor-3.4.5.2
git add news.txt
git commit -m "Update news"
git push
```

After you push, the dashboard will show the new content (it may take a few seconds or a refresh).

---

## If you get “Filename too long”

`.gitignore` already skips the long path `class_mods/**/assets/class_mods/`. If another path fails, add that path to `.gitignore` and run `git add .` again.
