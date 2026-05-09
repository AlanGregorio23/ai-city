import type { AiActionProposal, AiProvider } from "./provider";
import { buildCitizenActionPrompt, buildCitySummaryPrompt } from "./prompts";
import type { CityState } from "../sim/types";

interface OllamaGenerateResponse {
  response?: string;
}

export class OllamaProvider implements AiProvider {
  constructor(
    private readonly baseUrl = import.meta.env.VITE_OLLAMA_BASE_URL ?? "http://localhost:11434",
    private readonly model = import.meta.env.VITE_OLLAMA_MODEL ?? "qwen3:8b",
  ) {}

  async summarizeCity(city: CityState): Promise<string> {
    const response = await this.generate(buildCitySummaryPrompt(city));
    return response.trim();
  }

  async proposeCitizenAction(city: CityState, citizenId: string): Promise<AiActionProposal> {
    const citizen = city.citizens.find((item) => item.id === citizenId);

    if (!citizen) {
      throw new Error(`Unknown citizen: ${citizenId}`);
    }

    const response = await this.generate(buildCitizenActionPrompt(city, citizen));
    return JSON.parse(response) as AiActionProposal;
  }

  private async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with ${response.status}`);
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    return payload.response ?? "";
  }
}
