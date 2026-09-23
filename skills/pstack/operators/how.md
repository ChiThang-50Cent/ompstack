# Operator: How the system works

Use this before a nontrivial change or whenever the current behavior is uncertain.

## Contract

Return a compact mental model another agent can act on without rereading the entire repository:
- entry points and triggering inputs;
- core data shapes and owners;
- boundary crossings and validation;
- control/data flow through consumers and side effects;
- configuration and environment dependencies;
- tests and runtime evidence;
- blast radius;
- facts, inferences, unknowns, and confidence.

## Execution

Partition scouts by subsystem or evidence source, not by vague persona. Start from the user/caller surface and trace both producer and consumer paths. For new events, values, commands, or variants, inspect the receiving switch/router/registry outside the local diff. Reconcile contradictions against primary evidence. Do not turn an investigation into an implementation without an explicit playbook transition.
