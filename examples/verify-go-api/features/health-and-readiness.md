---
feature: Health and readiness
slug: health-and-readiness
surface: api
reach:
  - Start the disposable API
  - Request the readiness endpoint
handles:
  - "GET /healthz"
  - "GET /version"
states:
  - "The readiness endpoint returns a healthy response"
  - "The version response identifies the expected build"
last_verified: 2026-09-24
---

# Health and readiness

An operator can distinguish a ready disposable API from a process that has started but cannot serve requests.

The verification run waits on the documented readiness endpoint, checks the service version, and stores the response headers and bodies. A timeout preserves startup logs and reports the feature as unavailable rather than passing a later request through a different surface.
