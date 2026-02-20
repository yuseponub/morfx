# Standalone Phase: Action Fields Complete Audit & Fix

## Goal
Every automation action exposes ALL fields that the domain/executor can handle.
Users can map any field via a dropdown "add field" UX pattern.
Fields left unmapped stay null. No hidden fields, no gaps.

## Scope
- All 12 action types in the automation system
- 4 layers per action: Domain → Executor → Wizard UI → AI Builder
- UX: dropdown-based field selection for actions with optional fields

## Success Criteria
- Every field the domain accepts is reachable from the automation UI
- AI builder knows about every mappable field
- Variable support ({{contacto.nombre}}) on all text fields
- No broken toggles (like copyProducts was)
