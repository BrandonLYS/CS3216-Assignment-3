# M17 - AI UI Variants

## Goal

Show two UI variants for the proposal/evidence card, selectable by `?uiVariant=a` or `?uiVariant=b`.

## Variants to try

- Variant A: current card with source chip and one-click Accept/Reject buttons.
- Variant B: expanded card with inline excerpt preview and accept/edit/reject actions.

## Implementation pointer

Read `uiVariant` from `useSearchParams()` in `src/widgets/attention/proposal-cards.tsx` or `src/entities/evidence/evidence-chip.tsx` and conditionally render.

## Evidence

TODO: add screenshots of both variants side by side.
