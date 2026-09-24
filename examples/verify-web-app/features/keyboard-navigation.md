---
feature: Keyboard navigation
slug: keyboard-navigation
surface: ui
reach:
  - Open the primary form
  - Navigate controls with the keyboard
handles:
  - "[data-testid=primary-form]"
  - "button[type=submit]"
states:
  - "Focus moves through the form in the documented order"
  - "Submitting with Enter exposes the same result as clicking submit"
last_verified: 2026-09-24
---

# Keyboard navigation

A user can complete the primary form without a pointer and sees the same validation and success states as a pointer-driven user.

The verification run starts from a clean page, records the accessibility snapshot, tabs through each control, submits with Enter, and captures the resulting state. It reports focus traps, missing names, and pointer-only controls as failures.
