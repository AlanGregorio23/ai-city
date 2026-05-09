import type { AiActionProposal, AiProvider } from "./provider";
import { buildCitizenActionPrompt, buildCitySummaryPrompt } from "./prompts";
import type { CityState } from "../sim/types";

interface OllamaGenerateResponse {
  response?: string;
}

interface GenerateOptions {
  json?: boolean;
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

    const response = await this.generate(buildCitizenActionPrompt(city, citizen), { json: true });
    const proposal = parseActionProposal(response);

    return {
      ...proposal,
      citizenId,
    };
  }

  private async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format: options.json ? "json" : undefined,
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

function parseActionProposal(response: string): AiActionProposal {
  const parsed = parseFirstJsonObject(response);

  if (!isRecord(parsed)) {
    throw new Error("Ollama did not return a JSON object.");
  }

  const action = parsed.action;
  const reason = parsed.reason;
  const citizenId = parsed.citizenId;
  const targetId = parsed.targetId;

  if (typeof action !== "string") {
    throw new Error("Ollama proposal is missing a string action.");
  }

  return {
    citizenId: typeof citizenId === "string" ? citizenId : "",
    action: action as AiActionProposal["action"],
    targetId: typeof targetId === "string" && targetId.length > 0 ? targetId : undefined,
    reason: typeof reason === "string" && reason.length > 0 ? reason : "No reason supplied by the local model.",
  };
}

function parseFirstJsonObject(response: string): unknown {
  const trimmed = stripMarkdownFence(response.trim());

  try {
    return JSON.parse(trimmed);
  } catch {
    // Some local models still include thinking text or prose even with JSON mode.
  }

  for (const candidate of extractJsonObjectCandidates(trimmed)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next balanced object candidate.
    }
  }

  throw new Error("Ollama response did not contain valid JSON.");
}

function stripMarkdownFence(value: string): string {
  const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? value;
}

function extractJsonObjectCandidates(value: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index += 1) {
      const char = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = inString;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        depth += 1;
      }

      if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          candidates.push(value.slice(start, index + 1));
          break;
        }
      }
    }
  }

  return candidates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
