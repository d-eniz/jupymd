---
title: Syncing
description: Put description here ARI !!
---

JupyMD continuously keeps your Markdown and Notebook files in sync:

- After running code, the `.ipynb` file is updated first.
- The Markdown file is then timestamped to remain the authoritative source.
- This avoids sync bias where the Notebook’s newer modification time could overwrite Markdown content.

If the plugin detects temporary sync blocking (e.g., while autosaving), it will retry for a few seconds before proceeding.
