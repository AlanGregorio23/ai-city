# AI Layer

This folder keeps local AI replaceable.

Rules:

- AI providers return text or proposals.
- AI providers do not mutate city state.
- Simulation validation decides what actually happens.

Current modules:

- `provider.ts`: common provider interface
- `prompts.ts`: compact prompt builders
- `ollama.ts`: first local adapter
