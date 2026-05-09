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

1. The Citizens panel asks `OllamaProvider.proposeCitizenAction` for the selected
   citizen.
2. The returned JSON proposal is displayed to the user.
3. `validateCitizenActionProposal` checks deterministic rules.
4. `applyCitizenActionProposal` is available only after validation passes.
