---
name: sonamu-framework-change
description: Criteria for deciding between modifying Sonamu framework source vs. applying project-level workarounds. Includes the @upload parameter pattern. Use when a Sonamu bug or limitation is discovered during project development.
---

# Sonamu Framework Change Decision

Criteria for deciding whether to directly modify the framework or apply a project-level workaround when a framework bug or limitation is discovered.

---

## Decision rubric

Evaluate along the following 4 axes:

| Axis                   | Project workaround                                                 | Framework fix                                       |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| **Reproduction scope** | Only occurs in specific usage patterns                             | Occurs regardless of usage pattern                  |
| **Workaround cost**    | Resolved by modifying one place in the project                     | Workaround must be propagated to all projects       |
| **Impact scope**       | Uncertain ripple effects on other projects if framework is changed | Change scope is isolated and side effects are clear |
| **Ownership**          | The code has a known author and discussion is needed               | Bug is clear and a review path is available         |

**Criteria for choosing project workaround**: If 2 or more of the 4 axes lean toward "project workaround", apply the workaround first.

**Criteria for choosing framework fix**: If the reproduction scope is "any usage pattern" and the workaround cost is high, consider a fix.

---

## When the decision is unclear → Ask the user

Do not decide alone if any of the following apply:

- Reproduction scope is difficult to confirm (unknown usage patterns in other projects)
- The framework owner (e.g. CTO) is clearly identified and recently wrote the code
- The workaround might compromise API semantics

```
"This appears to be a framework bug. A project-level workaround is possible,
but a framework fix may be more appropriate. How would you like to proceed?"
```

---

## Documentation obligation when applying a workaround

If a workaround is chosen, record it in the following two places:

1. **`knownIssues` in the spec**: bug cause, workaround approach, call pattern, root cause file path
2. **memory**: if the workaround may be reverted by repeated operations like sync, record a caution note

---

## Concrete pattern: `@upload` multiple parameters

### Problem

When an `@upload` method has multiple primitive parameters, a `split(':')` bug in `services.template.ts` causes `useUploadMutation` to be generated incorrectly.

```typescript
// WRONG — codegen breaks with this pattern
async upload(entity_type: string, entity_id: number, file_type: string)
```

Generated result:

```typescript
// mutationFn only passes params.params and params.files (entity_id and file_type are missing)
mutationFn: (params: { params: string; ... }) => upload(params.params, params.files)
```

### Fix: wrap in a single object

```typescript
// CORRECT — single object parameter
async upload(params: { entity_type: string; entity_id: number; file_type: string })
```

The Sonamu backend automatically deserializes nested formData in the form `params[entity_type]` using `qs`, so this has no effect on runtime behavior.

Call-site pattern:

```typescript
uploadMutation.mutate({
  params: { entity_type, entity_id, file_type },
  files,
});
```

**Rule**: If an `@upload` method requires 2 or more parameters, always wrap them in a single object.

---

## Reference

- Bug source: `modules/sonamu/src/template/implementations/services.template.ts`
- Related skills: `api.md`, `skill-contribution.md`
