# Push to GitHub & Auto-Update Web View

Follow these steps to put your project on GitHub and have a live site that updates whenever you push.

---

## Part 1 — One-time setup

### 1. Install Git (if needed)

On macOS, Git may already be installed. Check:

```bash
git --version
```

If not, install from [git-scm.com](https://git-scm.com) or run `xcode-select --install`.

### 2. Create a new repository on GitHub

1. Go to [github.com](https://github.com) and sign in.
2. Click the **+** (top right) → **New repository**.
3. **Repository name:** e.g. `AI-SPSS` (use this exact name if you want the live URL to be `https://YOUR_USERNAME.github.io/AI-SPSS/`).
4. Leave it **empty** (no README, no .gitignore).
5. Click **Create repository**.

### 3. Connect your project and push

In Terminal (in your project folder):

```bash
cd "/Users/milovand/AI SPSS"

# Initialize Git
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit: AI Statistics Assistant"

# Rename branch to main (if needed)
git branch -M main

# Add your GitHub repo (replace YOUR_USERNAME and YOUR_REPO with yours)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push to GitHub
git push -u origin main
```

When prompted, sign in with your GitHub account (or use a [Personal Access Token](https://github.com/settings/tokens) if you use 2FA).

### 4. Turn on GitHub Pages

1. On GitHub, open your repo → **Settings** → **Pages** (left sidebar).
2. Under **Build and deployment**:
   - **Source:** GitHub Actions
3. Save. Nothing else to configure; the workflow will run on every push to `main`.

---

## Part 2 — When you make changes (daily workflow)

Whenever you change the project and want the code and the live site updated:

```bash
cd "/Users/milovand/AI SPSS"

# See what changed
git status

# Stage changes
git add .

# Commit with a short message
git commit -m "Describe what you did, e.g. Add value labels editor"

# Push to GitHub (this triggers the deploy)
git push
```

After a minute or two, your live site will update.

- **Live site URL:** `https://YOUR_USERNAME.github.io/AI-SPSS/` (if the repo is named `AI-SPSS`).
- **Repo URL:** `https://github.com/YOUR_USERNAME/AI-SPSS`.

---

## If your repo name is not `AI-SPSS`

The app is built with base path `/AI-SPSS/` for GitHub Pages. If your repo has a different name (e.g. `ai-spss`):

1. Open **`vite.config.ts`** in the project.
2. Change the line:
   - from: `base: process.env.GITHUB_ACTIONS ? '/AI-SPSS/' : '/',`
   - to: `base: process.env.GITHUB_ACTIONS ? '/YOUR-REPO-NAME/' : '/',`
3. Save, then commit and push as in Part 2.

---

## Summary

| Step | What you do |
|------|----------------|
| One-time | Create repo on GitHub, `git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push -u origin main` |
| One-time | Settings → Pages → Source: **GitHub Actions** |
| Every time you change the app | `git add .` → `git commit -m "message"` → `git push` |

Pushing to `main` runs the workflow, builds the app, and deploys to GitHub Pages so the web view stays in sync with your latest changes.
