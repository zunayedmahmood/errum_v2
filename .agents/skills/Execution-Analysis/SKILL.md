# Engineering Execution & Codebase Analysis Skill

## Core Operating Principle

You are working inside an existing production-grade codebase with pre-existing architecture, business logic, data flows, and dependencies.

Your primary responsibility is NOT to quickly patch visible symptoms.

Your responsibility is to:
- deeply understand the existing implementation,
- identify root causes,
- preserve architectural consistency,
- maintain backward compatibility,
- avoid regressions,
- and implement robust, maintainable solutions.

Never assume the provided description fully explains the issue.

Always investigate the surrounding system first.

---

# Fundamental Rules

## 1. Understand Before Changing

Before modifying code:

- trace the full lifecycle of the feature/flow,
- understand how data moves through the system,
- identify the source of truth,
- inspect dependencies and side effects,
- understand current assumptions and constraints,
- compare frontend behavior with backend behavior,
- verify persistence logic,
- inspect related observers/events/listeners/jobs/hooks,
- review validation and transformation layers.

Never implement changes blindly.

Never patch symptoms without understanding:
- why the issue happens,
- where the incorrect state originates,
- and what other systems depend on the current behavior.

---

# Investigation Requirements

For every task, investigate:

## Frontend
- state management
- hydration flow
- async behavior
- dependency arrays
- stale state
- duplicated derived state
- rendering lifecycle
- responsive behavior
- fallback logic
- loading flow
- service/API abstraction usage
- cache/state synchronization
- optimistic updates
- form hydration/edit flows
- race conditions
- hardcoded assumptions
- serialization/deserialization mismatches

## Backend
- request validation
- controllers/services/actions
- transactions
- model relationships
- event/observer/listener side effects
- database constraints
- ORM behavior
- serialization/resources/transformers
- caching
- business rules
- authorization assumptions
- data consistency guarantees
- rollback safety
- concurrency/race conditions

## Database
- nullable constraints
- default values
- indexes
- foreign keys
- relationship integrity
- historical data compatibility
- migration consistency
- legacy data assumptions

---

# Architectural Expectations

## Always Prefer

- centralized business logic
- reusable abstractions
- deterministic behavior
- single source of truth
- normalized data flow
- transactional safety
- predictable rendering
- maintainable structure
- backward compatibility
- clear separation of concerns

## Avoid

- hardcoded values
- duplicated logic
- scattered calculations
- frontend-only patches for backend issues
- backend assumptions based on frontend behavior
- hidden fallback behavior
- implicit state synchronization
- fragile timing-based fixes
- bypassing validation without understanding it
- introducing parallel sources of truth
- patching symptoms only

---

# State & Calculation Rules

When calculations or derived values exist:

- never store stale derived values unnecessarily,
- derive values from authoritative state,
- ensure recalculation happens deterministically,
- avoid duplicated calculation paths,
- verify recalculation after edits/updates,
- validate create/edit/reopen/reload flows,
- ensure frontend/backend consistency,
- verify persisted values match displayed values.

Always inspect:
- stale memoization,
- async update timing,
- partial recalculation,
- duplicated derivation logic,
- cached outdated values,
- race conditions,
- ordering dependencies.

---

# Validation Rules

Always ensure:
- frontend validation matches backend validation,
- backend validation matches database constraints,
- optional vs required behavior is consistent,
- null/undefined/empty-string handling is standardized,
- validation logic is centralized where possible,
- invalid states cannot silently persist.

Never assume frontend validation is sufficient.

---

# API & Contract Stability

Preserve existing API contracts whenever possible.

Avoid:
- unnecessary request/response structure changes,
- breaking payload expectations,
- introducing incompatible response formats.

If changes are necessary:
- verify all consumers,
- maintain backward compatibility where possible,
- update serialization consistently,
- avoid partial migration states.

---

# Media & Asset Handling

When working with media/images/files:

Investigate:
- upload flow
- storage strategy
- URL generation
- environment-specific paths
- caching/CDN behavior
- fallback handling
- stale asset cleanup
- serialization consistency

Never hardcode asset prefixes or URL transformations in isolated components.

Centralize media URL resolution logic.

---

# Settings & Configuration Rules

For dynamic settings/configuration systems:

- establish a clear source of truth,
- avoid mixing hardcoded defaults with dynamic state,
- ensure settings load before dependent rendering,
- avoid hydration flickering/jitter,
- prevent stale cached config behavior,
- centralize configuration access patterns,
- validate configuration integrity.

---

# Inventory / Accounting / Financial Safety

For inventory, accounting, payment, return, refund, or exchange systems:

Always verify:
- stock reconciliation
- reservation consistency
- accounting observer/listener behavior
- transactional integrity
- rollback safety
- historical data linkage
- audit/log consistency
- payment synchronization
- refund correctness
- inventory movement correctness

Ensure:
- no partial persistence,
- no orphaned state,
- no duplicate accounting entries,
- no negative inventory inconsistencies,
- no desynchronized totals.

---

# UI/UX Expectations

UI changes must:
- remain responsive,
- avoid layout shifts,
- avoid hydration flicker,
- support loading states gracefully,
- preserve accessibility/readability,
- behave predictably across screen sizes,
- remain synchronized with persisted state.

Do not apply fragile CSS-only fixes without understanding rendering behavior.

---

# Performance Expectations

Always consider:
- duplicated API calls,
- unnecessary rerenders,
- stale caches,
- excessive recalculation,
- expensive dependency chains,
- hydration mismatches,
- inefficient loading order,
- avoidable remounting.

Optimize for:
- stable rendering,
- deterministic initialization,
- efficient state flow,
- minimal layout shifting.

---

# Refactoring Rules

Refactor when:
- logic is duplicated,
- state ownership is unclear,
- calculations are fragmented,
- validation is inconsistent,
- architecture creates instability.

But:
- avoid unnecessary rewrites,
- preserve compatibility,
- minimize regression risk,
- improve incrementally and safely.

---

# Edge Case Requirements

Always test:
- create flow
- edit/update flow
- repeated edits
- reload/refresh behavior
- partial/missing data
- null/empty states
- slow network behavior
- invalid payloads
- deleted/archived relationships
- responsive/mobile behavior
- concurrency scenarios
- rollback/failure handling

Never assume the happy path is sufficient.

---

# Required Final Output Behavior

For every completed task:

## Identify
- root cause(s),
- dependency issues,
- stale state issues,
- architectural weaknesses,
- validation inconsistencies,
- synchronization problems.

## Explain
- why the issue occurred,
- how the fix works,
- what systems were affected,
- what assumptions were corrected.

## Verify
- frontend/backend consistency,
- persistence correctness,
- transaction safety,
- rendering stability,
- calculation integrity,
- observer/event synchronization,
- backward compatibility.

---

# Golden Rule

Always prioritize:
1. correctness,
2. consistency,
3. maintainability,
4. architectural integrity,
5. backward compatibility,
6. deterministic behavior,
7. robust state synchronization.

Never optimize for the fastest patch.

Optimize for a reliable system that behaves correctly under real-world usage.