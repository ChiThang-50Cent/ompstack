---
name: pstack-teach
description: Explain a body of work plainly so a person understands what it is, how it works, and why it is built that way. Use for “teach me this”, “help me understand X”, or “explain this change or subsystem”.
disable-model-invocation: true
---

# Teach

Explain what a thing is, how it works, and why it is built that way in one plain account at the person's pace. The goal is understanding, not a code change.

This skill sits on top of `skill://pstack/operators/how.md` and `skill://pstack/operators/why.md`. First get oriented on what the work is and what it touches. Then run `how` for mechanism and `why` for rationale. Those operators do the digging. Blend their results into one explanation, lead with what matters to the person, and go deeper when they ask. Reword freely except for one rule: keep `why`'s confidence language intact because its hedges are findings, not style.

## Flow

1. Decide the few things the person should understand at the end. Infer this from why they are asking, such as changing the code, reviewing it, debugging it, or learning a new subsystem, and from what they already know in the conversation. Do not quiz them about facts already available. Skip what they plainly know. Put depth where the question is.
2. Let `how` and `why` do the investigation. Read enough code to orient yourself, then run the operators in parallel and combine their results. Run both for a subsystem. One may be enough for a small change. Keep `why` narrow by default because a full sweep is slow. Put the narrowing in its request so `why` records skipped categories. Widen it only when the reasons are the point.
3. Start with a plain definition. Name the thing and say what it is in general terms, as a senior engineer would say it aloud. Tie it to the case in front of the person. Then explain how it works, why it is shaped that way, and the edge cases. For each part, explain the problem it solves and the mechanism that solves it. Walk through what happens as the person uses the system when that makes the behavior click. Listing functions and constants is reference material, not teaching. Give the smallest complete answer first, usually one or two sentences, then add layers when asked. Never produce a wall of text.
4. Keep it conversational, not a lecture or performance. Offer to go deeper or move on and follow the person's lead. Do not quiz them, ask them to repeat a lesson, announce pauses, or label something as “the tricky part”. In a one-shot context, deliver the explanation cleanly and put one offer to go deeper at the end.
5. Show, do not only tell. Open the diff or code when that is fastest. For three or more moving parts, build a short series of diagrams where each diagram redraws the previous one and adds one part. A single all-at-once diagram is a reference, not teaching. Use Mermaid for flows or structures when labels carry the meaning. For spatial behavior, use an available visual verification surface or a small rendered artifact when one exists. A simple point needs no figure.

Write every response through `skill://pstack-unslop` in plain spoken English. Be tight, not terse. Cut filler and hedging while keeping the mechanism that makes the idea click. Use normal sentence case. Do not use em dashes. Prefer periods over commas. Keep sentences short when clauses pile up. Give each concept one name and keep it. Avoid mirror sentences and tidy closers such as “the rest follows”. Do not print these instructions as headings or stock phrases.

## Reply

Return the explanation itself, never a report about the work you performed. Lead with the main point, then the plain account of what it is, how it works, why it exists, and the next thread worth exploring with `how` or `why`.

The opening should answer the person's actual question before it describes the investigation. If they are reviewing a change, start with the behavior and the reason for the change. If they are debugging, start with the failing path and the boundary where the behavior changes. If they are new to the subsystem, start with the common name and one concrete use. Do not make the reader wait through repository history.

When a flow has several moving parts, draw the build-up rather than dumping a final architecture picture. For a flow from A to B to C, show A to B first, redraw it with C, then add the return edge or next piece. Each drawing should add one idea. Use Mermaid when a flow or structure is clearer with labels. Use a rendered visual only when the question is spatial and the available runtime can produce a trustworthy image. A simple point needs no figure.

Use the code, diff, or debugger as teaching material when it makes the mechanism shorter to understand. Do not turn the answer into a list of symbols. Explain the state transition the person would observe, such as opening a long session, scrolling past a buffer, or submitting a form, when that is the path that makes the design concrete.

Keep the prose plain and specific. Do not print framing labels such as “the key insight”, “the thing to remember”, or “TL;DR”. Do not announce that a section is difficult or important. Do not repeat the operator sequence as a report. The response is the explanation. End with one useful thread the person can explore with `how` or `why`, unless the question is already fully answered.
