# Change Log

All notable changes to the "Directive Tree" extension will be documented in this file.

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
