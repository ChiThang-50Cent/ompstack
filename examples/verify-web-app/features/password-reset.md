---
feature: Password reset
slug: password-reset
surface: ui
reach:
  - Open the disposable reset page
  - Submit a valid reset link
handles:
  - "[data-testid=reset-form]"
  - "[data-testid=reset-success]"
states:
  - "Reset form accepts the valid token"
  - "Reusing the token shows the documented invalid-token state"
last_verified: 2026-09-24
---

# Password reset

A user can reset a password through the browser and receives a clear result when the same link is used twice.

The verification run seeds a disposable account and token, submits the real form, captures the success state, then submits the same token again. The second attempt must show the documented invalid-token state and must not create a second authenticated session.
