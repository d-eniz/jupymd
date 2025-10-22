---
title: Getting started
description: A guide on how to start using JupyMD on your obsidian.
---

Download the plugin through the [Obsidian community plugin browser](obsidian://show-plugin?id=jupymd) and enable it.

### Prerequisites
In order for JupyMD to run correctly, you must have the following installed on your machine:

- [Python](https://www.python.org/downloads/)
- [Jupyter Notebook](https://jupyter.org/install)
  `pip install notebook`
- [Jupytext](https://github.com/mwouts/jupytext)
  `pip install jupytext`

This can be done manually through the commands above or by navigating to Obsidian Settings -> JupyMD Settings -> Setup -> Install Required Libraries

### To convert a note to a Jupyter notebook
Execute the following command on a note you want Jupyter notebook capability on:
> `JupyMD: Create Jupyter notebook from note`

This will create an `.ipynb` file with the same file name as the current note on the file directory, and will transform your Python code blocks into interactive code blocks. Your note will now behave like a Jupyter notebook, and sync its contents automatically to the `.ipynb` file. You may choose to ignore the created `.ipynb` file completely, as its functionality will be mirrored in Obsidian.

### To convert a Jupyter notebook to a note
Open a `.ipynb` file in Obsidian and execute:
> `JupyMD: Create note from Jupyter notebook`

This will create a Markdown note (`.md`) with the same file name as the notebook, and set up bidirectional sync between the notebook and the note.