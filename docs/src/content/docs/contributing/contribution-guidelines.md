---
title: Contribution guidelines
description: Guidelines and best practices for contributing to JupyMD.
---

This project was originally built to solve a personal problem, and it's still in an early stage. Feedback, bug reports, and pull requests are all welcome and appreciated!
If you are interested in contributing, please read the following guidelines to keep the project maintainable.

### General etiquette

Remember that this is a community driven project, maintained in people’s free time. Please be patient and respectful when waiting for a response.

### Commits

- Use [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/).
- Keep commits to **one logical change at a time**. Try to avoid large commits.
- Make sure your commits leave the project in a working state.
- Don't bump versions or edit the manifest file.

### Pull requests

1. Before working on a PR, discuss the topic in issues first. Make sure this discussion is **meaningful** and give it some time for other people to read the issue. This is a good way of learning more about the problem at hand, and also prevents multiple people submitting a PR for the same issue.
2. Keep PRs small and focused, tackle one problem/feature/topic at a time.
3. Describe your problem clearly and extensively, point to any issues where this has been discussed. Describe your code and how you have tackled the problem.
4. If your PR makes a visual change, add screenshots showing the change.
5. Aim to make PRs ready to merge.

### Draft pull requests

You are allowed to submit a draft PR, given you [tag it appropriately](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/about-pull-requests#draft-pull-requests). If your PR is almost ready, but there is a small section that you need help with, you may create a draft PR. If you’re unsure how to approach the problem your PR will focus on, it’s best to start a discussion in issues first. Draft PRs are not exempt from any of the guidelines described above.

### Notes on maintainability

It is a good idea to have a general understanding of the project workflow and the [Obsidian API](https://docs.obsidian.md/Home) before editing the codebase. You are not expected to understand every detail of the codebase, but even just seeing how every component fits together in [`main.tsx`](https://github.com/d-eniz/jupymd/blob/master/src/main.tsx) would help massively with the quality of your submitted code.

It is important that we keep the codebase tidy and easy to understand. Not only does this make it easier for new contributors to learn the codebase, it also makes maintenance and spotting problems easier.

If you choose to use AI, make sure the generated code makes sense within the context of the general codebase.

---


