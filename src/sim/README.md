# Simulation Layer

This folder owns deterministic city behavior.

Rules:

- No React imports.
- No direct AI calls.
- All state mutations go through simulation functions.
- AI proposals must become validated simulation commands before changing state.

Current modules:

- `types.ts`: domain types
- `seed.ts`: initial MVP city
- `engine.ts`: tick advancement, timed tasks, validation, and personality effects

Current scenario systems:

- Socio-economic scenario pressure lives on `CityState.scenario`.
- Factions track funds, influence, and hostility.
- Civic institutions track hospital, police, prison, staffing, trust, capacity,
  load, public health, public safety, open cases, recovery, and jail time.
- Conflict actions are abstract simulation events with numeric consequences.
- Citizen decisions enter the engine as AI proposals. Valid proposals become
  timed tasks; no citizen action is applied instantly from UI controls.
- Roads live on `CityState.roads`. When a proposal is scheduled, the engine
  finds a road route from the citizen's nearest structure to the task structure,
  adds travel hours to the base task duration, and moves the citizen along that
  route on simulation ticks.
- `work` is a 4 in-game-hour shift before road travel is added.
- Violent scenarios are represented only as off-screen game actions; no method,
  instruction, or real-world tactical detail belongs in this layer.
