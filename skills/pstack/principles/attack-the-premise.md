---
name: pstack-principle-attack-the-premise
description: Attack the Premise. Use after multiple fixes fail around the same assumption.
---
# Attack the Premise

**Trigger:** Use after multiple fixes fail around the same assumption.

Inventory every actor that holds, produces, transforms, or consumes the disputed state. Ask which premise all failed patches shared. Test that premise directly before another code change. Repeated local symptoms usually indicate a wrong ownership or lifecycle model.

## Application record

When this principle materially changes a decision, record the concrete choice and evidence in `pstack_decision`. Do not cite a principle as decoration; state what alternative it ruled out or what structure it introduced.
