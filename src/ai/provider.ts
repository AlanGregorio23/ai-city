import type { CitizenActionProposal, CityState } from "../sim/types";

export type AiActionProposal = CitizenActionProposal;

export interface AiProvider {
  summarizeCity(city: CityState): Promise<string>;
  proposeCitizenAction(city: CityState, citizenId: string): Promise<AiActionProposal>;
}
