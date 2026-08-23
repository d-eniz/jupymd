import os
from pathlib import Path
import stat
import sys
import tempfile

import nbformat


def main():
    source = Path(sys.argv[1])
    source_mode = stat.S_IMODE(source.stat().st_mode)
    notebook = nbformat.read(source, as_version=4)

    descriptor, temporary_path = tempfile.mkstemp(
        prefix=f".{source.name}.",
        suffix=".tmp",
        dir=source.parent,
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as temporary_file:
            nbformat.write(notebook, temporary_file, version=4)
        os.chmod(temporary_path, source_mode)
        os.replace(temporary_path, source)
    except Exception:
        if os.path.exists(temporary_path):
            os.unlink(temporary_path)
        raise


if __name__ == "__main__":
    main()
