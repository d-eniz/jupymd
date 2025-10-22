---
title: Prerequisites for Contributing
description: Prerequisites for contributing to JupyMD
---

In addition to the requirements for running the plugin (see <a href="/../guides/getting-started/#prerequisites">Prerequisites</a>), you’ll need to install a few additional tools to set up your development environment for contributing to JupyMD.

---

## Install Required Tools

### 1. Node.js and npm

JupyMD uses **Node.js** and **npm** (Node Package Manager) for development, build, and dependency management.

- Download and install Node.js (which includes npm) from the [Node.js website](https://nodejs.org/).
- Verify your installation:

```bash
node -v
npm -v
```

### 2. Git
You'll need Git to clone the repository and manage branches:
```bash
git --version
```
If you don't have Git installed, download it from [here](https://git-scm.com/)


### 3. BRAT (Beta Reviewers Auto-update Tester)

When developing or reviewing pull requests for JupyMD, manually copying plugin files into your Obsidian vault can be cumbersome.  
Instead, you can use the **[Obsidian BRAT plugin](https://github.com/TfTHacker/obsidian42-brat)** to automatically install and update the development version of JupyMD from GitHub.

1. Download the plugin through the [Obsidian community plugin browser](obsidian://show-plugin?id=obsidian42-brat) and enable it.
2. In Obsidian’s Command Palette (`Ctrl/Cmd + P`), run:  
   **BRAT: Add a beta plugin for testing**
3. Enter the JupyMD GitHub repository path
4. BRAT will automatically download and install the development version of JupyMD into your vault.