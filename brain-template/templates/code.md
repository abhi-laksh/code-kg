---
id: ""
type: ""            # function | component | hook | service | module | api | schema | file
name: ""
status: ""          # planned | stable | deprecated
summary: ""
file: ""            # [[code:path/to/file.ts]]
signature: ""       # fnName(param: Type): ReturnType — mainly for functions/APIs
depends_on: []      # [[code:x]], [[app:x]]
used_by: []         # [[code:x]], [[feature:x]]
related_test: ""    # [[test:id]]
related_task: ""    # [[task:id]]
keywords: []
updated: ""
tags: []
---

## Purpose

> Why this exists. What problem it solves in the system.

Feature context: [[feature:]] | Task: [[task:]]

---

## Signature / Interface

```
// paste signature, props type, or schema here
```

File: [[code:]]

---

## Behavior

> How it works. Key logic, state, side effects, mutations.

---

## Edge Cases & Constraints

| Case | Behavior |
|------|----------|
| | |

---

## Usage

```ts
// minimal usage example
```

Called by: [[code:]] | [[feature:]]

---

## Dependencies

| Dep | Why |
|-----|-----|
| [[code:]] | |
| [[app:]] | |

---

## Notes

> Gotchas, non-obvious invariants, workarounds, known debt.
