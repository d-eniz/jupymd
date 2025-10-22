---
title: Configuring JupyMD
description: A quick guide to setting up and customising JupyMD
---
There are a number of preferences that can be set from the plugin's settings page.

## Setup

### **Python Interpreter**
Select the Python interpreter that JupyMD will use to run code blocks.  
- Default: `python` on Windows, `python3` on macOS/Linux.  
- You can  <a href="/guides/selecting-interpreters">set this to a specific path</a> (e.g., a virtual environment interpreter).


### **Install Required Libraries**
Click **Install** to automatically install `jupytext` and `matplotlib` for the selected interpreter using `pip`.  
This ensures that JupyMD can synchronise Markdown and Jupyter Notebook files properly.

---

## General

### **Jupyter Notebook Editor Launch Command**
Define the command used to open Jupyter notebooks in your preferred environment.  
Examples:
- `code` → Launches in **VS Code**
- `jupyter-lab` → Launches in **Jupyter Lab**
- `pycharm64.exe` → Launches in **PyCharm**

---

### **Custom Python Code Blocks**
When enabled, JupyMD uses its own Python code block styling instead of the default Obsidian one.  
> Requires a restart to take effect.

---

### **Automatic Sync**
When enabled, JupyMD automatically synchronises changes between Markdown (`.md`) and Jupyter Notebook (`.ipynb`) files.  
If you encounter sync issues, you can disable this option and sync manually through the “JupyMD: Sync files” command.

---

### **Bidirectional Sync**
Determines the direction of syncing between Markdown and Notebook files:
- **Enabled:** Changes in either file type are mirrored in the other.
- **Disabled:** Markdown files overwrite their paired notebooks on sync.

> Disable this if you notice overwriting or version conflicts.
