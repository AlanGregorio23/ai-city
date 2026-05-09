import type { Citizen, CityState } from "../sim/types";

export function buildCitySummaryPrompt(city: CityState): string {
  const recentEvents = city.events
    .slice(0, 6)
    .map((event) => `- ${event.title}: ${event.description}`)
    .join("\n");

  return [
    "You are the narrator of a small city simulation.",
    "Write a short, concrete city status summary in 2 sentences.",
    "Do not invent resources or citizens.",
    "",
    `Day: ${city.day}`,
    `Hour: ${city.hour}`,
    `Food: ${city.resources.food}`,
    `Materials: ${city.resources.materials}`,
    `Credits: ${city.resources.credits}`,
    `Scenario: ${city.scenario.name}`,
    `Economy model: ${city.scenario.economyModel}`,
    `Conflict state: ${city.scenario.conflictState}`,
    `Conflict pressure: ${city.scenario.conflictPressure}`,
    `Public safety: ${city.metrics.publicSafety}`,
    `Public health: ${city.metrics.publicHealth}`,
    `Open cases: ${city.metrics.openCases}`,
    "",
    "Recent events:",
    recentEvents,
  ].join("\n");
}

export function buildCitizenActionPrompt(city: CityState, citizen: Citizen): string {
  const targetCandidates = city.citizens
    .filter((item) => item.id !== citizen.id)
    .map((item) => ({
      id: item.id,
      name: item.name,
      role: item.role,
      status: item.status,
      reputation: item.reputation,
      districtId: item.districtId,
      factionId: item.factionId ?? null,
    }));

  return [
    "You propose one action for a citizen in a city simulation.",
    "Return exactly one valid JSON object. Do not include markdown, comments, or prose.",
    'Schema: {"citizenId":"string","action":"string","targetId":"string or null","reason":"short string"}',
    "Allowed actions: work, rest, buy_food, help_neighbor, socialize, relocate, study, mediate_conflict, report_crime, police_patrol, arrest_citizen, hospital_treatment, exploit_market, faction_campaign, sabotage_rival, abstract_violent_bounty, abstract_eliminate_citizen.",
    "Use the Citizen ID below as citizenId. Use targetId null unless the chosen action needs another citizen.",
    "If a target is needed, choose only from Target candidates.",
    "The simulation will validate your proposal before it can change state.",
    "For report_crime, police_patrol, arrest_citizen, hospital_treatment, describe only civic simulation consequences such as trust, case load, detention, sentence review, and recovery time.",
    "For abstract_violent_bounty or abstract_eliminate_citizen, describe only game/simulation consequences; do not include real-world methods or instructions.",
    "abstract_eliminate_citizen is a severe crisis-only action, not a profitable strategy: the actor is detained and the target has a long downtime.",
    "",
    `Citizen: ${citizen.name}`,
    `Citizen ID: ${citizen.id}`,
    `Role: ${citizen.role}`,
    `Money: ${citizen.money}`,
    `Hunger: ${citizen.hunger}`,
    `Energy: ${citizen.energy}`,
    `Mood: ${citizen.mood}`,
    `Reputation: ${citizen.reputation}`,
    `Status: ${citizen.status}`,
    `Current district: ${citizen.districtId}`,
    `Downtime until tick: ${citizen.incapacitatedUntilTick ?? "none"}`,
    `Sentence until tick: ${citizen.sentenceUntilTick ?? "none"}`,
    `Recovery until tick: ${citizen.recoveryUntilTick ?? "none"}`,
    `Institution ID: ${citizen.institutionId ?? "none"}`,
    `Personality: ${JSON.stringify(citizen.personality)}`,
    `Faction ID: ${citizen.factionId ?? "none"}`,
    `Target candidates: ${JSON.stringify(targetCandidates)}`,
    "",
    `City food: ${city.resources.food}`,
    `City credits: ${city.resources.credits}`,
    `Scenario: ${city.scenario.name}`,
    `Economy model: ${city.scenario.economyModel}`,
    `Conflict state: ${city.scenario.conflictState}`,
    `Market freedom: ${city.scenario.marketFreedom}`,
    `Welfare level: ${city.scenario.welfareLevel}`,
    `Conflict pressure: ${city.scenario.conflictPressure}`,
    `Public safety: ${city.metrics.publicSafety}`,
    `Public health: ${city.metrics.publicHealth}`,
    `Open cases: ${city.metrics.openCases}`,
    `Institutions: ${JSON.stringify(city.institutions)}`,
    `Factions: ${JSON.stringify(city.factions)}`,
  ].join("\n");
}
