# Review log

## Plan review

A separate reviewer challenged the plan against issue #73 and the existing integration.
Round 1 required gating all automatic events while auth is unresolved, resetting expired identity, defining session transport lifecycle, isolating synchronous failures and testing credential navigation after initialization.
Round 2 found that a correlation cookie could expire before the first mutation after inactivity.
The plan now uses activity-aware SDK session refresh immediately before same-origin mutation fetches, eliminating the custom cookie.
Round 3 verdict: plan converged with no remaining blockers.
The reviewer emphasized preserving Request bodies/options and never retrying a dispatched mutation.
