# Test Architecture Refactoring Design

## 1. Context and Goals
The current `files.test.js` interacts with the physical disk, leading to brittle tests, especially on Windows due to file locking issues. The test coverage for the core `files.js` logic is low (67%).
The goal is to refactor the testing infrastructure to make tests fast, deterministic, safe (no real disk I/O), and completely cross-platform compatible (Win/Mac/Linux).

## 2. Proposed Architecture

### 2.1 File System Virtualization (Mocking)
We will transition away from physical disk operations in tests by heavily mocking the `fs` module using Jest's mocking capabilities (`jest.mock('fs')`).
- Tests will no longer leave `.uploading` trash files on developers' hard drives.
- The `fs` module will be mocked to simulate directories, files, and various permission states entirely in memory for tests.

### 2.2 Cross-Platform Simulation Matrix
To adhere to the LAN BeamDrop Iron Rules of cross-platform compatibility, the test suite must verify behavior under different OS conditions.
- We will use `jest.mock('os')` and dynamic overrides for `path` (using `path.posix` vs `path.win32`) to simulate running the app on Windows, Mac, and Linux.
- This ensures that a filename containing Windows-illegal characters (e.g., `test:file?.txt`) sent from a Mac client is correctly caught and sanitized by the backend regardless of where the developer is running the test.

### 2.3 Boundary and Edge-Case Coverage
The test suite will explicitly test:
- **Permission Errors**: Simulating `fs.unlinkSync` or `fs.createWriteStream` throwing `EACCES` (Permission Denied) and ensuring the app recovers gracefully with appropriate HTTP 500 responses without crashing the Node.js process.
- **Path Traversal Attacks**: Constructing payloads like `../../etc/passwd` or `C:\Windows\System32` and asserting the backend sanitizes the `path.basename`.
- **Interrupted Transfers**: Simulating an aborted upload stream and verifying the `.uploading` suffix cleanup logic.

## 3. Execution Strategy
Rather than doing a massive rewrite of `routes/files.js` into separate service layers (which might overcomplicate the zero-dependency, lightweight nature of LAN BeamDrop), we will focus entirely on **enhancing the testing environment**. We will inject `jest.mock('fs')` directly into `tests/routes/files.test.js` and wrap the Express app in a robust, isolated testing context.

## 4. Open Questions & Ambiguities (Resolved)
- *Does this need an external library like `memfs`?* No, `jest.mock('fs')` and `jest.spyOn` are sufficient and maintain our zero-dependency philosophy.
- *How do we test Windows path behaviors on a Mac?* We will explicitly mock `path.sep` and `path.basename` behaviors in the test suites to emulate different OS environments.
