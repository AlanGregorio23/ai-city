import {
  Activity,
  Banknote,
  Clock3,
  FastForward,
  Factory,
  HeartHandshake,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OllamaProvider } from "../ai/ollama";
import {
  advanceCity,
  applyCitizenActionProposal,
  deriveAlignment,
  updateCitizenPersonality,
  validateCitizenActionProposal,
} from "../sim/engine";
import { initialCityState } from "../sim/seed";
import type {
  Citizen,
  CitizenAction,
  CitizenActionProposal,
  CityEvent,
  CityState,
  Personality,
  ProposalValidation,
  ResourceKey,
} from "../sim/types";

type AppView = "overview" | "map" | "citizens" | "events";

const resourceLabels: Record<ResourceKey, string> = {
  food: "Food",
  materials: "Materials",
  credits: "Credits",
};

const actionOptions: { action: CitizenAction; label: string; needsTarget?: boolean }[] = [
  { action: "work", label: "Work" },
  { action: "rest", label: "Rest" },
  { action: "buy_food", label: "Buy food" },
  { action: "help_neighbor", label: "Help neighbor" },
  { action: "socialize", label: "Socialize" },
  { action: "relocate", label: "Relocate" },
  { action: "study", label: "Study" },
  { action: "mediate_conflict", label: "Mediate conflict" },
  { action: "report_crime", label: "Report crime" },
  { action: "police_patrol", label: "Police patrol" },
  { action: "arrest_citizen", label: "Arrest citizen", needsTarget: true },
  { action: "hospital_treatment", label: "Hospital treatment", needsTarget: true },
  { action: "exploit_market", label: "Exploit market" },
  { action: "faction_campaign", label: "Faction campaign" },
  { action: "sabotage_rival", label: "Sabotage rival", needsTarget: true },
  { action: "abstract_eliminate_citizen", label: "Eliminate (severe)", needsTarget: true },
];

const speedOptions = [
  { label: "6x", value: 6, intervalMs: 10000 },
  { label: "10x", value: 10, intervalMs: 6000 },
];

const mapAspectRatio = 1672 / 941;
const mapInverseAspectRatio = 941 / 1672;

const aiProvider = new OllamaProvider();

export function App() {
  const [city, setCity] = useState<CityState>(initialCityState);
  const [selectedCitizenId, setSelectedCitizenId] = useState(city.citizens[0]?.id ?? "");
  const [activeView, setActiveView] = useState<AppView>(getInitialAppView);
  const [mapZoom, setMapZoom] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autoRun, setAutoRun] = useState(true);
  const [timeSpeed, setTimeSpeed] = useState(10);
  const selectedCitizen = city.citizens.find((citizen) => citizen.id === selectedCitizenId) ?? city.citizens[0];
  const templateView = getTemplateView();
  const selectedSpeed = speedOptions.find((option) => option.value === timeSpeed) ?? speedOptions[1];

  const averageMood = useMemo(() => {
    const total = city.citizens.reduce((sum, citizen) => sum + citizen.mood, 0);
    return Math.round(total / city.citizens.length);
  }, [city.citizens]);

  const averageStability = useMemo(() => {
    const total = city.districts.reduce((sum, district) => sum + district.stability, 0);
    return Math.round(total / city.districts.length);
  }, [city.districts]);

  useEffect(() => {
    if (!autoRun) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCity((current) => advanceCity(current));
    }, selectedSpeed.intervalMs);

    return () => window.clearInterval(timer);
  }, [autoRun, selectedSpeed.intervalMs]);

  function handleAdvance() {
    setCity((current) => advanceCity(current));
  }

  function handleApplyCitizenAction(action: CitizenAction, targetId?: string) {
    if (!selectedCitizen) {
      return;
    }

    setCity((current) =>
      applyCitizenActionProposal(current, {
        citizenId: selectedCitizen.id,
        action,
        targetId,
        reason: "Manual player choice from citizen controls.",
      }),
    );
  }

  function handleApplyCitizenProposal(proposal: CitizenActionProposal) {
    setCity((current) => applyCitizenActionProposal(current, proposal));
  }

  function handlePersonalityChange(key: keyof Personality, value: number) {
    if (!selectedCitizen || key === "traits") {
      return;
    }

    setCity((current) => updateCitizenPersonality(current, selectedCitizen.id, key, value));
  }

  function handleZoomChange(value: number) {
    setMapZoom(clampMapZoom(value));
  }

  if (templateView === "citizen") {
    return <CitizenDetailTemplate citizen={city.citizens[3] ?? selectedCitizen} />;
  }

  if (templateView === "proposal") {
    const templateCitizen = city.citizens[1] ?? selectedCitizen;

    return (
      <AiProposalTemplate
        city={city}
        citizen={templateCitizen}
        onApplyCitizenAction={(action, targetId) =>
          setCity((current) =>
            applyCitizenActionProposal(current, {
              citizenId: templateCitizen.id,
              action,
              targetId,
              reason: "Manual player choice from citizen controls.",
            }),
          )
        }
        onApplyCitizenProposal={handleApplyCitizenProposal}
      />
    );
  }

  if (templateView === "assets") {
    return <AssetsTemplate citizens={city.citizens} />;
  }

  if (activeView === "map") {
    return (
      <FullscreenMapView
        city={city}
        drawerOpen={drawerOpen}
        mapZoom={mapZoom}
        autoRun={autoRun}
        onAdvance={handleAdvance}
        onAutoRunChange={setAutoRun}
        onDrawerOpenChange={setDrawerOpen}
        onSelectCitizen={setSelectedCitizenId}
        onSpeedChange={setTimeSpeed}
        onViewChange={setActiveView}
        onZoomChange={handleZoomChange}
        selectedCitizen={selectedCitizen}
        selectedCitizenId={selectedCitizenId}
        timeSpeed={timeSpeed}
      />
    );
  }

  return (
    <main className="shell app-shell">
      <header className="topbar app-topbar">
        <div>
          <p className="eyebrow">Local simulation MVP</p>
          <h1>AI City</h1>
        </div>

        <div className="topbar__actions">
          <div className="time-pill">
            <Clock3 size={18} />
            Day {city.day}, {city.hour.toString().padStart(2, "0")}:00
          </div>
          <TimeControls
            autoRun={autoRun}
            onAdvance={handleAdvance}
            onAutoRunChange={setAutoRun}
            onSpeedChange={setTimeSpeed}
            timeSpeed={timeSpeed}
          />
        </div>
      </header>

      <nav className="view-tabs" aria-label="Main views">
        <ViewTab active={activeView === "overview"} icon={<LayoutDashboard size={17} />} label="Overview" onClick={() => setActiveView("overview")} />
        <ViewTab active={false} icon={<MapIcon size={17} />} label="Map" onClick={() => setActiveView("map")} />
        <ViewTab active={activeView === "citizens"} icon={<UsersRound size={17} />} label="Citizens" onClick={() => setActiveView("citizens")} />
        <ViewTab active={activeView === "events"} icon={<Activity size={17} />} label="Events" onClick={() => setActiveView("events")} />
      </nav>

      {activeView === "overview" ? (
        <OverviewView
          averageMood={averageMood}
          averageStability={averageStability}
          city={city}
          onPersonalityChange={handlePersonalityChange}
          onSelectCitizen={setSelectedCitizenId}
          onViewChange={setActiveView}
          selectedCitizen={selectedCitizen}
          selectedCitizenId={selectedCitizenId}
        />
      ) : null}

      {activeView === "citizens" ? (
        <CitizensView
          city={city}
          onPersonalityChange={handlePersonalityChange}
          onSelectCitizen={setSelectedCitizenId}
          onApplyCitizenAction={handleApplyCitizenAction}
          onApplyCitizenProposal={handleApplyCitizenProposal}
          selectedCitizen={selectedCitizen}
          selectedCitizenId={selectedCitizenId}
        />
      ) : null}

      {activeView === "events" ? (
        <EventsView averageMood={averageMood} averageStability={averageStability} city={city} />
      ) : null}
    </main>
  );
}

function FullscreenMapView({
  city,
  drawerOpen,
  mapZoom,
  autoRun,
  onAdvance,
  onAutoRunChange,
  onDrawerOpenChange,
  onSpeedChange,
  onSelectCitizen,
  onViewChange,
  onZoomChange,
  selectedCitizen,
  selectedCitizenId,
  timeSpeed,
}: {
  city: CityState;
  drawerOpen: boolean;
  mapZoom: number;
  autoRun: boolean;
  onAdvance: () => void;
  onAutoRunChange: (running: boolean) => void;
  onDrawerOpenChange: (open: boolean) => void;
  onSpeedChange: (speed: number) => void;
  onSelectCitizen: (citizenId: string) => void;
  onViewChange: (view: AppView) => void;
  onZoomChange: (value: number) => void;
  selectedCitizen: Citizen;
  selectedCitizenId: string;
  timeSpeed: number;
}) {
  function navigate(view: AppView) {
    onViewChange(view);
    onDrawerOpenChange(false);
  }

  return (
    <main className="map-screen">
      <CityMap
        city={city}
        onSelectCitizen={onSelectCitizen}
        selectedCitizenId={selectedCitizenId}
        variant="fullscreen"
        onZoomChange={onZoomChange}
        zoom={mapZoom}
      />

      <div className="map-hud map-hud--left">
        <button className="floating-button" type="button" onClick={() => onDrawerOpenChange(true)} title="Open navigation">
          <Menu size={19} />
        </button>
        <div className="map-title-chip">
          <span>AI City</span>
          <strong>Central grid</strong>
        </div>
      </div>

      <div className="map-hud map-hud--right">
        <div className="time-pill map-time-pill">
          <Clock3 size={18} />
          Day {city.day}, {city.hour.toString().padStart(2, "0")}:00
        </div>
        <TimeControls
          autoRun={autoRun}
          compact
          onAdvance={onAdvance}
          onAutoRunChange={onAutoRunChange}
          onSpeedChange={onSpeedChange}
          timeSpeed={timeSpeed}
        />
      </div>

      <div className="map-zoom-floating">
        <button className="icon-button" type="button" onClick={() => onZoomChange(mapZoom - 0.2)} title="Zoom out">
          <Minus size={16} />
        </button>
        <input
          aria-label="Zoom"
          max="3"
          min="1"
          step="0.1"
          type="range"
          value={mapZoom}
          onChange={(event) => onZoomChange(Number(event.target.value))}
        />
        <button className="icon-button" type="button" onClick={() => onZoomChange(mapZoom + 0.2)} title="Zoom in">
          <Plus size={16} />
        </button>
        <button className="icon-button" type="button" onClick={() => onZoomChange(1)} title="Reset zoom">
          <RotateCcw size={16} />
        </button>
        <span>{Math.round(mapZoom * 100)}%</span>
      </div>

      <aside className="selected-citizen-card" aria-label="Selected citizen">
        <div className="selected-citizen-card__heading">
          <div>
            <p className="eyebrow">Selected citizen</p>
            <h2>{selectedCitizen.name}</h2>
          </div>
          <span className={`alignment alignment--${deriveAlignment(selectedCitizen.personality)}`}>
            {deriveAlignment(selectedCitizen.personality)}
          </span>
        </div>
        <CitizenSummary citizen={selectedCitizen} />
        <button className="secondary-button full-width-button" type="button" onClick={() => navigate("citizens")}>
          <UsersRound size={17} />
          Open profile
        </button>
      </aside>

      <div className={`drawer-backdrop ${drawerOpen ? "is-open" : ""}`} onClick={() => onDrawerOpenChange(false)} />
      <nav className={`map-drawer ${drawerOpen ? "is-open" : ""}`} aria-label="Navigation drawer">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Navigation</p>
            <h2>AI City</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => onDrawerOpenChange(false)} title="Close navigation">
            <X size={17} />
          </button>
        </div>

        <div className="drawer-nav-list">
          <button className="drawer-nav-item is-active" type="button" onClick={() => navigate("map")}>
            <MapIcon size={18} />
            Map
          </button>
          <button className="drawer-nav-item" type="button" onClick={() => navigate("overview")}>
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button className="drawer-nav-item" type="button" onClick={() => navigate("citizens")}>
            <UsersRound size={18} />
            Citizens
          </button>
          <button className="drawer-nav-item" type="button" onClick={() => navigate("events")}>
            <Activity size={18} />
            Events
          </button>
        </div>

        <section className="drawer-section">
          <PanelTitle eyebrow="Resources" title="Economy" />
          <ResourceGrid city={city} />
        </section>

        <section className="drawer-section">
          <PanelTitle eyebrow="Districts" title="Legend" />
          <DistrictList city={city} />
        </section>

        <section className="drawer-section">
          <PanelTitle eyebrow="Structures" title="Functions" />
          <StructureList city={city} />
        </section>

        <section className="drawer-section">
          <PanelTitle eyebrow="Institutions" title="Civic services" />
          <InstitutionList city={city} />
        </section>
      </nav>
    </main>
  );
}

function OverviewView({
  averageMood,
  averageStability,
  city,
  onPersonalityChange,
  onSelectCitizen,
  onViewChange,
  selectedCitizen,
  selectedCitizenId,
}: {
  averageMood: number;
  averageStability: number;
  city: CityState;
  onPersonalityChange: (key: keyof Personality, value: number) => void;
  onSelectCitizen: (citizenId: string) => void;
  onViewChange: (view: AppView) => void;
  selectedCitizen: Citizen;
  selectedCitizenId: string;
}) {
  return (
    <section className="overview-grid">
      <section className="panel overview-map-panel" aria-label="City map preview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Live map</p>
            <h2>Central grid</h2>
          </div>
          <button className="secondary-button" type="button" onClick={() => onViewChange("map")}>
            <MapIcon size={17} />
            Open map
          </button>
        </div>

        <CityMap
          city={city}
          onSelectCitizen={onSelectCitizen}
          selectedCitizenId={selectedCitizenId}
          variant="preview"
          zoom={1}
        />
      </section>

      <aside className="panel overview-inspector-panel" aria-label="Selected citizen">
        <CitizenInspector citizen={selectedCitizen} onPersonalityChange={onPersonalityChange} />
      </aside>

      <section className="panel city-status-panel" aria-label="City status">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">City status</p>
            <h2>Current health</h2>
          </div>
          <span className="status-chip">Mood {averageMood}%</span>
        </div>
        <CityInfo averageMood={averageMood} averageStability={averageStability} city={city} />
        <StructureList city={city} />
        <InstitutionList city={city} />
      </section>

      <section className="panel economy-panel" aria-label="Economy overview">
        <PanelTitle eyebrow="Economy" icon={<Banknote size={20} />} title="Resources" />
        <ResourceGrid city={city} />
      </section>

      <section className="panel scenario-panel" aria-label="Scenario">
        <PanelTitle eyebrow="Scenario" icon={<Activity size={20} />} title={city.scenario.name} />
        <ScenarioInfo city={city} />
      </section>

      <section className="panel jobs-panel" aria-label="Factions">
        <PanelTitle eyebrow="Factions" icon={<Factory size={20} />} title="Power blocs" />
        <FactionList city={city} />
      </section>

      <section className="panel log-panel" aria-label="Recent events">
        <PanelTitle eyebrow="City memory" icon={<HeartHandshake size={20} />} title="Recent events" />
        <EventList events={city.events.slice(0, 4)} />
      </section>
    </section>
  );
}

function CitizensView({
  city,
  onApplyCitizenAction,
  onApplyCitizenProposal,
  onPersonalityChange,
  onSelectCitizen,
  selectedCitizen,
  selectedCitizenId,
}: {
  city: CityState;
  onApplyCitizenAction: (action: CitizenAction, targetId?: string) => void;
  onApplyCitizenProposal: (proposal: CitizenActionProposal) => void;
  onPersonalityChange: (key: keyof Personality, value: number) => void;
  onSelectCitizen: (citizenId: string) => void;
  selectedCitizen: Citizen;
  selectedCitizenId: string;
}) {
  return (
    <section className="citizens-page-grid">
      <aside className="panel citizen-list-panel">
        <PanelTitle eyebrow="Citizens" title="Population" />
        <CitizenList citizens={city.citizens} onSelectCitizen={onSelectCitizen} selectedCitizenId={selectedCitizenId} />
      </aside>

      <section className="panel citizen-profile-panel">
        <div className="citizen-profile-header">
          <div className="portrait-card portrait-card--small">
            <span>{selectedCitizen.name.slice(0, 1)}</span>
          </div>
          <div>
            <p className="eyebrow">{selectedCitizen.role}</p>
            <h2>{selectedCitizen.name}</h2>
            <span className={`alignment alignment--${deriveAlignment(selectedCitizen.personality)}`}>
              {deriveAlignment(selectedCitizen.personality)}
            </span>
          </div>
        </div>

        <div className="citizen-detail-grid">
          <CitizenVitals citizen={selectedCitizen} />
          <section className="personality-section" aria-label="Personality settings">
            <PanelTitle eyebrow="Settings" title="Personality" />
            <PersonalitySliders citizen={selectedCitizen} onPersonalityChange={onPersonalityChange} />
            <TraitRow citizen={selectedCitizen} />
          </section>
        </div>
      </section>

      <section className="panel citizen-notes-panel">
        <PanelTitle eyebrow="Controls" title="Citizen choice" />
        <CitizenActionControls
          city={city}
          citizen={selectedCitizen}
          onApplyCitizenAction={onApplyCitizenAction}
          onApplyCitizenProposal={onApplyCitizenProposal}
        />
      </section>

      <section className="panel citizen-behavior-panel">
        <PanelTitle eyebrow="Behavior" title="Decision profile" />
        <BehaviorProfile citizen={selectedCitizen} />
      </section>
    </section>
  );
}

function EventsView({
  averageMood,
  averageStability,
  city,
}: {
  averageMood: number;
  averageStability: number;
  city: CityState;
}) {
  return (
    <section className="events-page-grid">
      <section className="panel event-timeline-panel">
        <PanelTitle eyebrow="Timeline" icon={<Activity size={20} />} title="City events" />
        <EventList events={city.events} />
      </section>

      <aside className="events-side-stack">
        <section className="panel">
          <PanelTitle eyebrow="Scenario" title={city.scenario.name} />
          <ScenarioInfo city={city} />
        </section>

        <section className="panel">
          <PanelTitle eyebrow="Information" title="City snapshot" />
          <CityInfo averageMood={averageMood} averageStability={averageStability} city={city} />
        </section>

        <section className="panel">
          <PanelTitle eyebrow="Institutions" title="Civic services" />
          <InstitutionList city={city} />
        </section>

        <section className="panel">
          <PanelTitle eyebrow="Factions" title="Influence" />
          <FactionList city={city} />
        </section>

        <section className="panel">
          <PanelTitle eyebrow="Economy" title="Resources" />
          <ResourceGrid city={city} />
        </section>

        <section className="panel">
          <PanelTitle eyebrow="Jobs" title="Workplaces" />
          <JobsList city={city} />
        </section>
      </aside>
    </section>
  );
}

function TimeControls({
  autoRun,
  compact = false,
  onAdvance,
  onAutoRunChange,
  onSpeedChange,
  timeSpeed,
}: {
  autoRun: boolean;
  compact?: boolean;
  onAdvance: () => void;
  onAutoRunChange: (running: boolean) => void;
  onSpeedChange: (speed: number) => void;
  timeSpeed: number;
}) {
  return (
    <div className={`time-controls ${compact ? "time-controls--compact" : ""}`}>
      <button className="primary-button" type="button" onClick={() => onAutoRunChange(!autoRun)}>
        {autoRun ? <Pause size={18} /> : <Play size={18} />}
        {autoRun ? "Pause" : "Auto"}
      </button>
      <div className="speed-segment" aria-label="Simulation speed">
        {speedOptions.map((option) => (
          <button
            className={timeSpeed === option.value ? "is-active" : ""}
            key={option.value}
            type="button"
            onClick={() => onSpeedChange(option.value)}
          >
            <FastForward size={14} />
            {option.label}
          </button>
        ))}
      </div>
      <button className="secondary-button" type="button" onClick={onAdvance}>
        <Sparkles size={18} />
        Step 1h
      </button>
    </div>
  );
}

function ViewTab({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`view-tab ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function CitizenActionControls({
  city,
  citizen,
  onApplyCitizenAction,
  onApplyCitizenProposal,
}: {
  city: CityState;
  citizen: Citizen;
  onApplyCitizenAction: (action: CitizenAction, targetId?: string) => void;
  onApplyCitizenProposal: (proposal: CitizenActionProposal) => void;
}) {
  const firstTarget = city.citizens.find((item) => item.id !== citizen.id)?.id ?? "";
  const [selectedAction, setSelectedAction] = useState<CitizenAction>("work");
  const [targetId, setTargetId] = useState(firstTarget);
  const [aiProposal, setAiProposal] = useState<CitizenActionProposal | null>(null);
  const [aiError, setAiError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const option = actionOptions.find((item) => item.action === selectedAction);
  const effectiveTargetId = option?.needsTarget ? targetId : undefined;
  const validation = useMemo(
    () =>
      validateCitizenActionProposal(city, {
        citizenId: citizen.id,
        action: selectedAction,
        targetId: effectiveTargetId,
        reason: "Manual player choice from citizen controls.",
      }),
    [city, citizen.id, effectiveTargetId, selectedAction],
  );
  const aiValidation = useMemo(
    () => (aiProposal ? validateCitizenActionProposal(city, aiProposal) : undefined),
    [aiProposal, city],
  );
  const aiProposalMatchesCitizen = aiProposal?.citizenId === citizen.id;
  const canApplyAiProposal = Boolean(aiProposal && aiValidation?.valid && aiProposalMatchesCitizen && !aiLoading);
  const disabled = !validation.valid;

  useEffect(() => {
    if (targetId && targetId !== citizen.id) {
      return;
    }

    setTargetId(firstTarget);
  }, [citizen.id, firstTarget, targetId]);

  useEffect(() => {
    setAiProposal(null);
    setAiError("");
    setAiApplied(false);
  }, [citizen.id]);

  async function handleAskAi() {
    setAiLoading(true);
    setAiError("");
    setAiApplied(false);

    try {
      const proposal = await aiProvider.proposeCitizenAction(city, citizen.id);
      setAiProposal(proposal);
    } catch (error) {
      setAiProposal(null);
      setAiError(error instanceof Error ? error.message : "Ollama request failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleApplyAiProposal() {
    if (!aiProposal || !canApplyAiProposal) {
      return;
    }

    onApplyCitizenProposal(aiProposal);
    setAiApplied(true);
  }

  return (
    <div className="action-controls">
      <section className="manual-action-card" aria-label="Manual action">
        <label className="field-control">
          <span>Action</span>
          <select value={selectedAction} onChange={(event) => setSelectedAction(event.target.value as CitizenAction)}>
            {actionOptions.map((item) => (
              <option key={item.action} value={item.action}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {option?.needsTarget ? (
          <label className="field-control">
            <span>Target</span>
            <select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              {city.citizens
                .filter((item) => item.id !== citizen.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        <button
          className="primary-button full-width-button"
          disabled={disabled}
          type="button"
          onClick={() => onApplyCitizenAction(selectedAction, effectiveTargetId)}
        >
          <ShieldAlert size={18} />
          Apply validated action
        </button>

        <ValidationMessage validation={validation} />
      </section>

      <section className="ai-action-card" aria-label="AI action proposal">
        <div className="ai-action-header">
          <div>
            <p className="eyebrow">Local AI</p>
            <h3>Ollama proposal</h3>
          </div>
          <span className="status-chip">validated before apply</span>
        </div>

        <button className="secondary-button full-width-button" disabled={aiLoading} type="button" onClick={handleAskAi}>
          <Sparkles size={18} />
          {aiLoading ? "Asking Ollama..." : "Ask AI"}
        </button>

        {aiError ? (
          <div className="validation-message is-risk">
            <strong>Ollama unavailable or invalid response</strong>
            <span>{aiError}</span>
          </div>
        ) : null}

        {aiProposal ? (
          <div className="ai-proposal-review">
            <div className="ai-proposal-reason">
              <span>Reason</span>
              <p>{aiProposal.reason}</p>
            </div>

            <pre className="proposal-json">
              <code>{JSON.stringify(aiProposal, null, 2)}</code>
            </pre>

            {aiValidation ? <ValidationMessage validation={aiValidation} /> : null}

            {!aiProposalMatchesCitizen ? (
              <div className="validation-message is-risk">
                <strong>Proposal blocked</strong>
                <span>The AI proposal does not match the selected citizen.</span>
              </div>
            ) : null}

            {aiApplied ? (
              <div className="validation-message is-good">
                <strong>Applied through simulation rules</strong>
                <span>The AI proposal was passed to the deterministic apply function.</span>
              </div>
            ) : null}

            <button
              className="primary-button full-width-button"
              disabled={!canApplyAiProposal}
              type="button"
              onClick={handleApplyAiProposal}
            >
              <ShieldAlert size={18} />
              Apply AI proposal
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ValidationMessage({ validation }: { validation: ProposalValidation }) {
  const messages = [...validation.reasons, ...validation.warnings];

  return (
    <div className={`validation-message ${validation.valid ? "is-good" : "is-risk"}`}>
      <strong>{validation.valid ? "Valid deterministic action" : "Rule check blocked"}</strong>
      {messages.length === 0 ? <span>No rule warnings.</span> : null}
      {messages.map((message) => (
        <span key={message}>{message}</span>
      ))}
    </div>
  );
}

function CityMap({
  city,
  onZoomChange,
  onSelectCitizen,
  selectedCitizenId,
  variant,
  zoom,
}: {
  city: CityState;
  onZoomChange?: (value: number) => void;
  onSelectCitizen: (citizenId: string) => void;
  selectedCitizenId: string;
  variant: "preview" | "fullscreen";
  zoom: number;
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    scrollLeft: number;
    scrollTop: number;
    x: number;
    y: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isFullscreen = variant === "fullscreen";
  const zoomPercent = zoom * 100;
  const zoomLayerStyle = isFullscreen
    ? {
        height: `max(${zoomPercent}dvh, ${zoomPercent * mapInverseAspectRatio}vw)`,
        width: `max(${zoomPercent}vw, ${zoomPercent * mapAspectRatio}dvh)`,
      }
    : { height: `${zoomPercent}%`, width: `${zoomPercent}%` };

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;

    if (!isFullscreen || target?.closest("button")) {
      return;
    }

    const map = mapRef.current;

    if (!map) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      scrollLeft: map.scrollLeft,
      scrollTop: map.scrollTop,
      x: event.clientX,
      y: event.clientY,
    };
    map.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const map = mapRef.current;

    if (!drag || !map || event.pointerId !== drag.pointerId) {
      return;
    }

    map.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    map.scrollTop = drag.scrollTop - (event.clientY - drag.y);
  }

  function handlePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const map = mapRef.current;

    if (map && dragRef.current?.pointerId === event.pointerId) {
      map.releasePointerCapture(event.pointerId);
    }

    dragRef.current = null;
    setIsDragging(false);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!isFullscreen || !onZoomChange) {
      return;
    }

    event.preventDefault();

    const map = mapRef.current;

    if (!map) {
      return;
    }

    const rect = map.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const ratioX = (map.scrollLeft + offsetX) / Math.max(1, map.scrollWidth);
    const ratioY = (map.scrollTop + offsetY) / Math.max(1, map.scrollHeight);
    const nextZoom = clampMapZoom(zoom - event.deltaY * 0.0015);

    if (nextZoom === zoom) {
      return;
    }

    onZoomChange(nextZoom);
    window.requestAnimationFrame(() => {
      map.scrollLeft = ratioX * map.scrollWidth - offsetX;
      map.scrollTop = ratioY * map.scrollHeight - offsetY;
    });
  }

  return (
    <div
      className={`city-map city-map--${variant} ${isDragging ? "is-dragging" : ""}`}
      ref={mapRef}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerEnd}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onWheel={handleWheel}
    >
      <div className="map-zoom-layer" style={zoomLayerStyle}>
        <CityMapArtwork />
        {city.structures.map((structure) => (
          <div
            className={`structure-marker structure-marker--${structure.kind}`}
            key={structure.id}
            style={mapPointStyle(structure.position)}
            title={`${structure.name}: ${structure.functions.map(formatAction).join(", ")}`}
          >
            {structure.kind.slice(0, 1).toUpperCase()}
            <span>
              <strong>{structure.name}</strong>
              <small>{structure.functions.map(formatAction).join(" / ")}</small>
            </span>
          </div>
        ))}
        {city.citizens.map((citizen, index) => (
          <button
            className={`citizen-marker citizen-marker--${citizen.status} ${
              citizen.id === selectedCitizenId ? "is-selected" : ""
            } ${citizen.status !== "active" ? "is-incapacitated" : ""}`}
            key={citizen.id}
            style={markerPosition(citizen, index)}
            type="button"
            onClick={() => onSelectCitizen(citizen.id)}
            title={`${citizen.name}: ${formatAction(citizen.currentAction)}; ${formatCitizenStatus(citizen)}`}
          >
            {citizen.name.slice(0, 1)}
            <span>{citizen.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function getTemplateView() {
  return new URLSearchParams(window.location.search).get("view");
}

function getInitialAppView(): AppView {
  const page = new URLSearchParams(window.location.search).get("page");

  if (page === "overview" || page === "map" || page === "citizens" || page === "events") {
    return page;
  }

  return "map";
}

function CityMapArtwork() {
  return <img className="city-art" src="/city-map-forest.png" alt="Modern city map surrounded by forest" />;
}

function PanelTitle({
  eyebrow,
  icon,
  title,
}: {
  eyebrow: string;
  icon?: React.ReactNode;
  title: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {icon}
    </div>
  );
}

function ResourceGrid({ city }: { city: CityState }) {
  return (
    <div className="resource-grid">
      {(Object.keys(city.resources) as ResourceKey[]).map((key) => (
        <div className="resource-card" key={key}>
          <span>{resourceLabels[key]}</span>
          <strong>{city.resources[key]}</strong>
        </div>
      ))}
    </div>
  );
}

function JobsList({ city, limit }: { city: CityState; limit?: number }) {
  const jobs = typeof limit === "number" ? city.jobs.slice(0, limit) : city.jobs;

  return (
    <div className="job-list">
      {jobs.map((job) => (
        <div className="job-row" key={job.id}>
          <div>
            <strong>{job.name}</strong>
            <span>{job.kind}</span>
          </div>
          <span>{job.wage} cr</span>
        </div>
      ))}
    </div>
  );
}

function EventList({ events }: { events: CityEvent[] }) {
  return (
    <div className="event-list">
      {events.map((event) => (
        <EventItem event={event} key={event.id} />
      ))}
    </div>
  );
}

function CityInfo({
  averageMood,
  averageStability,
  city,
}: {
  averageMood: number;
  averageStability: number;
  city: CityState;
}) {
  return (
    <div className="info-grid">
      <Stat label="Citizens" value={city.citizens.length.toString()} />
      <Stat label="Districts" value={city.districts.length.toString()} />
      <Stat label="Mood" value={`${averageMood}%`} />
      <Stat label="Stability" value={`${averageStability}%`} />
      <Stat label="Public safety" value={`${city.metrics.publicSafety}%`} />
      <Stat label="Public health" value={`${city.metrics.publicHealth}%`} />
      <Stat label="Open cases" value={city.metrics.openCases.toString()} />
      <Stat label="Hospital load" value={`${city.metrics.hospitalLoad}`} />
      <Stat label="Prison load" value={`${city.metrics.prisonLoad}`} />
    </div>
  );
}

function InstitutionList({ city }: { city: CityState }) {
  return (
    <div className="institution-list">
      {city.institutions.map((institution) => (
        <div className="institution-row" key={institution.id}>
          <div>
            <strong>{institution.name}</strong>
            <span>{formatAction(institution.kind)}</span>
          </div>
          <div>
            <small>
              Load {institution.load}/{institution.capacity}
            </small>
            <small>Trust {institution.publicTrust}%</small>
            <small>Staff {institution.staffing}%</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function DistrictList({ city }: { city: CityState }) {
  return (
    <div className="district-list">
      {city.districts.map((district) => (
        <div className="district-row" key={district.id}>
          <span className={`legend-dot legend-dot--${district.kind}`}>{district.name}</span>
          <strong>{district.stability}%</strong>
        </div>
      ))}
    </div>
  );
}

function StructureList({ city }: { city: CityState }) {
  return (
    <div className="structure-list">
      {city.structures.map((structure) => (
        <div className="structure-row" key={structure.id}>
          <div>
            <strong>{structure.name}</strong>
            <span>{formatAction(structure.kind)}</span>
          </div>
          <small>{structure.functions.map(formatAction).join(" / ")}</small>
        </div>
      ))}
    </div>
  );
}

function CitizenList({
  citizens,
  onSelectCitizen,
  selectedCitizenId,
}: {
  citizens: Citizen[];
  onSelectCitizen: (citizenId: string) => void;
  selectedCitizenId: string;
}) {
  return (
    <div className="citizen-list">
      {citizens.map((citizen) => (
        <button
          className={`citizen-list-item ${citizen.id === selectedCitizenId ? "is-active" : ""} ${
            citizen.status !== "active" ? "is-incapacitated" : ""
          }`}
          key={citizen.id}
          type="button"
          onClick={() => onSelectCitizen(citizen.id)}
        >
          <span>{citizen.name.slice(0, 1)}</span>
          <div>
            <strong>{citizen.name}</strong>
            <small>
              {citizen.role} / {formatCitizenStatus(citizen)}
            </small>
          </div>
          <em>{formatAction(citizen.currentAction)}</em>
        </button>
      ))}
    </div>
  );
}

function CitizenSummary({ citizen }: { citizen: Citizen }) {
  return (
    <div className="summary-stack">
      <Stat label="Money" value={`${citizen.money} cr`} />
      <Stat label="Energy" value={`${citizen.energy}%`} />
      <Stat label="Hunger" value={`${citizen.hunger}%`} />
      <Stat label="Status" value={formatCitizenStatus(citizen)} />
      <Stat label="Institution" value={formatInstitution(citizen)} />
      <Stat label="Downtime" value={formatDowntime(citizen)} />
      <Stat label="District" value={citizen.districtId} />
      <Stat label="Faction" value={citizen.factionId ?? "none"} />
      <Stat label="Action" value={formatAction(citizen.currentAction)} />
    </div>
  );
}

function CitizenVitals({ citizen }: { citizen: Citizen }) {
  return (
    <section aria-label="Citizen vitals">
      <PanelTitle eyebrow="Information" title="Vitals" />
      <div className="citizen-stats">
        <Stat label="Money" value={`${citizen.money} cr`} />
        <Stat label="Hunger" value={`${citizen.hunger}%`} />
        <Stat label="Energy" value={`${citizen.energy}%`} />
        <Stat label="Mood" value={`${citizen.mood}%`} />
        <Stat label="Reputation" value={`${citizen.reputation}%`} />
        <Stat label="Status" value={formatCitizenStatus(citizen)} />
        <Stat label="Institution" value={formatInstitution(citizen)} />
        <Stat label="Sentence/recovery" value={formatDowntime(citizen)} />
        <Stat label="District" value={citizen.districtId} />
        <Stat label="Faction" value={citizen.factionId ?? "none"} />
        <Stat label="Action" value={formatAction(citizen.currentAction)} />
      </div>
    </section>
  );
}

function ScenarioInfo({ city }: { city: CityState }) {
  return (
    <div className="scenario-info">
      <p>{city.scenario.description}</p>
      <div className="info-grid">
        <Stat label="Market" value={`${city.scenario.marketFreedom}%`} />
        <Stat label="Welfare" value={`${city.scenario.welfareLevel}%`} />
        <Stat label="Conflict" value={`${city.scenario.conflictPressure}%`} />
        <Stat label="State" value={formatAction(city.scenario.conflictState)} />
        <Stat label="Model" value={formatAction(city.scenario.economyModel)} />
      </div>
    </div>
  );
}

function FactionList({ city }: { city: CityState }) {
  return (
    <div className="faction-list">
      {city.factions.map((faction) => (
        <div className="faction-row" key={faction.id}>
          <div>
            <strong>{faction.name}</strong>
            <span>{faction.agenda}</span>
          </div>
          <div>
            <small>Funds {faction.funds} cr</small>
            <small>Influence {faction.influence}%</small>
            <small>Hostility {faction.hostility}%</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function BehaviorProfile({ citizen }: { citizen: Citizen }) {
  const alignment = deriveAlignment(citizen.personality);
  const riskCopy = citizen.personality.risk > 65 ? "will take risky opportunities" : "prefers safer decisions";
  const empathyCopy = citizen.personality.empathy > 65 ? "often helps others" : "puts personal needs first";

  return (
    <div className="behavior-profile">
      <div>
        <span>Alignment</span>
        <strong>{alignment}</strong>
      </div>
      <p>
        {citizen.name} {riskCopy}, {empathyCopy}, and currently tends toward{" "}
        {citizen.personality.ambition > 65 ? "ambitious" : "steady"} choices.
      </p>
      <TraitRow citizen={citizen} />
    </div>
  );
}

function CitizenDetailTemplate({ citizen }: { citizen: Citizen }) {
  const alignment = deriveAlignment(citizen.personality);

  return (
    <main className="shell template-shell">
      <header className="template-header">
        <div>
          <p className="eyebrow">Template 02</p>
          <h1>Citizen Detail</h1>
        </div>
        <span className={`alignment alignment--${alignment}`}>{alignment}</span>
      </header>

      <section className="citizen-template-grid">
        <div className="panel citizen-hero-panel">
          <div className="portrait-card">
            <span>{citizen.name.slice(0, 1)}</span>
          </div>
          <div>
            <p className="eyebrow">{citizen.role}</p>
            <h2>{citizen.name}</h2>
            <p className="template-copy">
              A compact profile for tuning needs, personality, traits, and future AI behavior.
            </p>
          </div>
        </div>

        <div className="panel">
          <CitizenInspector citizen={citizen} onPersonalityChange={() => undefined} />
        </div>

        <div className="panel wide-panel">
          <PanelTitle eyebrow="Recent behavior" title="Action trail" />
          <div className="timeline">
            <EventItem
              event={{
                id: "template_event_1",
                tick: 12,
                title: "Hard bargain",
                description: `${citizen.name} took a risky deal that raised money and lowered reputation.`,
                severity: "risk",
              }}
            />
            <EventItem
              event={{
                id: "template_event_2",
                tick: 13,
                title: "Rest hour",
                description: `${citizen.name} recovered enough energy for the next shift.`,
                severity: "info",
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function AiProposalTemplate({
  city,
  citizen,
  onApplyCitizenAction,
  onApplyCitizenProposal,
}: {
  city: CityState;
  citizen: Citizen;
  onApplyCitizenAction: (action: CitizenAction, targetId?: string) => void;
  onApplyCitizenProposal: (proposal: CitizenActionProposal) => void;
}) {
  return (
    <main className="shell template-shell">
      <header className="template-header">
        <div>
          <p className="eyebrow">Template 03</p>
          <h1>AI Proposal Review</h1>
        </div>
        <span className="status-chip">Ollama local</span>
      </header>

      <section className="proposal-layout">
        <div className="panel proposal-panel">
          <p className="eyebrow">Selected citizen</p>
          <h2>{citizen.name}</h2>
          <p className="proposal-text">
            This screen uses the same live Ollama proposal flow as the Citizens panel. No proposal is hardcoded:
            click Ask AI to request JSON from the local model, validate it, then apply it through simulation rules.
          </p>
        </div>

        <div className="panel validation-panel">
          <PanelTitle eyebrow="Controls" title="Live proposal" />
          <CitizenActionControls
            city={city}
            citizen={citizen}
            onApplyCitizenAction={onApplyCitizenAction}
            onApplyCitizenProposal={onApplyCitizenProposal}
          />
        </div>
      </section>
    </main>
  );
}

function AssetsTemplate({ citizens }: { citizens: Citizen[] }) {
  return (
    <main className="shell template-shell">
      <header className="template-header">
        <div>
          <p className="eyebrow">Template 04</p>
          <h1>Assets & Components</h1>
        </div>
      </header>

      <section className="assets-grid">
        <div className="panel asset-map-panel">
          <PanelTitle eyebrow="Image asset" title="Bounded forest city map" />
          <img className="asset-map-image" src="/city-map-forest.png" alt="Modern city map surrounded by forest" />
        </div>

        <div className="panel">
          <PanelTitle eyebrow="Markers" title="Citizens" />
          <div className="marker-shelf">
            {citizens.map((citizen) => (
              <div className="marker-sample" key={citizen.id}>
                <span>{citizen.name.slice(0, 1)}</span>
                <strong>{citizen.name}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelTitle eyebrow="Tokens" title="System colors" />
          <div className="swatch-grid">
            <Swatch name="City teal" color="#2F6F63" />
            <Swatch name="Food" color="#4B8A58" />
            <Swatch name="Credits" color="#B36B1E" />
            <Swatch name="Risk" color="#A33D3D" />
            <Swatch name="Civic" color="#435F91" />
            <Swatch name="Surface" color="#F8F5EF" />
          </div>
        </div>
      </section>
    </main>
  );
}

function Swatch({ name, color }: { name: string; color: string }) {
  return (
    <div className="swatch">
      <span style={{ backgroundColor: color }} />
      <strong>{name}</strong>
      <small>{color}</small>
    </div>
  );
}

function CitizenInspector({
  citizen,
  onPersonalityChange,
}: {
  citizen: Citizen;
  onPersonalityChange: (key: keyof Personality, value: number) => void;
}) {
  const alignment = deriveAlignment(citizen.personality);

  return (
    <div>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Citizen</p>
          <h2>{citizen.name}</h2>
        </div>
        <span className={`alignment alignment--${alignment}`}>{alignment}</span>
      </div>

      <CitizenVitals citizen={citizen} />
      <PersonalitySliders citizen={citizen} onPersonalityChange={onPersonalityChange} />
      <TraitRow citizen={citizen} />
    </div>
  );
}

function PersonalitySliders({
  citizen,
  onPersonalityChange,
}: {
  citizen: Citizen;
  onPersonalityChange: (key: keyof Personality, value: number) => void;
}) {
  return (
    <div className="slider-stack">
      <Slider
        label="Morality"
        value={citizen.personality.morality}
        onChange={(value) => onPersonalityChange("morality", value)}
      />
      <Slider
        label="Empathy"
        value={citizen.personality.empathy}
        onChange={(value) => onPersonalityChange("empathy", value)}
      />
      <Slider
        label="Ambition"
        value={citizen.personality.ambition}
        onChange={(value) => onPersonalityChange("ambition", value)}
      />
      <Slider
        label="Risk"
        value={citizen.personality.risk}
        onChange={(value) => onPersonalityChange("risk", value)}
      />
    </div>
  );
}

function TraitRow({ citizen }: { citizen: Citizen }) {
  return (
    <div className="trait-row">
      {citizen.personality.traits.map((trait) => (
        <span key={trait}>{trait}</span>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-control">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input
        max="100"
        min="0"
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EventItem({ event }: { event: CityEvent }) {
  return (
    <article className={`event event--${event.severity}`}>
      <span>Tick {event.tick}</span>
      <strong>{event.title}</strong>
      <p>{event.description}</p>
    </article>
  );
}

function markerPosition(citizen: Citizen, index: number) {
  const markerOffsets = [
    { x: 0, y: 0 },
    { x: 4, y: -4 },
    { x: -4, y: 3 },
    { x: 5, y: 3 },
    { x: -5, y: -3 },
    { x: 2, y: 6 },
    { x: -2, y: -6 },
    { x: 7, y: -1 },
    { x: -7, y: 1 },
    { x: 1, y: -8 },
    { x: -1, y: 8 },
    { x: 6, y: 6 },
  ];
  const offset = markerOffsets[index % markerOffsets.length];

  if (citizen.position) {
    return {
      left: `${clampMarkerPercent(citizen.position.x + offset.x)}%`,
      top: `${clampMarkerPercent(citizen.position.y + offset.y)}%`,
    };
  }

  const positions = [
    { left: "18%", top: "60%" },
    { left: "48%", top: "49%" },
    { left: "59%", top: "35%" },
    { left: "75%", top: "44%" },
    { left: "34%", top: "25%" },
    { left: "42%", top: "72%" },
    { left: "69%", top: "68%" },
    { left: "82%", top: "28%" },
    { left: "25%", top: "41%" },
    { left: "56%", top: "18%" },
    { left: "88%", top: "58%" },
    { left: "13%", top: "30%" },
    { left: "31%", top: "78%" },
    { left: "62%", top: "55%" },
    { left: "73%", top: "18%" },
    { left: "46%", top: "30%" },
  ];

  return positions[index % positions.length];
}

function mapPointStyle(position: CityState["structures"][number]["position"]) {
  return {
    left: `${clampMarkerPercent(position.x)}%`,
    top: `${clampMarkerPercent(position.y)}%`,
  };
}

function institutionMarkerPosition(districtId: string) {
  const positions: Record<string, { left: string; top: string }> = {
    civic: { left: "59%", top: "35%" },
    hospital: { left: "70%", top: "39%" },
    police: { left: "66%", top: "28%" },
    prison: { left: "82%", top: "56%" },
  };

  return positions[districtId] ?? { left: "50%", top: "50%" };
}

function clampMarkerPercent(value: number) {
  return Math.min(94, Math.max(6, Math.round(value * 10) / 10));
}

function clampMapZoom(value: number) {
  return Math.min(3, Math.max(1, Number(value.toFixed(2))));
}

function formatAction(action: string) {
  return action.replace(/_/g, " ");
}

function formatCitizenStatus(citizen: Citizen) {
  if (citizen.status === "active") {
    return "active";
  }

  if (citizen.status === "detained") {
    return `detained until ${citizen.incapacitatedUntilTick ?? "soon"}`;
  }

  if (citizen.status === "jailed") {
    return `jailed until ${citizen.sentenceUntilTick ?? citizen.incapacitatedUntilTick ?? "soon"}`;
  }

  if (citizen.status === "hospitalized") {
    return `hospitalized until ${citizen.recoveryUntilTick ?? citizen.incapacitatedUntilTick ?? "soon"}`;
  }

  return `incapacitated until ${citizen.incapacitatedUntilTick ?? "soon"}`;
}

function formatInstitution(citizen: Citizen) {
  return citizen.institutionId ? formatAction(citizen.institutionId.replace("institution_", "")) : "none";
}

function formatDowntime(citizen: Citizen) {
  const until = citizen.sentenceUntilTick ?? citizen.recoveryUntilTick ?? citizen.incapacitatedUntilTick;

  if (!until) {
    return "none";
  }

  return `${citizen.statusReason ?? "downtime"} until ${until}`;
}
