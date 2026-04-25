---
id: ""
type: ""            # task | subtask | migration | refactor
name: ""
status: ""          # planned | in-progress | done | blocked | cancelled
priority: ""        # p0 | p1 | p2 | p3
summary: ""
parent: ""          # [[feature:x]] or [[task:id]]
subtask_of: ""      # [[task:id]] — fill if this is a child task
sub_tasks: []       # [[task:id]]
assigned_to: ""
implements: []      # [[code:file.ts]], [[code:fn()]]
blocked_by: []      # [[task:id]]
related_test: []    # [[test:id]]
keywords: []
updated: ""
tags: []
---

## What

> Precise description of what needs to be done and why it belongs here.

Parent: [[feature:]] | [[task:]]

---

## Implementation Plan

> Step-by-step approach. Reference exact functions/files to touch.

1. 
2. 

---

## Files to Change

| Action | File | What changes |
|--------|------|--------------|
| modify | `[[code:]]` | |
| add | `[[code:]]` | |

---

## Implementation Order

1. 
2. 

---

## Verification Checklist

- [ ] 
- [ ] Tests: [[test:]]
- [ ] No regressions in [[feature:]]

---

## Blockers

- [[task:]] — waiting on

---

## Notes

> Edge cases, constraints, gotchas discovered during implementation.
