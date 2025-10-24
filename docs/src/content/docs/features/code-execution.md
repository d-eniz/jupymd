---
title: Code Execution
description: Learn how to execute and manage Python code blocks in JupyMD
---

JupyMD allows you to run Python code blocks directly within your Markdown documents.  
Each code block behaves like a Jupyter Notebook cell — you can execute it, view outputs, and clear results without leaving Obsidian.


When a Markdown file is **paired** with a Jupyter Notebook (`.ipynb`), each fenced code block (e.g., ```python) corresponds to a Jupyter cell.  
The plugin synchronizes these automatically, so running a cell updates both the Markdown and the Notebook representations.

<!-- ADD A CODE BLOCK BEFORE AND AFTER BEING RAN HERE -->
---

## Running Code

Each code block includes a small toolbar in the top-right corner:

| Action | Description |
|---------|-------------|
|  **Run cell** | Executes the code block using the selected Python interpreter |
| **Clear output** | Removes all outputs for this cell |
| **Loading** | Shown while code is running |

When you click **Run**, JupyMD:
1. Ensures the Markdown file is paired with its `.ipynb`.
2. Sends the code to the Python interpreter for execution.
3. Waits for synchronization to complete.
4. Displays any resulting text or images below the block.
---

## Pairing Requirement

Code execution is only available when your Markdown file is paired with a Jupyter Notebook.  
If pairing is disabled, the toolbar will not show execution buttons.

To pair a file, use the **JupyMD: Pair notebook** command or ensure that both `.md` and `.ipynb` files exist in the same directory with matching filenames.