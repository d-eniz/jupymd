---
title: Selecting interpreters
description: A guide on how to select interpreters and setting up a virtual environment
---

The plugin currently only supports **Python** and will automatically set a default interpreter appropriate to your operating system:

- **Windows:** `python`  
- **MacOS/Linux:** `python3`

You can change this setting in the plugin’s preferences. Under **“Python Interpreter”**, specify a custom path to a different Python installation i.e. a specific version or a virtual environment.

---

### Using a Virtual Environment

Using a **virtual environment** is recommended to avoid conflicts between the plugin and your system-wide Python installation. 

---

#### Windows users

1. Open your project directory in the terminal or PowerShell.  
2. Create a virtual environment (if you haven’t already):

   ```bash
   python -m venv venv
   ```
3. Locate the path to your environment's Python interpreter:
    ```
    <your_project_path>\venv\Scripts\python.exe
    ```
#### MacOS / Linux users
1. Open a terminal in your project directory.
2. Create a virtual environment (if you haven't already):

    ```bash
    python3 -m venv venv
    ```

3. Locate the path to your environment's Python interpreter:
    ```
    /path/to/your/project/venv/bin/python3
    ```


#### Installing packages in a virtual environment
It is also possible to install packages directly into the virtual environment. This can be done from the terminal by:
-  MacOS/ Linux users:
```bash
/path/to/your/project/venv/bin/python3 pip install packages
``` 
- Windows users:
```bash
<your_project_path>\venv\Scripts\python.exe pip install packages
```