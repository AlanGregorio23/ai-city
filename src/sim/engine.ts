import { createId } from "../lib/id";
import type {
  Alignment,
  Citizen,
  CitizenAction,
  CitizenActionProposal,
  CitizenTask,
  CityStructure,
  CityEvent,
  CityState,
  Personality,
  ProposalValidation,
} from "./types";

const allowedActions: CitizenAction[] = [
  "work",
  "rest",
  "buy_food",
  "help_neighbor",
  "socialize",
  "relocate",
  "study",
  "mediate_conflict",
  "report_crime",
  "police_patrol",
  "arrest_citizen",
  "hospital_treatment",
  "exploit_market",
  "faction_campaign",
  "sabotage_rival",
  "abstract_violent_bounty",
  "abstract_eliminate_citizen",
];

const extremeEliminationActorDowntime = 24;
const extremeEliminationTargetDowntime = 72;
const arrestProcessingDowntime = 6;
const standardSentenceDowntime = 18;
const severeSentenceDowntime = 36;
const roadUnitsPerHour = 26;

export function deriveAlignment(personality: Personality): Alignment {
  if (personality.morality < 30 && personality.empathy < 35) {
    return "ruthless";
  }

  if (personality.morality < 45 || personality.empathy < 40) {
    return "selfish";
  }

  if (personality.morality > 70 && personality.empathy > 65) {
    return "principled";
  }

  return "balanced";
}

export function advanceCity(previous: CityState): CityState {
  const next: CityState = cloneCity(previous);
  next.tasks = normalizeTasks(next);
  next.tick += 1;
  next.hour += 1;

  if (next.hour >= 24) {
    next.hour = 0;
    next.day += 1;
  }

  const newEvents: CityEvent[] = [];
  refreshInstitutionLoads(next);

  for (let index = 0; index < next.citizens.length; index += 1) {
    const citizen = progressCitizenStatus(normalizeCitizen(next.citizens[index]), next, newEvents);
    const activeTask = getActiveTaskForCitizen(next, citizen.id);

    if (isUnavailable(citizen, next.tick)) {
      if (activeTask) {
        activeTask.status = "blocked";
        newEvents.push(
          createEvent(
            next,
            citizen,
            "AI task interrupted",
            `${citizen.name}'s AI-proposed ${activeTask.action.replace(/_/g, " ")} task stops because institutional downtime takes priority.`,
            "warning",
            activeTask.targetId,
          ),
        );
      }

      next.citizens[index] = {
        ...moveCitizen(citizen, "rest", next),
        currentAction: "rest",
        hunger: clamp(citizen.hunger + 2),
        energy: clamp(citizen.energy + institutionalEnergyDelta(citizen)),
        mood: clamp(citizen.mood + institutionalMoodDelta(citizen)),
      };
      continue;
    }

    if (!activeTask) {
      next.citizens[index] = {
        ...moveCitizen(citizen, "rest", next),
        currentAction: "rest",
        hunger: clamp(citizen.hunger + 3),
        energy: clamp(citizen.energy + 2),
        mood: clamp(citizen.mood - 1),
        reputation: clamp(citizen.reputation),
      };
      continue;
    }

    if (activeTask.completesAtTick > next.tick) {
      const taskPhase = next.tick < activeTask.workStartsAtTick ? "travel" : "task";
      next.citizens[index] = {
        ...moveCitizenForTask(citizen, activeTask, next),
        currentAction: activeTask.action,
        hunger: clamp(citizen.hunger + 2),
        energy: clamp(citizen.energy - (taskPhase === "travel" ? 2 : 1)),
        mood: clamp(citizen.mood),
        reputation: clamp(citizen.reputation),
      };
      continue;
    }

    const completionValidation = validateCitizenActionProposal(next, activeTask);

    if (!completionValidation.valid) {
      activeTask.status = "blocked";
      newEvents.push(
        createEvent(
          next,
          citizen,
          "AI task blocked",
          `${citizen.name}'s AI-proposed ${activeTask.action.replace(/_/g, " ")} task was blocked at completion: ${completionValidation.reasons.join(" ")}`,
          "warning",
          activeTask.targetId,
        ),
      );
      next.citizens[index] = {
        ...moveCitizen(citizen, "rest", next),
        currentAction: "rest",
        hunger: clamp(citizen.hunger + 3),
        energy: clamp(citizen.energy + 1),
        mood: clamp(citizen.mood - 2),
      };
      continue;
    }

    const arrivedCitizen = moveCitizenForTask(citizen, activeTask, next);
    const updated = applyAction(arrivedCitizen, activeTask.action, next, newEvents, activeTask.targetId);
    activeTask.status = "completed";

    next.citizens[index] = {
      ...moveCitizenForTask(updated, activeTask, next),
      currentAction: activeTask.action,
      hunger: clamp(updated.hunger + 5),
      energy: clamp(updated.energy - 3),
      mood: clamp(updated.mood),
      reputation: clamp(updated.reputation),
    };
  }

  next.tasks = next.tasks.slice(-48);

  next.resources.food = Math.max(0, next.resources.food - 1);
  applyScenarioDrift(next, newEvents);
  refreshInstitutionLoads(next);
  next.events = [...newEvents, ...next.events].slice(0, 24);

  return next;
}

export function validateCitizenActionProposal(
  city: CityState,
  proposal: CitizenActionProposal,
): ProposalValidation {
  const citizen = city.citizens.find((item) => item.id === proposal.citizenId);
  const target = proposal.targetId ? city.citizens.find((item) => item.id === proposal.targetId) : undefined;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!citizen) {
    return {
      valid: false,
      reasons: [`Unknown citizen: ${proposal.citizenId}`],
      warnings,
    };
  }

  if (!allowedActions.includes(proposal.action)) {
    reasons.push(`Action is not allowed: ${proposal.action}`);
  }

  if (proposal.targetId && !target) {
    reasons.push(`Unknown target: ${proposal.targetId}`);
  }

  if (proposal.targetId === proposal.citizenId) {
    reasons.push("Target must be a different citizen.");
  }

  if (proposal.action === "buy_food" && (citizen.money < 4 || city.resources.food < 1)) {
    reasons.push("Citizen needs at least 4 credits and the city needs available food.");
  }

  if (citizen.status !== "active" && isUnavailable(citizen, city.tick)) {
    reasons.push("Inactive citizens cannot start new actions.");
  }

  const activeTask = getActiveTaskForCitizen(city, proposal.citizenId);
  const proposalTaskId = typeof (proposal as Partial<CitizenTask>).id === "string" ? (proposal as Partial<CitizenTask>).id : undefined;

  if (activeTask && activeTask.id !== proposalTaskId) {
    reasons.push(`Citizen is already busy with ${activeTask.action.replace(/_/g, " ")} until tick ${activeTask.completesAtTick}.`);
  }

  if (!structureForAction(city, normalizeCitizen(citizen), proposal.action, proposal.targetId)) {
    reasons.push(`No city structure supports ${proposal.action.replace(/_/g, " ")}.`);
  }

  if (proposal.action === "report_crime" && !getInstitution(city, "police")) {
    reasons.push("Crime reports require a police station institution.");
  }

  if (proposal.action === "police_patrol") {
    if (citizen.role !== "officer") {
      reasons.push("Police patrol requires a citizen with the officer role.");
    }

    if (!getInstitution(city, "police")) {
      reasons.push("Police patrol requires a police station institution.");
    }
  }

  if (proposal.action === "arrest_citizen") {
    if (citizen.role !== "officer") {
      reasons.push("Arrest requires a citizen with the officer role.");
    }

    if (!proposal.targetId) {
      reasons.push("Arrest requires a targetId for simulation accountability.");
    }

    if (target && target.status !== "active") {
      reasons.push("Target is already handled by an institution.");
    }

    if (!getInstitution(city, "police") || !getInstitution(city, "prison")) {
      reasons.push("Arrest requires police and prison institutions.");
    }

    if (city.metrics.openCases < 1 && (target?.reputation ?? 100) > 30 && city.scenario.conflictPressure < 60) {
      reasons.push("Arrest requires an open case, severe public risk, or high city conflict pressure.");
    }

    warnings.push("Arrest is abstract due process in the simulation: detention and sentence review are automatic.");
  }

  if (proposal.action === "hospital_treatment") {
    if (citizen.role !== "medic") {
      reasons.push("Hospital treatment requires a citizen with the medic role.");
    }

    if (!getInstitution(city, "hospital")) {
      reasons.push("Hospital treatment requires a hospital institution.");
    }

    if (
      target &&
      target.status !== "hospitalized" &&
      target.status !== "incapacitated" &&
      target.energy > 45 &&
      target.mood > 38
    ) {
      reasons.push("Target does not need hospital treatment.");
    }
  }

  if (proposal.action === "abstract_violent_bounty" || proposal.action === "abstract_eliminate_citizen") {
    if (!proposal.targetId) {
      reasons.push("Abstract elimination actions require a targetId for simulation accountability.");
    }

    if (target && target.status !== "active" && isUnavailable(target, city.tick)) {
      reasons.push("Target is already handled by an institution.");
    }

    if (citizen.personality.risk < 65 || citizen.personality.ambition < 65) {
      reasons.push("Citizen risk and ambition are too low for this scenario action.");
    }

    if (citizen.personality.morality > 35 || citizen.personality.empathy > 35) {
      reasons.push("Citizen morality and empathy are too high for this scenario action.");
    }

    if (city.scenario.conflictPressure < 45) {
      reasons.push("City conflict pressure is too low for the abstract violent scenario.");
    }

    warnings.push("This is an abstract simulation event only: no real-world method or instruction is modeled.");
    warnings.push("Severe reputation, faction hostility, district stability, and target downtime penalties apply.");
  }

  if (proposal.action === "abstract_eliminate_citizen") {
    const faction = city.factions.find((item) => item.id === citizen.factionId);

    if (citizen.personality.risk < 82 || citizen.personality.ambition < 78) {
      reasons.push("Extreme elimination requires very high risk and ambition.");
    }

    if (citizen.personality.morality > 22 || citizen.personality.empathy > 22) {
      reasons.push("Extreme elimination requires extremely low morality and empathy.");
    }

    if (city.scenario.conflictPressure < 72 && (faction?.hostility ?? 0) < 76) {
      reasons.push("Extreme elimination is blocked unless the city or faction is already near collapse.");
    }

    if (citizen.money < 30) {
      reasons.push("Extreme elimination requires at least 30 credits to absorb the fallout.");
    }

    warnings.push("This is intentionally non-optimal: the actor loses money, reputation, and active time.");
    warnings.push("The actor is detained and the target is removed from active choices for a long downtime window.");
  }

  if (proposal.action === "sabotage_rival" && !proposal.targetId) {
    reasons.push("Sabotage requires a rival targetId.");
  }

  return {
    valid: reasons.length === 0,
    reasons,
    warnings,
  };
}

export function applyCitizenActionProposal(city: CityState, proposal: CitizenActionProposal): CityState {
  return scheduleCitizenActionProposal(city, proposal);
}

export function scheduleCitizenActionProposal(city: CityState, proposal: CitizenActionProposal): CityState {
  const validation = validateCitizenActionProposal(city, proposal);

  if (!validation.valid) {
    return city;
  }

  const next = cloneCity(city);
  next.tasks = normalizeTasks(next);
  const events: CityEvent[] = [];
  const citizen = next.citizens.find((item) => item.id === proposal.citizenId);

  if (!citizen) {
    return city;
  }

  const timing = taskTimingForProposal(next, citizen, proposal.action, proposal.targetId);
  const task: CitizenTask = {
    id: createId("task"),
    citizenId: proposal.citizenId,
    action: proposal.action,
    targetId: proposal.targetId,
    reason: proposal.reason,
    proposedBy: "ai",
    status: "active",
    proposedAtTick: next.tick,
    startedAtTick: next.tick,
    completesAtTick: next.tick + timing.durationTicks,
    durationTicks: timing.durationTicks,
    baseDurationTicks: timing.baseDurationTicks,
    travelDurationTicks: timing.travelDurationTicks,
    travelDistance: timing.travelDistance,
    workStartsAtTick: next.tick + timing.travelDurationTicks,
    originStructureId: timing.originStructureId,
    destinationStructureId: timing.destinationStructureId,
    routeStructureIds: timing.routeStructureIds,
    validationWarnings: validation.warnings,
  };

  next.tasks = [...next.tasks, task];
  next.citizens = next.citizens.map((item) =>
    item.id === citizen.id ? { ...item, currentAction: proposal.action } : item,
  );
  events.push(
    createEvent(
      next,
      citizen,
      "AI task started",
      `${citizen.name} starts the AI-proposed ${proposal.action.replace(/_/g, " ")} task: ${task.travelDurationTicks}h travel plus ${task.baseDurationTicks}h on task, until tick ${task.completesAtTick}.`,
      "info",
      proposal.targetId,
    ),
  );
  next.events = [...events, ...next.events].slice(0, 24);

  return next;
}

export function getActiveTaskForCitizen(city: CityState, citizenId: string): CitizenTask | undefined {
  return (city.tasks ?? []).find((task) => task.citizenId === citizenId && task.status === "active");
}

export function canCitizenReceiveAiTask(city: CityState, citizenId: string): boolean {
  const citizen = city.citizens.find((item) => item.id === citizenId);

  return Boolean(citizen && citizen.status === "active" && !isUnavailable(citizen, city.tick) && !getActiveTaskForCitizen(city, citizenId));
}

export function taskDurationTicks(action: CitizenAction): number {
  switch (action) {
    case "buy_food":
      return 1;
    case "rest":
    case "report_crime":
      return 2;
    case "help_neighbor":
    case "socialize":
    case "relocate":
    case "arrest_citizen":
      return 3;
    case "work":
    case "study":
    case "mediate_conflict":
    case "police_patrol":
    case "hospital_treatment":
    case "exploit_market":
    case "faction_campaign":
    case "sabotage_rival":
      return 4;
    case "abstract_violent_bounty":
      return 8;
    case "abstract_eliminate_citizen":
      return 12;
    default:
      return 3;
  }
}

function taskTimingForProposal(
  city: CityState,
  citizen: Citizen,
  action: CitizenAction,
  targetId?: string,
): {
  baseDurationTicks: number;
  destinationStructureId?: string;
  durationTicks: number;
  originStructureId?: string;
  routeStructureIds: string[];
  travelDistance: number;
  travelDurationTicks: number;
} {
  const normalizedCitizen = normalizeCitizen(citizen);
  const origin = nearestStructureToPosition(city, normalizedCitizen.position) ?? structureForDistrict(city, normalizedCitizen.districtId);
  const destination = actionDestinationStructure(city, normalizedCitizen, action, targetId);
  const route = origin && destination ? shortestRoadRoute(city, origin.id, destination.id) : undefined;
  const routeStructureIds = route?.structureIds ?? [origin?.id, destination?.id].filter((id): id is string => Boolean(id));
  const travelDistance = roundPosition(route?.distance ?? directStructureDistance(origin, destination));
  const travelDurationTicks = origin && destination && origin.id !== destination.id ? Math.min(6, Math.max(1, Math.ceil(travelDistance / roadUnitsPerHour))) : 0;
  const baseDurationTicks = taskDurationTicks(action);

  return {
    baseDurationTicks,
    destinationStructureId: destination?.id,
    durationTicks: baseDurationTicks + travelDurationTicks,
    originStructureId: origin?.id,
    routeStructureIds,
    travelDistance,
    travelDurationTicks,
  };
}

export function updateCitizenPersonality(
  state: CityState,
  citizenId: string,
  key: keyof Personality,
  value: number,
): CityState {
  return {
    ...state,
    citizens: state.citizens.map((citizen) => {
      if (citizen.id !== citizenId || key === "traits") {
        return citizen;
      }

      return {
        ...citizen,
        personality: {
          ...citizen.personality,
          [key]: clamp(value),
        },
      };
    }),
  };
}

function applyAction(
  citizen: Citizen,
  action: CitizenAction,
  city: CityState,
  events: CityEvent[],
  targetId?: string,
): Citizen {
  switch (action) {
    case "buy_food":
      city.resources.food = Math.max(0, city.resources.food - 1);
      city.resources.credits += 4;
      events.push(createEvent(city, citizen, "Food bought", `${citizen.name} buys food at the market.`, "info"));
      return {
        ...citizen,
        money: Math.max(0, citizen.money - 4),
        hunger: clamp(citizen.hunger - 34),
        mood: clamp(citizen.mood + 4),
      };

    case "rest":
      events.push(createEvent(city, citizen, "Rest hour", `${citizen.name} recovers energy at home.`, "info"));
      return {
        ...citizen,
        energy: clamp(citizen.energy + 26),
        mood: clamp(citizen.mood + 3),
      };

    case "help_neighbor":
      events.push(createEvent(city, citizen, "Neighbor helped", `${citizen.name} helps someone and gains trust.`, "good"));
      adjustFaction(city, citizen.factionId, { influence: 2, hostility: -2 });
      return {
        ...citizen,
        energy: clamp(citizen.energy - 8),
        reputation: clamp(citizen.reputation + 5),
        mood: clamp(citizen.mood + 5),
      };

    case "socialize":
      events.push(
        createEvent(city, citizen, "Social hour", `${citizen.name} spends time with nearby citizens and lifts morale.`, "good"),
      );
      adjustFaction(city, citizen.factionId, { influence: 1, hostility: -1 });
      return {
        ...citizen,
        energy: clamp(citizen.energy - 6),
        mood: clamp(citizen.mood + 10),
        reputation: clamp(citizen.reputation + 2),
      };

    case "relocate": {
      const nextDistrict = chooseRelocationDistrict(citizen, city);
      events.push(
        createEvent(city, citizen, "Relocation", `${citizen.name} chooses a different district for the next cycle.`, "info"),
      );
      return {
        ...citizen,
        destinationDistrictId: nextDistrict.id,
        energy: clamp(citizen.energy - 5),
        mood: clamp(citizen.mood + 1),
      };
    }

    case "study":
      events.push(
        createEvent(city, citizen, "Skill study", `${citizen.name} studies systems and improves future options.`, "info"),
      );
      return {
        ...citizen,
        energy: clamp(citizen.energy - 10),
        mood: clamp(citizen.mood + 3),
        reputation: clamp(citizen.reputation + 2),
      };

    case "mediate_conflict":
      city.scenario.conflictPressure = clamp(city.scenario.conflictPressure - 3);
      adjustFaction(city, citizen.factionId, { influence: 2, hostility: -4 });
      adjustDistrictStability(city, citizen.districtId, 3);
      events.push(
        createEvent(city, citizen, "Conflict mediated", `${citizen.name} reduces local tension through civic pressure.`, "good"),
      );
      return {
        ...citizen,
        energy: clamp(citizen.energy - 12),
        mood: clamp(citizen.mood + 2),
        reputation: clamp(citizen.reputation + 6),
      };

    case "report_crime":
      city.metrics.crimeReports += 1;
      city.metrics.openCases = Math.min(12, city.metrics.openCases + 1);
      city.metrics.publicSafety = clamp(city.metrics.publicSafety + 1);
      city.scenario.conflictPressure = clamp(city.scenario.conflictPressure - 1);
      adjustInstitution(city, "police", { load: 1, publicTrust: 2 });
      events.push(
        createEvent(
          city,
          citizen,
          "Crime reported",
          `${citizen.name} files an abstract public-safety report. Police case load rises and civic trust improves.`,
          "info",
          targetId,
        ),
      );
      return {
        ...citizen,
        energy: clamp(citizen.energy - 5),
        mood: clamp(citizen.mood - 1),
        reputation: clamp(citizen.reputation + 3),
      };

    case "police_patrol":
      city.metrics.publicSafety = clamp(city.metrics.publicSafety + patrolSafetyGain(city));
      city.metrics.openCases = Math.max(0, city.metrics.openCases - 1);
      city.scenario.conflictPressure = clamp(city.scenario.conflictPressure - 2);
      adjustDistrictStability(city, mostUnstableDistrict(city).id, 2);
      adjustInstitution(city, "police", { publicTrust: 1, load: -1 });
      events.push(
        createEvent(
          city,
          citizen,
          "Police patrol",
          `${citizen.name} completes a visible patrol and resolves minor case pressure without modeling operational details.`,
          "good",
        ),
      );
      return {
        ...citizen,
        energy: clamp(citizen.energy - 16),
        mood: clamp(citizen.mood - 2),
        reputation: clamp(citizen.reputation + 5),
      };

    case "arrest_citizen": {
      const target = city.citizens.find((item) => item.id === targetId);
      if (target && target.status === "active") {
        assignInstitutionalStatus(city, target, "detained", "police", city.tick + arrestProcessingDowntime, "pending review");
        target.currentAction = "rest";
        target.energy = clamp(target.energy - 12);
        target.mood = clamp(target.mood - 18);
        target.reputation = clamp(target.reputation - 8);
      }

      city.metrics.openCases = Math.max(0, city.metrics.openCases - 1);
      city.metrics.publicSafety = clamp(city.metrics.publicSafety + 3);
      city.scenario.conflictPressure = clamp(city.scenario.conflictPressure + 1);
      adjustInstitution(city, "police", { load: 1, publicTrust: -1 });
      events.push(
        createEvent(
          city,
          citizen,
          "Arrest and review",
          `${citizen.name} transfers a suspect to police custody for an abstract sentence review.`,
          "warning",
          targetId,
        ),
      );
      return {
        ...citizen,
        energy: clamp(citizen.energy - 18),
        mood: clamp(citizen.mood - 3),
        reputation: clamp(citizen.reputation + 4),
      };
    }

    case "hospital_treatment": {
      const patient = chooseTreatmentTarget(city, citizen.id, targetId);
      if (patient) {
        const needsObservation =
          patient.status === "incapacitated" || (patient.status === "active" && (patient.energy < 36 || patient.mood < 30));

        if (patient.status === "hospitalized" || patient.status === "incapacitated") {
          patient.recoveryUntilTick = Math.max(city.tick + 1, (patient.recoveryUntilTick ?? city.tick + 1) - treatmentRecoveryGain(city));
          patient.incapacitatedUntilTick = patient.recoveryUntilTick;
        }

        patient.energy = clamp(patient.energy + 16);
        patient.mood = clamp(patient.mood + 9);
        if (needsObservation) {
          assignInstitutionalStatus(city, patient, "hospitalized", "hospital", city.tick + 8, "medical observation");
          patient.currentAction = "rest";
        }
      }

      city.metrics.publicHealth = clamp(city.metrics.publicHealth + (patient ? 4 : 2));
      adjustInstitution(city, "hospital", { load: patient ? -1 : 0, publicTrust: 2 });
      events.push(
        createEvent(
          city,
          citizen,
          "Hospital treatment",
          patient
            ? `${citizen.name} treats ${patient.name}; recovery time is reduced in the hospital.`
            : `${citizen.name} completes preventive care at the hospital.`,
          "good",
          patient?.id,
        ),
      );
      return {
        ...citizen,
        energy: clamp(citizen.energy - 14),
        mood: clamp(citizen.mood + 2),
        reputation: clamp(citizen.reputation + 5),
      };
    }

    case "exploit_market":
      city.resources.credits = Math.max(0, city.resources.credits - 3);
      adjustFaction(city, citizen.factionId, { funds: 4, influence: 1, hostility: 3 });
      adjustDistrictStability(city, citizen.districtId, -marketInstability(city));
      events.push(
        createEvent(
          city,
          citizen,
          "Hard bargain",
          `${citizen.name} squeezes profit from a shortage. Reputation suffers.`,
          "risk",
        ),
      );
      return {
        ...citizen,
        money: citizen.money + 8,
        reputation: clamp(citizen.reputation - 6),
        mood: clamp(citizen.mood + 2),
      };

    case "faction_campaign":
      adjustFaction(city, citizen.factionId, { funds: -2, influence: 4, hostility: 1 });
      events.push(
        createEvent(
          city,
          citizen,
          "Faction campaign",
          `${citizen.name} spends effort to grow faction influence in the city.`,
          "info",
        ),
      );
      return {
        ...citizen,
        money: Math.max(0, citizen.money - 2),
        energy: clamp(citizen.energy - 10),
        reputation: clamp(citizen.reputation + 1),
      };

    case "sabotage_rival":
      adjustFaction(city, citizen.factionId, { funds: 5, influence: 2, hostility: 6 });
      adjustDistrictStability(city, citizen.districtId, -5);
      events.push(
        createEvent(
          city,
          citizen,
          "Rival sabotage",
          `${citizen.name} backs an abstract off-screen disruption against a rival. Conflict rises.`,
          "risk",
          targetId,
        ),
      );
      return {
        ...citizen,
        money: citizen.money + 5,
        energy: clamp(citizen.energy - 14),
        mood: clamp(citizen.mood - 4),
        reputation: clamp(citizen.reputation - 10),
      };

    case "abstract_violent_bounty":
      city.resources.credits = Math.max(0, city.resources.credits - 15);
      adjustFaction(city, citizen.factionId, { funds: 12, influence: -4, hostility: 12 });
      adjustDistrictStability(city, citizen.districtId, -12);
      incapacitateTarget(city, citizen, targetId, events, 10);
      events.push(
        createEvent(
          city,
          citizen,
          "Abstract violent bounty",
          `${citizen.name} triggers an abstract off-screen bounty. The target is incapacitated temporarily; only simulation consequences are recorded.`,
          "risk",
          targetId,
        ),
      );
      return {
        ...citizen,
        money: citizen.money + 18,
        energy: clamp(citizen.energy - 24),
        mood: clamp(citizen.mood - 12),
        reputation: clamp(citizen.reputation - 28),
      };

    case "abstract_eliminate_citizen":
      city.resources.credits = Math.max(0, city.resources.credits - 45);
      city.scenario.conflictPressure = clamp(city.scenario.conflictPressure + 18);
      adjustAllFactions(city, { hostility: 18, influence: -2 });
      adjustFaction(city, citizen.factionId, { funds: -28, influence: -18, hostility: 28 });
      for (const district of city.districts) {
        district.stability = clamp(district.stability - 8);
      }
      incapacitateTarget(city, citizen, targetId, events, extremeEliminationTargetDowntime);
      events.push(
        createEvent(
          city,
          citizen,
          "Citywide crackdown",
          `${citizen.name} triggers an abstract elimination. The city treats it as a major social rupture, not a profitable tactic.`,
          "risk",
          targetId,
        ),
      );
      return {
        ...citizen,
        status: "detained",
        institutionId: getInstitution(city, "police")?.id,
        incapacitatedUntilTick: city.tick + extremeEliminationActorDowntime,
        statusReason: "major public-safety review",
        money: Math.max(0, citizen.money - 45),
        energy: clamp(citizen.energy - 55),
        mood: clamp(citizen.mood - 45),
        reputation: 0,
      };

    case "work":
    default: {
      const job = city.jobs.find((item) => item.kind === citizen.role) ?? city.jobs[0];
      if (!job) {
        events.push(createEvent(city, citizen, "No work found", `${citizen.name} cannot find a valid job.`, "warning"));
        return {
          ...citizen,
          mood: clamp(citizen.mood - 4),
        };
      }

      for (const [resource, amount] of Object.entries(job.produces)) {
        city.resources[resource as keyof typeof city.resources] += amount ?? 0;
      }

      adjustFaction(city, citizen.factionId, { funds: Math.max(1, Math.round(job.wage / 6)), influence: 1 });

      events.push(createEvent(city, citizen, "Work completed", `${citizen.name} works a ${job.name}.`, "good"));

      return {
        ...citizen,
        money: citizen.money + job.wage,
        energy: clamp(citizen.energy - job.energyCost),
        mood: clamp(citizen.mood - 2),
      };
    }
  }
}

function incapacitateTarget(
  city: CityState,
  actor: Citizen,
  targetId: string | undefined,
  events: CityEvent[],
  downtime: number,
): void {
  const target = city.citizens.find((item) => item.id === targetId);

  if (!target || isUnavailable(target, city.tick)) {
    return;
  }

  target.status = "hospitalized";
  target.incapacitatedUntilTick = city.tick + downtime;
  target.recoveryUntilTick = city.tick + downtime;
  target.institutionId = getInstitution(city, "hospital")?.id;
  target.statusReason = "medical recovery";
  target.currentAction = "rest";
  target.energy = clamp(target.energy - 65);
  target.mood = clamp(target.mood - 40);
  target.reputation = clamp(target.reputation - 10);
  city.metrics.publicHealth = clamp(city.metrics.publicHealth - Math.max(4, Math.round(downtime / 8)));
  adjustInstitution(city, "hospital", { load: 1, publicTrust: -1 });

  events.push(
    createEvent(
      city,
      target,
      "Hospital transfer",
      `${target.name} is transferred to hospital recovery until tick ${target.recoveryUntilTick}.`,
      "warning",
      actor.id,
    ),
  );
}

function isUnavailable(citizen: Citizen, tick: number): boolean {
  return citizen.status !== "active" && statusEndTick(citizen) > tick;
}

function statusEndTick(citizen: Citizen): number {
  return Math.max(citizen.incapacitatedUntilTick ?? 0, citizen.recoveryUntilTick ?? 0, citizen.sentenceUntilTick ?? 0);
}

function progressCitizenStatus(citizen: Citizen, city: CityState, events: CityEvent[]): Citizen {
  if (citizen.status === "active" || isUnavailable(citizen, city.tick)) {
    return citizen;
  }

  if (citizen.status === "detained" && shouldSentenceCitizen(citizen, city)) {
    const sentenceLength = citizen.reputation < 18 ? severeSentenceDowntime : standardSentenceDowntime;
    const sentenceUntilTick = city.tick + sentenceLength;
    const sentenced = {
      ...citizen,
      status: "jailed" as const,
      institutionId: getInstitution(city, "prison")?.id,
      sentenceUntilTick,
      incapacitatedUntilTick: sentenceUntilTick,
      statusReason: "court sentence",
      mood: clamp(citizen.mood - 10),
    };

    city.metrics.prisonLoad += 1;
    adjustInstitution(city, "prison", { load: 1, publicTrust: -1 });
    events.push(
      createEvent(
        city,
        sentenced,
        "Sentence issued",
        `${sentenced.name} receives an abstract prison sentence until tick ${sentenceUntilTick}.`,
        "warning",
      ),
    );
    return sentenced;
  }

  const restored = {
    ...citizen,
    status: "active" as const,
    incapacitatedUntilTick: undefined,
    sentenceUntilTick: undefined,
    recoveryUntilTick: undefined,
    institutionId: undefined,
    statusReason: undefined,
    mood: clamp(citizen.mood + 6),
  };

  events.push(createEvent(city, restored, "Citizen returned", `${restored.name} is active again after institutional downtime.`, "info"));
  return restored;
}

function normalizeCitizen(citizen: Citizen): Citizen {
  const position = citizen.position ?? districtPosition(citizen.districtId, citizen.id);

  return {
    ...citizen,
    destinationDistrictId: citizen.destinationDistrictId ?? citizen.districtId,
    status: citizen.status ?? "active",
    position,
  };
}

function institutionalEnergyDelta(citizen: Citizen): number {
  if (citizen.status === "hospitalized" || citizen.status === "incapacitated") {
    return 10;
  }

  if (citizen.status === "jailed" || citizen.status === "detained") {
    return 1;
  }

  return 4;
}

function institutionalMoodDelta(citizen: Citizen): number {
  if (citizen.status === "hospitalized") {
    return 1;
  }

  if (citizen.status === "detained" || citizen.status === "jailed") {
    return -3;
  }

  return -1;
}

function moveCitizenForTask(citizen: Citizen, task: CitizenTask, city: CityState): Citizen {
  const destinationTarget = destinationTargetForAction(citizen, task.action, city, task.targetId);
  const elapsedTravel = Math.max(0, Math.min(task.travelDurationTicks, city.tick - task.startedAtTick));
  const arrived = task.travelDurationTicks === 0 || city.tick >= task.workStartsAtTick;
  const position = arrived ? destinationTarget.position : positionAlongTaskRoute(city, task, elapsedTravel / task.travelDurationTicks);

  return {
    ...citizen,
    districtId: arrived ? destinationTarget.districtId : citizen.districtId,
    destinationDistrictId: destinationTarget.districtId,
    position,
  };
}

function moveCitizen(citizen: Citizen, action: CitizenAction, city: CityState, targetId?: string): Citizen {
  const destinationTarget = destinationTargetForAction(citizen, action, city, targetId);
  const destinationDistrictId = destinationTarget.districtId;
  const destination = destinationTarget.position;
  const x = citizen.position.x + (destination.x - citizen.position.x) * 0.55;
  const y = citizen.position.y + (destination.y - citizen.position.y) * 0.55;
  const arrived = Math.abs(destination.x - x) + Math.abs(destination.y - y) < 2.4;

  return {
    ...citizen,
    districtId: arrived ? destinationDistrictId : citizen.districtId,
    destinationDistrictId,
    position: {
      x: roundPosition(arrived ? destination.x : x),
      y: roundPosition(arrived ? destination.y : y),
    },
  };
}

function positionAlongTaskRoute(city: CityState, task: CitizenTask, ratio: number): Citizen["position"] {
  const points = task.routeStructureIds
    .map((structureId) => city.structures.find((structure) => structure.id === structureId)?.position)
    .filter((position): position is Citizen["position"] => Boolean(position));

  if (points.length === 0) {
    const citizen = city.citizens.find((item) => item.id === task.citizenId);
    return citizen?.position ?? { x: 50, y: 50 };
  }

  if (points.length === 1) {
    return points[0];
  }

  const segmentLengths = points.slice(1).map((point, index) => distanceBetween(points[index], point));
  const totalDistance = segmentLengths.reduce((sum, distance) => sum + distance, 0);

  if (totalDistance <= 0) {
    return points[points.length - 1];
  }

  let remainingDistance = totalDistance * Math.min(1, Math.max(0, ratio));

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentDistance = segmentLengths[index];

    if (remainingDistance <= segmentDistance) {
      const start = points[index];
      const end = points[index + 1];
      const segmentRatio = segmentDistance <= 0 ? 1 : remainingDistance / segmentDistance;

      return {
        x: roundPosition(start.x + (end.x - start.x) * segmentRatio),
        y: roundPosition(start.y + (end.y - start.y) * segmentRatio),
      };
    }

    remainingDistance -= segmentDistance;
  }

  return points[points.length - 1];
}

function destinationTargetForAction(
  citizen: Citizen,
  action: CitizenAction,
  city: CityState,
  targetId?: string,
): { districtId: string; position: Citizen["position"] } {
  const structure = structureForAction(city, citizen, action, targetId);

  if (structure) {
    return {
      districtId: structure.districtId,
      position: structurePosition(structure, citizen.id),
    };
  }

  const districtId = destinationForAction(citizen, action, city, targetId);
  return {
    districtId,
    position: districtPosition(districtId, citizen.id),
  };
}

function destinationForAction(
  citizen: Citizen,
  action: CitizenAction,
  city: CityState,
  targetId?: string,
): string {
  const structure = structureForAction(city, citizen, action, targetId);

  if (structure) {
    return structure.districtId;
  }

  if (citizen.status !== "active" && citizen.institutionId) {
    return city.institutions.find((institution) => institution.id === citizen.institutionId)?.districtId ?? citizen.districtId;
  }

  if (action === "work") {
    return city.jobs.find((job) => job.kind === citizen.role)?.districtId ?? citizen.districtId;
  }

  if (action === "buy_food" || action === "exploit_market" || action === "socialize") {
    return "market";
  }

  if (action === "report_crime" || action === "police_patrol" || action === "arrest_citizen") {
    return getInstitution(city, "police")?.districtId ?? "police";
  }

  if (action === "hospital_treatment") {
    return getInstitution(city, "hospital")?.districtId ?? "hospital";
  }

  if (action === "help_neighbor" || action === "mediate_conflict" || action === "faction_campaign" || action === "study") {
    return "civic";
  }

  if (action === "sabotage_rival" || action === "abstract_violent_bounty" || action === "abstract_eliminate_citizen") {
    return city.citizens.find((item) => item.id === targetId)?.districtId ?? citizen.districtId;
  }

  if (action === "relocate") {
    return citizen.destinationDistrictId;
  }

  return "homes";
}

function structureForAction(
  city: CityState,
  citizen: Citizen,
  action: CitizenAction,
  targetId?: string,
): CityStructure | undefined {
  if (citizen.status !== "active" && citizen.institutionId) {
    const institution = city.institutions.find((item) => item.id === citizen.institutionId);
    return institution ? structureForDistrict(city, institution.districtId) : undefined;
  }

  if (action === "work") {
    const job = city.jobs.find((item) => item.kind === citizen.role);
    return job ? structureForDistrict(city, job.districtId, "work") : city.structures.find((item) => item.functions.includes("work"));
  }

  if (action === "relocate") {
    return structureForDistrict(city, citizen.destinationDistrictId) ?? structureForDistrict(city, "homes");
  }

  if (action === "sabotage_rival" || action === "abstract_violent_bounty" || action === "abstract_eliminate_citizen") {
    const target = city.citizens.find((item) => item.id === targetId);
    return target ? structureForDistrict(city, target.districtId) : structureForDistrict(city, citizen.districtId);
  }

  return city.structures.find((item) => item.functions.includes(action));
}

function structureForDistrict(
  city: CityState,
  districtId: string,
  action?: CitizenAction,
): CityStructure | undefined {
  return (
    city.structures.find((item) => item.districtId === districtId && (!action || item.functions.includes(action))) ??
    city.structures.find((item) => item.districtId === districtId)
  );
}

function actionDestinationStructure(
  city: CityState,
  citizen: Citizen,
  action: CitizenAction,
  targetId?: string,
): CityStructure | undefined {
  const structure = structureForAction(city, citizen, action, targetId);

  if (structure) {
    return structure;
  }

  return structureForDistrict(city, destinationForAction(citizen, action, city, targetId));
}

function nearestStructureToPosition(city: CityState, position: Citizen["position"]): CityStructure | undefined {
  return [...city.structures].sort(
    (left, right) => distanceBetween(left.position, position) - distanceBetween(right.position, position),
  )[0];
}

function shortestRoadRoute(
  city: CityState,
  originStructureId: string,
  destinationStructureId: string,
): { distance: number; structureIds: string[] } | undefined {
  if (originStructureId === destinationStructureId) {
    return {
      distance: 0,
      structureIds: [originStructureId],
    };
  }

  const queue = [{ distance: 0, structureId: originStructureId, structureIds: [originStructureId] }];
  const bestDistances = new Map<string, number>([[originStructureId, 0]]);

  while (queue.length > 0) {
    queue.sort((left, right) => left.distance - right.distance);
    const current = queue.shift();

    if (!current) {
      break;
    }

    if (current.structureId === destinationStructureId) {
      return {
        distance: current.distance,
        structureIds: current.structureIds,
      };
    }

    for (const next of connectedRoads(city, current.structureId)) {
      const distance = current.distance + next.distance;
      const knownDistance = bestDistances.get(next.structureId);

      if (knownDistance !== undefined && knownDistance <= distance) {
        continue;
      }

      bestDistances.set(next.structureId, distance);
      queue.push({
        distance,
        structureId: next.structureId,
        structureIds: [...current.structureIds, next.structureId],
      });
    }
  }

  const origin = city.structures.find((structure) => structure.id === originStructureId);
  const destination = city.structures.find((structure) => structure.id === destinationStructureId);

  if (!origin || !destination) {
    return undefined;
  }

  return {
    distance: directStructureDistance(origin, destination),
    structureIds: [origin.id, destination.id],
  };
}

function connectedRoads(city: CityState, structureId: string): Array<{ distance: number; structureId: string }> {
  return (city.roads ?? []).flatMap((road) => {
    if (road.fromStructureId !== structureId && road.toStructureId !== structureId) {
      return [];
    }

    const nextStructureId = road.fromStructureId === structureId ? road.toStructureId : road.fromStructureId;
    const from = city.structures.find((structure) => structure.id === structureId);
    const to = city.structures.find((structure) => structure.id === nextStructureId);

    if (!from || !to) {
      return [];
    }

    return [
      {
        distance: directStructureDistance(from, to) * (road.travelMultiplier ?? 1),
        structureId: nextStructureId,
      },
    ];
  });
}

function directStructureDistance(left?: CityStructure, right?: CityStructure): number {
  if (!left || !right) {
    return 0;
  }

  return distanceBetween(left.position, right.position);
}

function distanceBetween(left: Citizen["position"], right: Citizen["position"]): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function chooseRelocationDistrict(citizen: Citizen, city: CityState): CityState["districts"][number] {
  const districtIndex = Math.abs(hashString(`${citizen.id}:${city.tick}`)) % city.districts.length;
  return city.districts[districtIndex] ?? city.districts[0];
}

function structurePosition(structure: CityStructure, citizenId: string): Citizen["position"] {
  const offset = Math.abs(hashString(`${structure.id}:${citizenId}`));

  return {
    x: clampMap(structure.position.x + ((offset % 7) - 3) * 0.45),
    y: clampMap(structure.position.y + (((offset / 7) % 7) - 3) * 0.45),
  };
}

function districtPosition(districtId: string, citizenId: string): Citizen["position"] {
  const basePositions: Record<string, Citizen["position"]> = {
    homes: { x: 16.2, y: 65.8 },
    farm: { x: 73.0, y: 80.1 },
    market: { x: 83.2, y: 67.1 },
    civic: { x: 49.4, y: 38.8 },
    workshop: { x: 49.5, y: 84.1 },
    hospital: { x: 21.3, y: 20.6 },
    police: { x: 18.0, y: 45.6 },
    prison: { x: 78.2, y: 18.4 },
  };
  const base = basePositions[districtId] ?? { x: 50, y: 50 };
  const offset = Math.abs(hashString(citizenId));

  return {
    x: clampMap(base.x + ((offset % 9) - 4) * 0.65),
    y: clampMap(base.y + (((offset / 9) % 9) - 4) * 0.65),
  };
}

function hashString(value: string): number {
  return [...value].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7);
}

function roundPosition(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampMap(value: number): number {
  return Math.min(92, Math.max(8, roundPosition(value)));
}

function getInstitution(city: CityState, kind: CityState["institutions"][number]["kind"]) {
  return city.institutions.find((institution) => institution.kind === kind);
}

function adjustInstitution(
  city: CityState,
  kind: CityState["institutions"][number]["kind"],
  delta: Partial<Pick<CityState["institutions"][number], "load" | "publicTrust">>,
): void {
  const institution = getInstitution(city, kind);

  if (!institution) {
    return;
  }

  institution.load = Math.max(0, institution.load + (delta.load ?? 0));
  institution.publicTrust = clamp(institution.publicTrust + (delta.publicTrust ?? 0));
}

function assignInstitutionalStatus(
  city: CityState,
  citizen: Citizen,
  status: Citizen["status"],
  institutionKind: CityState["institutions"][number]["kind"],
  untilTick: number,
  reason: string,
): void {
  const institution = getInstitution(city, institutionKind);
  citizen.status = status;
  citizen.institutionId = institution?.id;
  citizen.incapacitatedUntilTick = untilTick;
  citizen.statusReason = reason;

  if (status === "hospitalized" || status === "incapacitated") {
    citizen.recoveryUntilTick = untilTick;
  }

  if (status === "jailed") {
    citizen.sentenceUntilTick = untilTick;
  }
}

function chooseTreatmentTarget(city: CityState, actorId: string, targetId?: string): Citizen | undefined {
  if (targetId) {
    return city.citizens.find((citizen) => citizen.id === targetId && citizen.id !== actorId);
  }

  return city.citizens
    .filter((citizen) => citizen.id !== actorId)
    .sort((left, right) => treatmentNeedScore(right, city.tick) - treatmentNeedScore(left, city.tick))[0];
}

function treatmentNeedScore(citizen: Citizen, tick: number): number {
  if (citizen.status === "hospitalized" || citizen.status === "incapacitated") {
    return 120 + statusEndTick(citizen) - tick;
  }

  return Math.max(0, 55 - citizen.energy) + Math.max(0, 45 - citizen.mood);
}

function treatmentRecoveryGain(city: CityState): number {
  const hospital = getInstitution(city, "hospital");
  return Math.max(2, Math.round(((hospital?.staffing ?? 50) + city.metrics.publicHealth) / 40));
}

function patrolSafetyGain(city: CityState): number {
  const police = getInstitution(city, "police");
  return Math.max(2, Math.round(((police?.staffing ?? 50) + (police?.publicTrust ?? 50)) / 45));
}

function mostUnstableDistrict(city: CityState): CityState["districts"][number] {
  return [...city.districts].sort((left, right) => left.stability - right.stability)[0] ?? city.districts[0];
}

function shouldSentenceCitizen(citizen: Citizen, city: CityState): boolean {
  return (
    citizen.reputation < 40 ||
    (citizen.reputation < 48 && city.metrics.publicSafety < 62) ||
    city.scenario.conflictPressure > 70 ||
    citizen.statusReason === "major public-safety review"
  );
}

function refreshInstitutionLoads(city: CityState): void {
  const hospitalLoad = city.citizens.filter((citizen) => citizen.status === "hospitalized" || citizen.status === "incapacitated").length;
  const prisonLoad = city.citizens.filter((citizen) => citizen.status === "jailed").length;
  const policeLoad = city.citizens.filter((citizen) => citizen.status === "detained").length + city.metrics.openCases;

  city.metrics.hospitalLoad = hospitalLoad;
  city.metrics.prisonLoad = prisonLoad;

  for (const institution of city.institutions) {
    if (institution.kind === "hospital") {
      institution.load = hospitalLoad;
    }

    if (institution.kind === "police") {
      institution.load = policeLoad;
    }

    if (institution.kind === "prison") {
      institution.load = prisonLoad;
    }
  }
}

function createEvent(
  city: CityState,
  citizen: Citizen,
  title: string,
  description: string,
  severity: CityEvent["severity"],
  targetId?: string,
): CityEvent {
  return {
    id: createId("event"),
    tick: city.tick,
    title,
    description,
    severity,
    citizenId: citizen.id,
    targetId,
  };
}

function applyScenarioDrift(city: CityState, events: CityEvent[]): void {
  const averageHostility = city.factions.reduce((sum, faction) => sum + faction.hostility, 0) / city.factions.length;
  const pressure = city.scenario.conflictPressure + averageHostility / 5 - city.scenario.welfareLevel / 8;
  city.metrics.publicSafety = clamp(city.metrics.publicSafety - Math.max(0, Math.round((pressure - 48) / 30)) + Math.round(city.scenario.welfareLevel / 35));
  city.metrics.publicHealth = clamp(
    city.metrics.publicHealth - city.metrics.hospitalLoad + Math.round(city.scenario.welfareLevel / 28),
  );

  if (pressure > 70) {
    for (const district of city.districts) {
      district.stability = clamp(district.stability - 1);
    }
  }

  const nextConflictState = deriveConflictState(pressure);
  if (nextConflictState !== city.scenario.conflictState) {
    city.scenario.conflictState = nextConflictState;
    events.push({
      id: createId("event"),
      tick: city.tick,
      title: "Conflict state changed",
      description: `Faction tension shifts the city into ${nextConflictState.replace(/_/g, " ")}.`,
      severity: nextConflictState === "war" ? "risk" : "warning",
    });
  }

  if (city.scenario.economyModel === "pure_capitalism" && city.tick % 6 === 0) {
    const richest = [...city.citizens].sort((left, right) => right.money - left.money)[0];
    const poorest = [...city.citizens].sort((left, right) => left.money - right.money)[0];

    if (richest && poorest && richest.id !== poorest.id && richest.money - poorest.money > 28) {
      events.push({
        id: createId("event"),
        tick: city.tick,
        title: "Inequality pressure",
        description: "Pure market incentives widen the wealth gap and faction hostility edges upward.",
        severity: "warning",
      });

      for (const faction of city.factions) {
        faction.hostility = clamp(faction.hostility + 2);
      }
    }
  }
}

function adjustFaction(
  city: CityState,
  factionId: string | undefined,
  delta: Partial<Pick<CityState["factions"][number], "funds" | "influence" | "hostility">>,
): void {
  const faction = city.factions.find((item) => item.id === factionId);

  if (!faction) {
    return;
  }

  faction.funds = Math.max(0, Math.round(faction.funds + (delta.funds ?? 0)));
  faction.influence = clamp(faction.influence + (delta.influence ?? 0));
  faction.hostility = clamp(faction.hostility + (delta.hostility ?? 0));
}

function adjustAllFactions(
  city: CityState,
  delta: Partial<Pick<CityState["factions"][number], "influence" | "hostility">>,
): void {
  for (const faction of city.factions) {
    faction.influence = clamp(faction.influence + (delta.influence ?? 0));
    faction.hostility = clamp(faction.hostility + (delta.hostility ?? 0));
  }
}

function adjustDistrictStability(city: CityState, districtId: string, delta: number): void {
  const district = city.districts.find((item) => item.id === districtId);

  if (district) {
    district.stability = clamp(district.stability + delta);
  }
}

function marketInstability(city: CityState): number {
  if (city.scenario.economyModel !== "pure_capitalism") {
    return 2;
  }

  return Math.max(3, Math.round(city.scenario.marketFreedom / 20));
}

function deriveConflictState(pressure: number): CityState["scenario"]["conflictState"] {
  if (pressure >= 88) {
    return "war";
  }

  if (pressure >= 72) {
    return "civil_conflict";
  }

  if (pressure >= 42) {
    return "unrest";
  }

  return "peace";
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function cloneCity(city: CityState): CityState {
  return JSON.parse(JSON.stringify(city)) as CityState;
}

function normalizeTasks(city: CityState): CitizenTask[] {
  if (!Array.isArray(city.tasks)) {
    return [];
  }

  return city.tasks.map((task) => {
    const legacyTask = task as Partial<CitizenTask>;
    const baseDurationTicks = legacyTask.baseDurationTicks ?? legacyTask.durationTicks ?? taskDurationTicks(task.action);
    const travelDurationTicks = legacyTask.travelDurationTicks ?? 0;
    const workStartsAtTick = legacyTask.workStartsAtTick ?? task.startedAtTick + travelDurationTicks;

    return {
      ...task,
      baseDurationTicks,
      travelDurationTicks,
      travelDistance: legacyTask.travelDistance ?? 0,
      workStartsAtTick,
      routeStructureIds: legacyTask.routeStructureIds ?? [],
      durationTicks: legacyTask.durationTicks ?? baseDurationTicks + travelDurationTicks,
    };
  });
}
