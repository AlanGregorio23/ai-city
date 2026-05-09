# Architecture

## Guiding Rule

The simulation owns truth. AI can suggest, explain, summarize, or roleplay, but
all state changes must pass through deterministic simulation rules.

## Layers

```txt
UI layer
  React screens and controls

Application layer
  Screen state, selected citizen, commands

Simulation layer
  City state, citizens, jobs, tasks, economy, events

AI layer
  Provider interface, Ollama adapter, prompts, JSON proposals

Persistence layer
  Future SQLite schema, migrations, saved cities
```

## Module Boundaries

- `src/sim` must not import React.
- `src/sim` must not call AI providers directly.
- `src/ai` must not mutate city state.
- UI sends commands to the simulation engine.
- AI returns proposals that the simulation validates.

## Suggested Data Flow

```txt
User action
  -> UI command
  -> simulation engine
  -> new city state
  -> UI render
  -> optional AI summary/proposal
  -> validated simulation command
```

## Why This Shape

This keeps the project debuggable. If the economy breaks, the cause is in the
simulation rules, not hidden in an AI answer. If AI is offline, the city still
runs.

## Future Backend Split

The MVP can run mostly in the browser. When persistence and heavier AI flows are
needed, add a backend:

- `apps/web`: React app
- `apps/server`: Fastify API
- `packages/sim`: shared simulation engine
- `packages/ai`: shared provider interfaces

That monorepo split should wait until there is enough real complexity.
