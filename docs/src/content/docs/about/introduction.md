---
title: Introduction
description: Essential information about JupyMD
---
JupyMD for Obsidian enables Jupyter notebook functionality in Obsidian. Make markdown files behave like `.ipynb` notebooks, with live code execution, rich output rendering, and bidirectional syncing between `.md` and `.ipynb` files.

## Integrate your programming notes into Obsidian

With JupyMD you can:
- Run Python code
- Create plots with `matplotlib`
- Conduct data analysis with `pandas` dataframes
- Build machine learning models with `sklearn` and `pytorch`
- And much of what you would typically use a Jupyter notebook for

... all in your Obsidian vault!

## Use-cases:

### Machine learning workflow
![ml-workflow](/assets/../example-ml-workflow.gif)

### Visualising fractals with `matplotlib`
![mandelbrot-set](/assets/../mandelbrot-set.png)



## Features

- **Notebook Conversion**
  - Convert existing notes in Obsidian to `.ipynb` files via Jupytext
  - Convert existing Jupyter notebooks (`.ipynb`) to Markdown notes (`.md`) via Jupytext
- **Bidirectional Updates** – Changes in Obsidian or Jupyter automatically sync between `.md` and `.ipynb` files
- **Execute Code** – Run code blocks in Obsidian with output captured below each block, regardless of viewing mode
- **Persistent Execution Environment** – Variables and imports defined in one code block are remembered by the following code blocks
- **True Jupyter Sync** – Executed code blocks automatically update output metadata in linked `.ipynb` file
- **Persistent Output Rendering** – Executed code outputs stay visible after restart and sync to `.ipynb` file
- **Rich Output** – Support for `matplotlib` plots and `pandas` dataframe outputs

> **NOTE:**
> JupyMD currently supports Python execution only.
>
> Future versions will expand language support, though this feature is not yet in active development. Your help is appreciated, feel free to open an issue or submit a pull request if you would like to contribute!
