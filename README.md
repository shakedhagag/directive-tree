<a href="https://marketplace.visualstudio.com/items?itemName=shagag.directive-tree" style="display: none;">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/shakedhagag/directive-tree/main/resources/icon.png" width="140">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/shakedhagag/directive-tree/main/resources/icon.png" width="140">
    <img src="https://raw.githubusercontent.com/shakedhagag/directive-tree/main/resources/icon.png" alt="Logo">
  </picture>
</a>

# Directive Tree VSCode Extension

## Overview

The Directive Tree extension for Visual Studio Code helps developers working with Next.js applications by providing a quick and easy way to visualize and navigate 'use client' and 'use server' directives in their codebase. This extension creates a tree view of these directives, organized by folders and files, making it easier to understand the client-server boundaries in your Next.js project.

## Features

- **Directive Scanning**: Automatically scans your workspace for 'use client' and 'use server' directives.
- **Tree View**: Displays a hierarchical view of directives organized by folders and files.
- **Quick Navigation**: Click on a tree item to jump directly to the file and line containing the directive.
- **Function Analysis**: Identifies and displays exported functions within directive files.
- **Unused Function Detection**: Highlights potentially unused exported functions.
- **Expandable/Collapsible Folders**: Easily expand or collapse folders in the tree view.

## Installation

1. Open Visual Studio Code
2. Press `Ctrl+P` (or `Cmd+P` on macOS) to open the Quick Open dialog
3. Type `ext install directive-tree` and press Enter
4. Click the Install button in the Extension view

## Usage

1. Open a Next.js project in Visual Studio Code.
2. The Directive Tree view will appear in the Explorer sidebar.
3. If the tree doesn't populate automatically, click the "Scan Directives" button in the Directive Tree view.
4. Expand folders and click on files to navigate to specific directives.
5. Click on function names to navigate to their definitions.
6. Use the refresh button to rescan the workspace or a specific file.

## Commands

- `Directive Tree: Scan Directives`: Scans the entire workspace for directives.
- `Directive Tree: Refresh Directives`: Refreshes the directives for the currently active file.
- `Directive Tree: Minimize Tree`: Collapses all folders in the tree view.
- `Directive Tree: Expand Tree`: Expands all folders in the tree view.
- `Directive Tree: Find References`: Finds references for a selected exported function.

## Configuration

- `directiveTree.showOnStartup`: (boolean, default: true) Show Directive Tree on startup.
- `directive-tree.tree.buttons.minimize`: (boolean, default: true) Show the minimize button in the directive tree view.

## Requirements

- Visual Studio Code v1.80.0 or higher
- A Next.js project using 'use client' and 'use server' directives

## Known Issues

Please refer to the [GitHub issue tracker](https://github.com/shakedhagag/directive-tree/issues) for any known issues and to report new ones.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is released under the [MIT License](LICENSE).

## Support

If you encounter any problems or have any suggestions, please [open an issue](https://github.com/shakedhagag/directive-tree/issues) on our GitHub repository.

---

Enjoy using the Directive Tree extension! I hope it helps you navigate your Next.js projects more efficiently.
