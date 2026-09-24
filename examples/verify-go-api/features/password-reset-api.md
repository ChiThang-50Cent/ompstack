---
feature: Password reset API
slug: password-reset-api
surface: api
reach:
  - Start the disposable API
  - POST a valid reset request
handles:
  - "POST /v1/password/reset"
  - "GET /healthz"
states:
  - "The first reset request returns the documented success response"
  - "The second request with the same token returns the documented invalid-token response"
last_verified: 2026-09-24
---

# Password reset API

A client can reset a password through the HTTP API, and the service rejects reuse of the same reset token.

The verification run creates a disposable fixture, records both response bodies and status codes, and reads the resulting account state through the safe test surface. It does not treat a successful HTTP response alone as proof of persistence or invalidation.
