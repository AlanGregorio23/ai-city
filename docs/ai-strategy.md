# Local AI Strategy

## First Provider

Use Ollama first because it is local, free to run after install, and easy to
replace behind a provider interface.

Recommended starting model:

- `qwen3:4b` for lighter machines
- `qwen3:8b` for better reasoning if hardware allows

## AI Responsibilities

Good first AI tasks:

- Explain why a citizen chose an action.
- Summarize the last few city events.
- Propose one possible task for a selected citizen.
- Generate small dialogue lines.
- Create scenario events such as shortages, rumors, or job offers.

Avoid in MVP:

- Continuous agent loops for every citizen.
- AI-generated economy balances.
- Direct state mutation.
- Long-term hidden memory without inspection tools.

## Proposal Contract

AI should return small JSON proposals:

```json
{
  "citizenId": "citizen_001",
  "action": "work",
  "targetId": "bakery",
  "reason": "low money and high ambition"
}
```

The simulation validates whether this action is allowed.

Validation now includes socio-economic and conflict context. High-risk actions
such as `sabotage_rival`, `abstract_violent_bounty`, and
`abstract_eliminate_citizen` are game-only proposals: the AI may name the
abstract action and expected simulation consequences, including temporary
incapacitation, but it must not provide real-world methods, targeting advice, or
operational detail.

`abstract_eliminate_citizen` must be treated as an extreme crisis action rather
than a profitable optimization. The simulation blocks it unless the actor and
city are already in severe conditions, then applies detention, money loss,
reputation collapse, long target downtime, citywide hostility, and stability
damage.

Civic actions such as `report_crime`, `police_patrol`, `arrest_citizen`, and
`hospital_treatment` should stay institutional and high-level: case load,
trust, detention, sentence review, jail time, public health, and recovery are
valid simulation consequences, while operational policing or medical procedural
detail is out of scope.

## Personality Prompt Inputs

Each AI call should get compact citizen context:

- current needs
- role
- reputation
- personality sliders
- recent events
- available actions

Do not pass the entire city state unless needed.

## Safety And Control

"Bad" or ruthless citizens can exist as simulation roles, but their behavior
should be game-like and rule-bound. They can exploit market opportunities, lie in
dialogue, pressure rivals, or trigger abstract conflict outcomes, but harmful
real-world instructions are not part of the project.
