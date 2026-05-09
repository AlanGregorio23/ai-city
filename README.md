# AI City

AI City is a small city simulation project with citizens, jobs, resources, trade,
daily tasks, and optional local AI behavior.

The first goal is not a huge game. The first goal is a clean MVP where the city
works without AI, then local AI can make citizens feel more alive through
intentions, narration, and personality-driven choices.

## MVP Scope

- A compact city with a few districts and workplaces.
- Citizens with needs, money, reputation, traits, and personality sliders.
- Manual, validated citizen choices for work, rest, food, social actions,
  relocation, study, mediation, faction work, sabotage, and abstract
  elimination.
- A deterministic simulation engine that advances time in ticks.
- Automatic simulation time with 6x and 10x controls, plus an optional one-hour
  step button.
- Civic services for hospital, police, and prison, including public safety,
  public health, case load, detention, sentence review, jail time, and recovery.
- A local AI adapter for Ollama, isolated from the simulation rules.
- A dashboard UI with moving citizen markers, economy summary, citizen
  inspector, and event log.
- Project docs that explain product direction, architecture, roadmap, and AI rules.

## Recommended Stack

- Frontend: React, Vite, TypeScript
- UI state for MVP: local React state
- Styling: CSS tokens and component-level classes
- Simulation: deterministic TypeScript domain modules
- Local AI: Ollama HTTP API on `http://localhost:11434`
- Future persistence: SQLite with Drizzle ORM

## Folder Structure

```txt
docs/
  architecture.md       Technical structure and module boundaries
  ai-strategy.md        Local AI strategy, prompts, safety rules
  design-brief.md       Interface direction and Figma notes
  product.md            MVP product analysis
  roadmap.md            Incremental build plan
  decisions/            Architecture decision records
public/
  city-map-modern.png   Current modern raster map asset
src/
  ai/                   AI provider abstraction and Ollama adapter
  app/                  Application shell and screen composition
  components/           Reusable UI components
  db/                   Future persistence layer
  features/             Feature-oriented modules
  lib/                  Small shared utilities
  sim/                  Deterministic simulation domain
  styles/               Design tokens
```

## Design Assets

- Figma file: https://www.figma.com/design/QFOG1r2z3lu6IOYNT0zwtZ
- Figma overview: https://www.figma.com/design/QFOG1r2z3lu6IOYNT0zwtZ?node-id=9-2
- Figma map workspace: https://www.figma.com/design/QFOG1r2z3lu6IOYNT0zwtZ?node-id=8-2
- Figma citizens: https://www.figma.com/design/QFOG1r2z3lu6IOYNT0zwtZ?node-id=10-2
- Figma events: https://www.figma.com/design/QFOG1r2z3lu6IOYNT0zwtZ?node-id=11-2
- Modern map image: `public/city-map-modern.png`
- Screen spec: `docs/design/screen-spec.md`

## App Views

- Full-screen map: `http://localhost:5173/`
- Overview: open from the in-app drawer or `http://localhost:5173/?page=overview`
- Map workspace: `http://localhost:5173/?page=map`
- Citizens: `http://localhost:5173/?page=citizens`
- Events: `http://localhost:5173/?page=events`

## Getting Started

```bash
npm install
npm run dev
```

Optional local AI:

```bash
ollama pull qwen3:8b
ollama serve
```

The app should still run if Ollama is not available. AI is an enhancement, not a
hard dependency for the simulation.

## Design Principle

The simulation owns truth. AI can propose actions, describe motives, or write
small narrative summaries, but it cannot directly mutate the city. Every AI
proposal must be validated by deterministic rules first.

Violence is intentionally abstract. The explicit elimination action is a severe
crisis-only simulation consequence, not an efficient strategy: the actor loses
money, reputation, and active time, while the target becomes incapacitated for a
long deterministic downtime window. No real-world method is modeled or described.
Police, hospital, and prison flows are also rule-bound civic simulations:
reports create cases, officers can process arrests, review can lead to jail, and
medics can reduce recovery time or hospitalize severe cases.

## Customization Direction

Citizens are designed around personality parameters:

- morality
- empathy
- ambition
- risk tolerance
- reputation
- traits

This means a citizen can slowly become generous, selfish, disciplined, chaotic,
or even ruthless based on events and player/system choices. The MVP keeps this
simple with sliders and traits, then later versions can add memory, factions,
relationships, and long-term arcs.
