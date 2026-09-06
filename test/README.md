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
| `npm run test:regressions` | Three known synchronization failures |

The regression command currently exits nonzero for known bugs and is excluded from `npm test`. Move each case into the regular suite when fixed.

Husky runs typechecking and unit tests before each commit (about 3 seconds locally). Commitlint checks the commit message.

Run selected tests:

```sh
npm run test:unit -- --grep 'fragmented'
npm run test:e2e -- --spec test/e2e/indexing.e2e.ts
```

Desktop tests default to Obsidian app/installer `1.8.4/1.8.4`. Override with:

```sh
OBSIDIAN_VERSIONS='latest/latest' npm run test:e2e
```

In PowerShell, set `$env:OBSIDIAN_VERSIONS = 'latest/latest'` first.

Failure artifacts are saved under `test-results/`; integration failures preserve their temporary workspace.
