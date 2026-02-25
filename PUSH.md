# If `git push` fails with "could not read Username"

Your remote is HTTPS: `https://github.com/milovandekic23-oss/SPSS-AI.git`. Use one of these:

## Option 1: Switch to SSH (recommended)

```bash
git remote set-url origin git@github.com:milovandekic23-oss/SPSS-AI.git
git push
```

(Requires an SSH key added to your GitHub account.)

## Option 2: Use a Personal Access Token over HTTPS

1. GitHub → Settings → Developer settings → Personal access tokens → Generate new token (classic). Give it `repo` scope.
2. When you run `git push`, use the token as the password when prompted for password (username = your GitHub username).
3. Or cache it: `git config --global credential.helper store`, then push once and enter token as password.

## Option 3: GitHub CLI

```bash
brew install gh   # or install from https://cli.github.com
gh auth login
git push
```
