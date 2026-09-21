# Review log

## Plan review

A separate reviewer challenged the plan against issue #73 and the existing integration.
Round 1 required gating all automatic events while auth is unresolved, resetting expired identity, defining session transport lifecycle, isolating synchronous failures and testing credential navigation after initialization.
Round 2 found that a correlation cookie could expire before the first mutation after inactivity.
The plan now uses activity-aware SDK session refresh immediately before same-origin mutation fetches, eliminating the custom cookie.
Round 3 verdict: plan converged with no remaining blockers.
The reviewer emphasized preserving Request bodies/options and never retrying a dispatched mutation.

## Implementation review

Fixed point: `a0cb75506c74d807e28e09d42759855056c28f01`.
The code-review skill ran separate Standards and Spec agents against the implementation.

### Standards

No actionable findings: 0 documented breaches and 0 actionable smells.
The reviewer checked session-derived identity, unchanged domain mutation/authorization boundaries, Participant precedence, credential suppression, request integrity and analytics failure isolation.

### Spec

One P2 finding: returning sign-in and client navigation assertions could match earlier events.
The tests now use transition-specific event indices and assert the fresh events' identity, session and anonymous identify link.
The reviewer also recorded production Live Events as pending access, consistently with the issue's explicit missing-access caveat.

Spec re-review found one residual batching loophole: the initial Project pageview could arrive after the reload marker.
The test now receives that initial pageview before recording the marker.
Final implementation review verdict: Standards 0 actionable findings; Spec 0 actionable findings.
Production Live Events remains an explicitly documented access limitation.
