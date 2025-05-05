# JupyMD for Obsidian

Enables Jupyter notebook functionality in Obsidian. Make markdown files behave like `.ipynb` notebooks, with live code execution, rich output rendering, and bidirectional syncing between `.md` and `.ipynb` files.

![plugin.gif](assets/plugin.gif)

## Features

- **Notebook Conversion** – Convert existing notes in Obsidian to `.ipynb` files via Jupytext
- **Bidirectional Updates** – Changes in Obsidian or Jupyter automatically sync between `.md` and `.ipynb` files
- **Execute Code** – Run code blocks in Obsidian with output captured below each block
- **True Jupyter Sync** – Executed code blocks automatically update output metadata in linked `.ipynb` file
- **Persistent Outputs** – Executed code outputs stay visible after restart and sync to `.ipynb` file
- **Kernel Management** – Maintains Python kernel state across executions within a notebook

## Prerequisites

- [Python](https://www.python.org/downloads/)
- [Jupyter Notebook](https://jupyter.org/install)
  `pip install notebook`
- [Jupytext](https://github.com/mwouts/jupytext)
  `pip install jupytext`

> [!NOTE]
> JupyMD currently supports Python execution only.
> 
> Future versions will expand language support, though this feature is not yet in active development. Your help is appreciated, feel free to open an issue or submit a pull request if you would like to contribute!
