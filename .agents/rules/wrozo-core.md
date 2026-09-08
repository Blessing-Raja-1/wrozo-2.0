# Wrozo Core Operational Rules

## 1. Project Context & Purpose
- Wrozo is a real, production-oriented marketplace connecting workers and contractors. It is not a demo, prototype, or sandbox project.
- **Primary Target:** Android.
- **Client Technology:** Flutter + Dart.
- **State Management:** Riverpod (`flutter_riverpod`).
- **Routing Engine:** GoRouter (`go_router`).
- **Backend Infrastructure:** Firebase (Auth, Firestore, Cloud Functions/Server-side mechanisms).

## 2. Security & Trust Model
- **The mobile client is untrusted.** Never trust client assertions for authorization, state transitions, or verification.
- **Server-Side Authorization:** Sensitive authorization, validations, and constraints must be strictly enforced server-side (e.g., Firestore Security Rules, Cloud Functions).
- **Role Enforcement:** The client must never control or assign privileged roles (`role`, `isVerified`, etc.).
- **Payments:** The client must never be trusted for payment status, payment verification, or balance updates. Payment completion must be verified via server-side webhooks or authoritative backend systems.
- **Secrets Management:** Never commit secrets, API keys, credentials, or private configuration files.

## 3. Engineering Practices
- **Preserve Existing Architecture:** Adhere to established patterns and directory structure (`lib/core/`, `lib/features/`) unless a documented, technically justified reason necessitates a change.
- **Inspect Before Editing:** Always read, verify, and understand relevant code, rules, and configurations prior to proposing or executing modifications.
- **Scope Discipline:** Modify only the files strictly necessary to accomplish the scoped task. Avoid unnecessary refactoring, reformatting, or dependency upgrades.
- **Test Meaningful Changes:** Test code and logic rigorously. Never claim production readiness without concrete verification and evidence.

## 4. Mandatory Project Memory Maintenance (`docs/current-status.md`)
- `docs/current-status.md` is the permanent single source of current-state truth.
- It **MUST** be updated after every meaningful change, including:
  - Feature completion
  - Bug discovery or bug fixes
  - Security configuration changes
  - Architecture decisions and adjustments
  - Dependency additions, removals, or upgrades
  - Build and test results
  - Firebase or Firestore changes
  - Payment or transactional changes
  - Major UI modifications
  - Production blockers
  - Git commits
- Always record factual, verified status using markers (`VERIFIED`, `UNVERIFIED`, `PARTIAL`, `BLOCKED`, `PLANNED`). Never state assumptions as facts.

## 5. Session Startup Protocol
At the beginning of every session:
1. Read `docs/current-status.md`.
2. Check Git status (`git status`).
3. Determine the current task and proceed from the documented state without repeating prior history.
