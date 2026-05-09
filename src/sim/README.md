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
- `engine.ts`: tick advancement and personality effects

Current scenario systems:

- Socio-economic scenario pressure lives on `CityState.scenario`.
- Factions track funds, influence, and hostility.
- Civic institutions track hospital, police, prison, staffing, trust, capacity,
  load, public health, public safety, open cases, recovery, and jail time.
- Conflict actions are abstract simulation events with numeric consequences.
- Violent scenarios are represented only as off-screen game actions; no method,
  instruction, or real-world tactical detail belongs in this layer.
