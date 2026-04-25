---
id: ""
type: "test"
name: ""
status: ""          # draft | ready | passing | failing | skipped
test_type: ""       # unit | integration | e2e | manual
summary: ""
tests: ""           # [[code:x]] or [[task:id]] — what this verifies
code_path: ""       # path to test file in codebase
preconditions: []
expected_result: ""
related_task: ""    # [[task:id]]
keywords: []
updated: ""
tags: []
---

## Purpose

> What behavior or contract this test guards. Why it matters.

Verifies: [[code:]] | [[feature:]] | [[task:]]

---

## Preconditions

> State, fixtures, mocks, or env required before test runs.

- 

---

## Steps

1. 
2. 

---

## Expected Result

> Exact outcome — return value, UI state, DB row, event emitted.

---

## Edge Cases Covered

| Case | Expected |
|------|----------|
| | |

---

## Test File

[[code:]] — `describe / it` path:

```
describe("") > it("")
```

---

## Notes

> Flakiness history, known limitations, env-specific behavior.
