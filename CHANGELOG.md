# Change Log

All notable changes to the "Directive Tree" extension will be documented in this file.

## Version 0.3.2 (2024-09-12)

### Added
 - VSCode's native collapse all functionality for the tree view.
 - Now using @vscode/ripgrep first, and fallback to machine's ripgrep if needed (this would ensure users without ripgrep installed will not have issues running this extension)

### Changed
- Removed custom expand all and collapse all functionalities.
- Removed unused code related to manual expand/collapse state management.
- Simplified DirectiveTreeProvider class for better performance.
- Improved tree view rendering and state management.
- Removed unnecessary expand/collapse related methods from DirectiveTreeProvider.
- Simplified getTreeItem and getChildren methods.

## [0.3.0] - 2024-09-10

### Added
- Function analysis: Identifies and displays exported functions within directive files.
- Unused function detection: Highlights potentially unused exported functions.
- New command: "Find References" for exported functions.
- Quick navigation to function definitions by clicking on function names in the tree view.

### Changed
- Updated tree view to include exported functions under each file.
- Improved performance of directive scanning and function analysis.

### Fixed
- Resolved issues with circular references in tree items.
- Fixed incorrect display of unused functions in certain scenarios.

## [0.2.0] - 2024-09-09

### Added
- Automatic refresh of tree view on file save.
- Manual refresh option for individual files.
- Expand/collapse all folders functionality.

### Changed
- Improved tree view organization and icons.

## [0.1.0] - 2024-09-05

### Added
- Initial release of Directive Tree extension.
- Basic scanning for 'use client' and 'use server' directives.
- Tree view of directives organized by folders and files.
- Quick navigation to directive locations.
