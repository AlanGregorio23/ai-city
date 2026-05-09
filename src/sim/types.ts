export type ResourceKey = "food" | "materials" | "credits";

export type JobKind = "farmer" | "baker" | "builder" | "medic" | "trader" | "officer";

export type CitizenAction =
  | "work"
  | "rest"
  | "buy_food"
  | "help_neighbor"
  | "socialize"
  | "relocate"
  | "study"
  | "mediate_conflict"
  | "report_crime"
  | "police_patrol"
  | "arrest_citizen"
  | "hospital_treatment"
  | "exploit_market"
  | "faction_campaign"
  | "sabotage_rival"
  | "abstract_violent_bounty"
  | "abstract_eliminate_citizen";

export type Alignment = "principled" | "balanced" | "selfish" | "ruthless";

export type Trait =
  | "curious"
  | "disciplined"
  | "generous"
  | "greedy"
  | "impulsive"
  | "secretive";

export interface Personality {
  morality: number;
  empathy: number;
  ambition: number;
  risk: number;
  traits: Trait[];
}

export interface Citizen {
  id: string;
  name: string;
  role: JobKind;
  districtId: string;
  destinationDistrictId: string;
  factionId?: string;
  money: number;
  hunger: number;
  energy: number;
  mood: number;
  reputation: number;
  status: "active" | "incapacitated" | "hospitalized" | "detained" | "jailed";
  incapacitatedUntilTick?: number;
  sentenceUntilTick?: number;
  recoveryUntilTick?: number;
  institutionId?: string;
  statusReason?: string;
  position: {
    x: number;
    y: number;
  };
  personality: Personality;
  currentAction: CitizenAction;
}

export interface District {
  id: string;
  name: string;
  kind: "residential" | "work" | "market" | "civic" | "farm" | "hospital" | "police" | "prison";
  stability: number;
}

export type InstitutionKind = "civic" | "hospital" | "police" | "prison";

export interface CivicInstitution {
  id: string;
  name: string;
  kind: InstitutionKind;
  districtId: string;
  capacity: number;
  staffing: number;
  publicTrust: number;
  load: number;
}

export interface CityStructure {
  id: string;
  name: string;
  kind: District["kind"];
  districtId: string;
  position: {
    x: number;
    y: number;
  };
  functions: CitizenAction[];
}

export interface CityMetrics {
  publicSafety: number;
  publicHealth: number;
  crimeReports: number;
  openCases: number;
  hospitalLoad: number;
  prisonLoad: number;
}

export type EconomyModel = "mixed_market" | "pure_capitalism" | "civic_cooperative";

export type ConflictState = "peace" | "unrest" | "civil_conflict" | "war";

export interface SocioEconomicScenario {
  id: string;
  name: string;
  description: string;
  economyModel: EconomyModel;
  conflictState: ConflictState;
  marketFreedom: number;
  welfareLevel: number;
  conflictPressure: number;
}

export interface Faction {
  id: string;
  name: string;
  agenda: "labor" | "capital" | "civic" | "underground";
  funds: number;
  influence: number;
  hostility: number;
}

export interface Job {
  id: string;
  name: string;
  kind: JobKind;
  districtId: string;
  wage: number;
  energyCost: number;
  produces: Partial<Record<ResourceKey, number>>;
}

export interface CityEvent {
  id: string;
  tick: number;
  title: string;
  description: string;
  severity: "info" | "good" | "warning" | "risk";
  citizenId?: string;
  targetId?: string;
}

export interface CityState {
  tick: number;
  day: number;
  hour: number;
  resources: Record<ResourceKey, number>;
  scenario: SocioEconomicScenario;
  districts: District[];
  structures: CityStructure[];
  institutions: CivicInstitution[];
  metrics: CityMetrics;
  factions: Faction[];
  jobs: Job[];
  citizens: Citizen[];
  events: CityEvent[];
}

export interface CitizenActionProposal {
  citizenId: string;
  action: CitizenAction;
  targetId?: string;
  reason: string;
}

export interface ProposalValidation {
  valid: boolean;
  reasons: string[];
  warnings: string[];
}
