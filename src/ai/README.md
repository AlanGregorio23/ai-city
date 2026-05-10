# AI Layer

This folder keeps local AI replaceable.

Rules:

- AI providers return text or proposals.
- AI providers do not mutate city state.
- Simulation validation decides what actually happens.

Current modules:

- `provider.ts`: common provider interface
- `prompts.ts`: compact prompt builders
- `ollama.ts`: local adapter that requests JSON-mode proposals when supported
  and falls back to extracting the first valid JSON object from model output

UI flow:

1. The app asks `OllamaProvider.proposeCitizenAction` only for citizens who are
   active and have no task in progress.
2. The returned JSON proposal is validated by deterministic simulation rules.
3. Valid proposals become timed simulation tasks through
   `scheduleCitizenActionProposal`.
4. The engine adds deterministic road travel time and action duration to the
   proposal. Work tasks are 4 in-game hours plus any travel hours.
5. The engine applies consequences only when the task reaches its completion
   tick.
