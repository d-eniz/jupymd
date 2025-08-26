![jupymd-logo](assets/jupymd-logo-wide.png)

# JupyMD for Obsidian
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/d-eniz/jupymd/total?style=flat-square&logo=obsidian&color=%235b3fbf)
![GitHub Release](https://img.shields.io/github/v/release/d-eniz/jupymd?style=flat-square&color=%235b3fbf)

Enables Jupyter notebook functionality in Obsidian. Make markdown files behave like `.ipynb` notebooks, with live code execution, rich output rendering, and bidirectional syncing between `.md` and `.ipynb` files.

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
![ml-workflow](assets/example-ml-workflow.gif)

### Visualising fractals with `matplotlib`
![mandelbrot-set](assets/mandelbrot-set.png)


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

## Prerequisites

- [Python](https://www.python.org/downloads/)
- [Jupyter Notebook](https://jupyter.org/install)
  `pip install notebook`
- [Jupytext](https://github.com/mwouts/jupytext)
  `pip install jupytext`


## Getting started

Download the plugin through the [Obsidian community plugin browser](obsidian://show-plugin?id=jupymd) and enable it. If not yet installed, install Jupyter notebook and Jupytext through pip.

### To convert a note to a Jupyter notebook
Execute the following command on a note you want Jupyter notebook capability on:
> `JupyMD: Create Jupyter notebook from note`

This will create an `.ipynb` file with the same file name as the current note on the file directory, and will transform your Python code blocks into interactive code blocks. Your note will now behave like a Jupyter notebook, and sync its contents automatically to the `.ipynb` file. You may choose to ignore the created `.ipynb` file completely, as its functionality will be mirrored in Obsidian.

### To convert a Jupyter notebook to a note
Open a `.ipynb` file in Obsidian and execute:
> `JupyMD: Create note from Jupyter notebook`

This will create a Markdown note (`.md`) with the same file name as the notebook, and set up bidirectional sync between the notebook and the note.

## Contributing

This project was originally built to solve a personal problem, and it's still in an early stage. Feedback, bug reports, and pull requests are all welcome and appreciated!

> [!NOTE]
> JupyMD currently supports Python execution only.
>
> Future versions will expand language support, though this feature is not yet in active development. Your help is appreciated, feel free to open an issue or submit a pull request if you would like to contribute!

JupyMD is an independent project and not affiliated with Project Jupyter or Obsidian.
