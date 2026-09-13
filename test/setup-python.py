"""Provision disposable test environments; never install into the invoking Python."""
import json
from pathlib import Path
import subprocess
import sys
import venv

root = Path(__file__).resolve().parent.parent
base = root / '.test-env'
for name in ('tooling', 'kernel'):
    directory = base / name
    venv.EnvBuilder(with_pip=True, symlinks=sys.platform != 'win32').create(directory)
    python = directory / ('Scripts/python.exe' if sys.platform == 'win32' else 'bin/python')
    subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(root / 'test' / f'requirements-{name}.txt')], check=True)
    freeze = subprocess.check_output([str(python), '-m', 'pip', 'freeze'], text=True)
    (base / f'{name}-freeze.txt').write_text(freeze, encoding='utf-8')
(base / 'versions.json').write_text(json.dumps({'python': sys.version}, indent=2), encoding='utf-8')
print('Test environments ready at', base)
