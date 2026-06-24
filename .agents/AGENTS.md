# LAN BeamDrop Agent Rules & Knowledge Base

Welcome! If you are an AI Agent assigned to work on the LAN BeamDrop project, these are the core rules and knowledge system you must follow.

## 1. Development Workflow
- **Proactive Testing**: Whenever implementing a new feature, especially backend API routes or core logic, proactively write automated unit/integration tests (using Jest/Supertest) without waiting for the user to request them. Test cases should cover edge cases and ensure streaming logic/timeouts are properly handled.

## 2. Project Overview
**LAN BeamDrop** is a high-performance, robust local network file and clipboard sharing application. It allows devices on the same Local Area Network (LAN) to easily transfer large files (up to 100GB+) and sync clipboards instantly without internet connectivity.
- **Frontend**: Vanilla JS + CSS (Single Page Application). No heavy frameworks like React/Vue to ensure maximum execution speed and zero build-step for the UI.
- **Backend**: Node.js + Express + Multer.

## 3. Agent Knowledge System
All detailed architectural guidelines, ironclad engineering rules, and deployment instructions have been systematically organized in the `docs/` directory. 
As an Agent, you **MUST** consult these documents before making architectural changes.

*   👉 **[docs/ARCHITECTURE.md](file:///docs/ARCHITECTURE.md)**: Contains the Product Requirements (PRD), System Design, and Ironclad Rules for Cross-Platform Compatibility (Windows/macOS/Linux) and Behavioral Integration Testing standards. **(CRITICAL: Read before modifying code)**

## 4. Project Structure
- `/public`: Frontend assets (`index.html`, `app.js`, `style.css`).
- `/routes`: Express backend route handlers (`files.js`, `clipboard.js`, `settings.js`, `explorer.js`).
- `/utils`: Backend utility functions (networking, mDNS, clipboard OS-native commands).
- `/tests`: Jest automated test suite covering persistence, security, and behavioral logic.
- `config.js`: Core system configuration and limits.
- `server.js`: Application entry point.

## 5. Development & Testing
- To run the application: `npm start`
- To run the automated test suite: `npm test`

## 6. Agent Workflow Constraint: Definition of Done (DoD)
**This is a HARD CONSTRAINT. Do NOT wait for the user to remind you.**
Before you complete a task or tell the user "I am done", you MUST execute the following checklist:
1. **Test Coverage**: Run `npm test`. If you added a feature, ensure behavioral tests exist.
2. **Knowledge Base Synchronization**: Ask yourself: *"Did my code changes alter the project's logic, architecture, configuration defaults, or API endpoints?"*
   - If **YES**, you MUST proactively open and modify `docs/ARCHITECTURE.md` to reflect the new reality. 
   - **Never leave the documentation out of sync with the codebase.**
3. **Frontend Visual QA (Visual Stacking & Modals)**: If you made changes to frontend UI elements (especially `z-index`, modals, or error toasts), you **MUST** verify the visual stacking context. Do not assume `showToast` or an HTML overlay works without visual verification. Use the Chrome DevTools MCP or instruct the user to verify overlapping UI elements (Happy Path & Error Path) on both desktop and mobile views before marking UI tasks as done.

## 7. Git Workflow & Remote Repository Constraints
**CRITICAL: NEVER Push Directly to the Main Branch (`origin/main`).**
1. All feature developments, bug fixes, and tests must be committed to a dedicated **feature branch** (e.g., `feat/xxx`, `fix/xxx`).
2. When pushing code to the remote repository, push the feature branch (`git push origin <branch-name>`).
3. Inform the user that the branch has been pushed and a **Pull Request (PR)** needs to be manually created by the repository manager. The code will only be merged into `main` after passing the CI checks.

## 8. Git Commit Message Guidelines (Strict Enforcement)
- **Do NOT use brackets `[]` in the commit prefix.** The `[NEW/ENH/FIX]` in `docs/ARCHITECTURE.md` is a selection placeholder. The actual commit must start directly with the type (without brackets), for example:
  - `NEW: ...` (not `[NEW]: ...`)
  - `ENH: ...` (not `[ENH]: ...`)
  - `FIX: ...` (not `[FIX]: ...`)
- **Always include WHY, WHAT, and TEST sections** separated by blank lines exactly as defined in `docs/ARCHITECTURE.md`.
