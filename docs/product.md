# Product Analysis

## Concept

AI City is a small simulation where citizens live, work, trade, react to events,
and develop personalities over time. The player does not need to micromanage
every action. The city should feel alive through visible consequences, event
logs, and AI-assisted motives.

## MVP Promise

"Watch a small city run by simple rules, inspect citizens, customize their
personalities, and see how their choices affect the local economy."

## First User Experience

1. Open the dashboard.
2. See a compact map with houses, jobs, and market activity.
3. Advance the simulation by one hour.
4. Read what happened in the event log.
5. Select a citizen.
6. Adjust personality sliders such as morality, empathy, ambition, and risk.
7. Advance time again and see different behavior emerge.

## Core Systems

- Citizens: needs, money, mood, role, reputation, traits.
- Jobs: workplace, wage, required energy, produced resource.
- Economy: food, materials, credits, market pressure.
- Tasks: work, rest, buy food, help someone, exploit an opportunity.
- Personality: affects action choice and social consequences.
- AI: proposes motives, summaries, dialogue, or rare special actions.

## Non-Goals For MVP

- No massive open world.
- No multiplayer.
- No real training/fine-tuning.
- No complex 3D city builder.
- No always-on AI per citizen.

## Customization Model

Citizen behavior should be editable without touching code. The first version
uses simple numeric ranges:

- morality: 0 = ruthless, 100 = principled
- empathy: 0 = cold, 100 = caring
- ambition: 0 = passive, 100 = driven
- risk: 0 = cautious, 100 = reckless

Later, these can become presets, faction rules, memory patterns, or AI persona
cards.
