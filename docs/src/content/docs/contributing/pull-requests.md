---
title: Checking out pull requests
description: How to review and test jupyMD pull requests locally.
---

When contributing to the plugin, you may want to check out pull requests (PR) to review code, test features or continue development. This page explains how to fetch and check out pull requests for jupyMD from GitHub using both Git and the GitHub CLI, so you can run and verify changes in your local environment.

### Pull requests in JupyMD
Pull requests are used to propose or discuss changes before they are merged into the main branch of the project repository. Contributors can open PRs for bug fixes, feature additions, or documentation improvements (see [Contribution Guidelines](/contributing/contribution-guidelines) for more information.)

Checking out a PR locally allows you to:
- Run the plugin in Obsidian and verify behaviour.
- Test compatibility with other plugins or Obsidian versions.
- Provide detailed feedback before merging pull request.

## Checking out a pull request

### Option 1: Using Git
#### Step 1: Clone the JupyMD Repository
If you haven't already, clone the official JupyMD repository:
```bash
git clone https://github.com/d-eniz/jupymd.git
cd jupyMD
```
or if you're contributing from a fork:

```bash
git clone https://github.com/<your-username>/jupymd.git
cd jupyMD
git remote add upstream https://github.com/d-eniz/jupymd.git
```

#### Step 2: Configure Git to Fetch Pull Requests
You can configure Git to fetch all open pull requests from the main repository:
```bash
git config --add remote.upstream.fetch "+refs/pull/*/head:refs/remotes/upstream/pr/*"
```

This command updates the fetch configuration for the origin remote, instructing Git to fetch pull request data into a new ref namespace, pr/*.
- +refs/pull/*/head: This specifies that Git should fetch the head (the tip of the branch) of all pull requests.

- refs/remotes/origin/pr/*: This tells Git to store these heads in a local ref path that can be checked out easily.
This is useful if you want to checkout and view many PRs in sequence.

#### Step 3: Fetch all pull requests
Once you have configured Git to recognise pull requests:

```bash
git fetch origin
```
This command pulls all pull request data into your local repository under the refs specified earlier.

#### Step 4: Checkout a specific pull request
After fetching the pull requests, you can checkout a specific one by referring to its PR number:
```bash
git checkout pr/1234
```

Replace ```1234``` with the actual pull request number

### Option 2: Using GitHub CLI
If you use GitHub CLI, you can checkout pull requests directly by listing the open pull requests:
```bash
gh pr list
```
and then checking out a pull request by number
```bash
gh pr checkout 1234
```

Replace ```1234``` with the pull request number - the CLI will handle the fetching and checking out steps.



## Reviewing and testing the pull request locally
With the PR checked out locally, you can now compile the code, run tests, or do manual testing to ensure that the changes meet the project's standards and do not introduce bugs.
