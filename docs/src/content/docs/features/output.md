---
title: Output
description: Learn how JupyMD handles and preserves code outputs.
---

JupyMD supports live code execution within Markdown notes and automatically manages how outputs are displayed and preserved.


## How output works
When you execute a code block in a JupyMD note:
1. The code is sent to a background Python process (the JupyMD kernel).
2. Standard output (`stdout`), standard error (`stderr`), and any images generated are captured.
3. These outputs are written back into the corresponding cell of the paired `.ipynb` file.
4. The plugin then synchronizes your `.md` note and `.ipynb` file using Jupytext, ensuring both remain consistent.


## Persistent output

When you execute a code block, the output is not lost after closing the note or restarting Obsidian.  
Instead, the results are stored directly inside the associated `.ipynb` file.

So when you reopen the note, alll previously executed outputs are automatically re-rendered. You don’t need to re-run the cell unless you’ve changed the code.


## Output types supported
JupyMD currently supports the following output types:

- Standard output (```stdout```): Anything printed using print().
- Standard error (```stderr```): Any errors or warnings raised during execution.
- Rich output: Automatically captured from Matplotlib figures (```plt.show()```).