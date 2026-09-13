# Tests

## Setup

Requires Node.js 22+ and Python 3.12 (Python is unnecessary for unit tests). Run from the repository root:

```sh
npm ci
python3.12 test/setup-python.py
npm test
```

On Windows, use `py -3.12 test/setup-python.py`. Setup installs pinned dependencies in `.test-env/tooling` and `.test-env/kernel`.

Desktop tests use WebdriverIO with `wdio-obsidian-service`, download Obsidian automatically, and run an isolated plugin build in copied fixture vaults. Your installed plugin and personal vault are untouched.

## Commands

| Command | Runs |
| --- | --- |
| `npm test` | Typecheck and all three test layers |
| `npm run test:unit` | Fast logic and protocol tests |
| `npm run test:integration` | Real Python, Jupytext, Jupyter and executor tests |
| `npm run test:e2e` | End-user workflows in Obsidian |
| `npm run test:typecheck` | Test and configuration type checks |

Run selected tests:

```sh
npm run test:unit -- --grep 'fragmented'
npm run test:e2e -- --spec test/e2e/indexing.e2e.ts
```

Desktop tests default to the latest Obsidian app and installer. CI tests latest on Linux, Windows and macOS, plus 1.8.4 on Linux. To check 1.8.4 locally:

```sh
OBSIDIAN_VERSIONS='1.8.4/1.8.4' npm run test:e2e
```

In PowerShell, set `$env:OBSIDIAN_VERSIONS = '1.8.4/1.8.4'` first.

Failure artifacts are saved under `test-results/`; integration failures preserve their temporary workspace.
