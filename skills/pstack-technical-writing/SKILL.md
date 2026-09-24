---
name: pstack-technical-writing
description: Apply a layered technical-writing standard for documentation, RFCs, READMEs, PR descriptions, and commit messages.
disable-model-invocation: true
---

# Technical writing

Write what a tired engineer understands on the first read. Four layers get you there. Ask what kind of document this is, how sentences address the reader, how much each sentence carries, and whether any sentence can be read two ways. Apply all four.

Three rules sit above the layers:

- **Cut every word that does no work.** If the sentence survives without a word, remove the word. “In order to” is “to”. “It is important to note that” is nothing.
- **Use the short, everyday word.** Use “use”, not “utilize”. Use “help”, not “facilitate”. Use “do”, not “perform”. A long word must buy its length with precision.
- **When a rule makes a sentence worse, fix the sentence another way or leave it alone.** The rules serve the reader. A sentence that follows every rule and sounds machine-written has failed.

The codebase is the word list. Write the real symbol, file, flag, or command name, not a synonym or a description.

Do not invent jargon. Use the words a developer would say aloud: “move”, “delete”, and “a budget that only decreases”, not “evacuate”, “ratchet”, or “endgame”. A named pattern is fine when the document says what it means the first time. If you propose a new offender and its replacement, add it to the `unslop` abstract-metaphor rule in the reply with the diff. Do not edit that skill while writing.

## Vary the rhythm

The layers decide what a document says and how much each sentence carries. A document can obey all of them and still read as machine-written. Every sentence can be clipped short, with no point of view and no specific detail.

- Mix sentence lengths on purpose. Short sentences land a point. Longer sentences that carry one fact with its condition or consequence can take their time.
- One thought per sentence does not mean one length per sentence. Split a sentence that carries two thoughts. Keep a long sentence that carries one.
- Have a view where the mode allows it. Explanation weighs trade-offs, so say what you make of them instead of listing pros and cons. Reference stays dry.
- Prefer specific language over sterile language. Write “a column rename fails the build”, not “schema changes can cause issues”.

## Pick the mode first (Diátaxis)

Use one mode per document. Two questions pick it. Does the content inform action or understanding? Does it serve learning or work?

- Action plus learning: **tutorial**.
- Action plus work: **how-to**.
- Understanding plus work: **reference**.
- Understanding plus learning: **explanation**.

Use the compass for a whole document or one sentence.

**Tutorial: learning by doing.** You are the teacher. The learner's success is your job. Open by saying what the learner will build, not what the learner will “learn”. Make every step produce a visible result early. Tell the learner what to see. Cut explanation to one clause and a link. Teaching pauses break the lesson. Stay concrete. Write as “we” and use commands: “First, do x. Now, do y.”

**How-to: steps to a goal.** Solve a problem a person has, not an operation the machine can perform. Assume competence. Skip teaching. Use action only. Avoid digressions and background. Link those instead. Allow forks and judgment: “If you want x, do y.” Name the guide by the task: “How to calibrate the radar array”, not “Radar array calibration”.

**Reference: facts for lookup.** Describe. Only describe. Do not instruct, persuade, or state an opinion. Be dry, complete, and sure. State facts, options, limits, and errors without hedging. Mirror the structure of the thing described so the code and documentation can be navigated together. Put material where readers expect it. Generate from code where possible so it stays true.

**Explanation: understanding and why.** Cover one bounded topic in a form readable away from the product. Each title should tolerate an implicit “About...” before it. Anchor on a real why question. Give context, design decisions, history, constraints, and alternatives. Opinion is allowed here and nowhere else.

Do not mix modes. Do not put reference tables inside a tutorial, tutorial hand-holding inside reference, or argument inside a how-to. Split and link instead.

Source: diataxis.fr, fetched 2026-07-18.

## Write sentences to the reader (Google developer style)

- Talk to the reader as “you”, in the present tense. Use “will” only for something that genuinely happens later.
- Say who does what: “the compiler checks”, not “is checked”. Passive is fine when the actor is unknown or beside the point.
- Write instructions as commands: “Click Submit.” State facts plainly. Never write “should be done”.
- Put the condition before the instruction: “To delete the document, click Delete.” Put the common case first and exceptions after it.
- Sound like a knowledgeable friend. Avoid buzzwords, figurative language, “please”, “simply”, “easy”, and “quickly” in a procedure. If it were simple, the reader would not be here.
- Do not pre-announce future support. Do not start consecutive sentences with the same phrase.
- Link with words that say where the link goes. Use the page title or a short description. Never write “click here”. Prefer context on the page over a link off it.
- Headings carry the point, not just the topic. Use sentence case. Use one h1 per page with no skipped levels. A task heading is a bare verb phrase. A concept heading is a noun phrase.
- Use numbered lists for sequences and bullets for everything else. Introduce a list with a complete sentence. Keep items parallel.
- Put code in code font and UI elements in bold. Use serial commas. Drop “etc.” and say up front when a list is partial.

Source: developers.google.com/style, fetched 2026-07-18.

## Make statements load one at a time (STE rules)

- Put one instruction in each sentence. Put one thought in each sentence everywhere else.
- Split instructions longer than about 20 words and other sentences longer than about 25 words.
- Put a warning or condition before the step it guards: “If hot oil touches your skin, injuries can occur.”
- Keep “the” and “a”. “Remove backup file” reads two ways. “Remove the backup file” reads one.
- Give each word one meaning and one job, then keep it. If “check” means inspect, do not also use it for restrain.
- Pick one word per action and keep it. Use “start”, not “start” here and “initiate” there.
- Write procedures as direct commands, never as narration or passive voice: “Install the component”, not “the component must be installed”.
- Avoid “-ing” words where possible. They take too many grammatical jobs and breed misreadings.

Source: asd-ste100.org, Issue 9, 2025. The numbered rules and dictionary live in the source specification. These principles are the transferable core.

## Leave no sentence open to two readings (Global English)

- Keep words such as “only” and “not” next to the word they change. “Only fails on growth” and “fails only on growth” say different things.
- Break up long noun strings. “The proto import budget check script parameters” becomes “the parameters for the script that checks the proto-import budget”.
- Make every “it”, “they”, and “this” point at one obvious thing. Repeat the noun when in doubt. Never use “this” or “which” to point at a whole clause.
- Do not drop verbs. “Phase 1 moves the converters and Phase 2 the runtime” leaves Phase 2 without a verb. Give it one.
- Keep the small words that show structure. “Ensure that the switch is off” keeps “that” because it makes the sentence parse one way. Never trade clarity for word count.
- Repeat the article in a series when it prevents a misread: “the client and the host”, not “the client and host”, when they are two things.
- Say which parts “and” or “or” joins when a sentence can group two ways. “Both...and”, “either...or”, and “if...then” are free disambiguators.
- Use periods, not semicolons. Replace an em dash with a new sentence.
- Make text in parentheses a full grammatical unit or give it its own sentence. Never form plurals with “(s)”.
- Do not use slashes. Write “a, b, or both” instead of “a/b” or “and/or”.
- Call each thing by one name everywhere. A document that says “the gate”, “the ratchet”, and “the budget check” for one thing teaches three things. Rewording an unchanged sentence costs the same as writing a new one.
- Skip idioms, colloquialisms, Latin abbreviations, and metaphors. Plain constructions are easier for non-native readers, translators, and agents to parse.

Source: Kohl, The Global English Style Guide. The guideline text was fetched from the Internet Archive and the SAS sample chapter in 2026-07-18.

## Voice and repository specifics

- Apply `skill://pstack-unslop` to every document this skill touches. That skill owns the slop-pattern catalog for AI vocabulary, filler, hedging, and formatting tells.
- PR descriptions and commit messages are writing too. Every layer except Diátaxis applies to them. A PR body is a briefing that a reviewer can read in under a minute. Do not paste swarm logs, SHA lists, or metric tables. Link them.
- Product UI strings are not documentation. Use the product's copy guidelines for UI strings.
- Indent code snippets with tabs. Write real paths and real symbols. Make every count or tree claim true at the commit that lands it, and include the command that regenerates it.

## Worked example

Before:

> Configuration of the proto import ratchet budget script parameters is performed via budget.json. Note that it's important to remember that running with --write, which updates the committed budget to reflect the current count, should only be done when lowering it. If exceeded, CI fails.

After:

> `budget.mjs` reads the committed budget from `budget.json` and counts the files that import protos. If the count exceeds the budget, CI fails. Run `budget.mjs --write` only to lower it.
