---
title: Audit hygiene — verify before you flag
last_verified_against_main: 2026-04-25
---

# Audit hygiene

> When you audit the codebase (performance, security, a11y, UX, architecture), every finding you produce is a claim about what the code does **right now**. If three out of sixteen findings are wrong, the consumer of the audit (a human or a delegated agent) silently loses trust in all sixteen.
>
> This doc exists because the 2026-04-25 mobile audit produced **3 false positives out of 16 findings** (`autoComplete` already present, `saveData` guard already in place, modal `min-h-11` already correct). The fixes were no-ops; the issues had to be closed unimplemented; downstream agents who tried to "fix" them would have churned the diff for nothing.

## Why audits drift

A finding becomes a false positive when one of these happens:

1. **The auditor relied on memory or a snapshot, not the live code.** Search results from earlier in the session, an LLM's training data, or a stale checkout don't reflect the current `main`.
2. **The auditor read a representative file but generalized.** Seeing `<button class="p-1">` once is not evidence that *all* buttons are p-1.
3. **The finding was copied from a checklist.** "Apps usually lack X" became "this app lacks X" without verifying.
4. **The auditor stopped at the symptom.** Finding `<img>` is not the same as finding `<img>` *without* `loading="lazy"` — read the full attribute list.

## Rules for producing audit findings

### 1. Cite a current line range, not a vague claim

Bad: *"Forms in `src/components/auth/` lack `autoComplete`."*
Good: *"`src/components/auth/LoginForm.tsx:244` has `autoComplete="email"` ✅. `src/components/auth/RegisterForm.tsx:60` does not — should add `autoComplete="email"`."*

If you can't cite the file:line, you haven't verified.

### 2. Run the verification command and paste the result

For each claim about absence (the most common false-positive shape), include the grep:

```bash
$ grep -rn "autoComplete" src/components/auth/ src/app/(auth)/
src/components/auth/LoginForm.tsx:244:            autoComplete="email"
src/components/auth/LoginForm.tsx:253:            autoComplete="current-password"
…
```

If the grep returns hits, the absence claim is dead — pivot to a real finding (e.g., "present but uses `autocomplete` lowercase, which iOS still accepts but is non-canonical") or drop it.

### 3. Reproduce, don't extrapolate

If the claim is "X is broken on slow networks", the audit must include either:
- A repro: throttle, navigate, screenshot/log of the broken state.
- Or a code-path argument: "this fetch has no timeout, so on a 30s stall the user sees no feedback because the loading state is gated on response, not on `pending`."

A bare "this is probably slow on 3G" is not a finding — it's a hypothesis.

### 4. Distinguish "missing" from "present-but-suboptimal"

These are different findings with different fixes:

| Shape | Example claim | Fix |
|-------|--------------|-----|
| **Missing** | `display: 'swap'` not set on Geist | Add the prop |
| **Present-but-suboptimal** | `display: 'swap'` set, but font has 4 unused subsets inflating preload | Trim subsets |
| **Present-and-correct** | (no finding — drop it) | — |

When in doubt, default to dropping the finding.

### 5. Re-verify before publishing

The last step before writing the report: re-grep your top findings against current `main`. The auditor often spent 30+ minutes exploring; in that window, another agent may have shipped a fix. Worse, the auditor may have read a file from an outdated worktree.

```bash
# fast pre-publish sanity check
git fetch origin main && git log origin/main --oneline -10
# does any recent commit touch the area you're flagging?
```

## Rules for consuming audit findings

When you take a finding and start implementing:

### 1. Re-verify the file:line before editing

The audit is a snapshot; the code is live. Run `Read` on the cited file:line and confirm the finding still applies. **This is a 10-second check that prevents shipping a no-op PR.**

If the cited code already does the right thing:
- Close the issue with a `re-audit` comment showing the current state (see #782 / #785 for examples).
- Don't open the PR. Don't "improve while you're there".

### 2. Look for nearby work that supersedes the finding

The audit is dated. Check `git log --since=<audit-date> -- <file>` for the cited path. A recent commit with a relevant title means someone already did the work, possibly while the audit was being written.

### 3. If the finding partially applies, narrow it

Audit said: "Tap targets <44px in modal close + IosInstallHint dismiss"
Reality: modal close already 44px, only IosInstallHint needs the fix.
Action: scope the PR to IosInstallHint, note the modal status in the PR description.

Don't ship a no-op change to "match the issue scope". The issue is wrong; the code is right.

## Patterns that drift fastest

These areas churn enough that audits older than ~2 weeks are likely stale:

- **Tailwind utility usage** (size classes, focus rings, `motion-safe:` variants) — refactored as design tokens evolve
- **`autoComplete` / `inputMode` / form attributes** — added incrementally as a11y reviews land
- **Service worker logic** — hardened over time
- **Loading states (`loading.tsx`)** — added route-by-route
- **`useOptimistic` adoption** — propagating since React 19
- **Next.js config flags** (image formats, headers, experimental opts)

If your audit touches any of these, **bias toward verifying every claim**, not just the surprising ones.

## Anti-patterns

❌ "Apps like this often lack X" — not a finding, a guess
❌ "I didn't see X in the files I read" — read more files or use grep
❌ "Based on the file structure, X is probably missing" — open the file
❌ Listing "missing" things you didn't search for
❌ Importing findings from a generic checklist (Lighthouse, OWASP) without verifying each one against the repo

## Template for a verified finding

```markdown
### {short title}

**File:line:** `path/to/file.ts:42-58`
**Verification command:**
```bash
$ grep -n "thing" path/to/file.ts
42:    const thing = …
```
**Current behavior:** {what the code does today, quoted directly}
**Problem:** {why this is suboptimal — be specific about user-visible impact}
**Proposed fix:** {minimal patch}
**Confidence:** high / medium / low
```

If you can't fill `Verification command` or `Current behavior`, the finding isn't ready to publish.

## Lessons from past audits

| Date | Audit | False positives | Root cause |
|------|-------|-----------------|------------|
| 2026-04-25 | Mobile resilience & performance (#779) | 3 of 16 (`autoComplete`, `saveData` guard, modal tap target) | Auditor extrapolated from spot checks instead of grepping; relied on a "common gaps" mental model. |

When you ship an audit, append a row here once any false positives surface. The pattern is the lesson.
