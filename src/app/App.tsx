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
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OllamaProvider } from "../ai/ollama";
import {
  advanceCity,
  canCitizenReceiveAiTask,
  deriveAlignment,
  getActiveTaskForCitizen,
  scheduleCitizenActionProposal,
  updateCitizenPersonality,
  validateCitizenActionProposal,
} from "../sim/engine";
import { initialCityState } from "../sim/seed";
import type {
  Citizen,
  CitizenActionProposal,
  CitizenTask,
  CityEvent,
  CityState,
  Personality,
  ProposalValidation,
  ResourceKey,
} from "../sim/types";

type AppView = "overview" | "map" | "citizens" | "events";
type AiRequestSource = "auto" | "manual";

interface AiRequestStatus {
  error: string;
  loading: boolean;
  proposal?: CitizenActionProposal;
  lastRequestedTick?: number;
  lastScheduledTick?: number;
  source?: AiRequestSource;
}

const resourceLabels: Record<ResourceKey, string> = {
  food: "Food",
  materials: "Materials",
  credits: "Credits",
};

const speedOptions = [
  { label: "6x", value: 6, intervalMs: 600000 },
  { label: "10x", value: 10, intervalMs: 360000 },
];

const aiRetryCooldownTicks = 4;
const aiAutonomousBatchSize = 2;

const mapPixelWidth = 3344;
const mapPixelHeight = 1882;
const mapAspectRatio = mapPixelWidth / mapPixelHeight;
const mapInverseAspectRatio = mapPixelHeight / mapPixelWidth;

const aiProvider = new OllamaProvider();

export function App() {
  const [city, setCity] = useState<CityState>(initialCityState);
  const [selectedCitizenId, setSelectedCitizenId] = useState(city.citizens[0]?.id ?? "");
  const [activeView, setActiveView] = useState<AppView>(getInitialAppView);
  const [mapZoom, setMapZoom] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [autoRun, setAutoRun] = useState(true);
  const [timeSpeed, setTimeSpeed] = useState(10);
  const [aiRequestStatus, setAiRequestStatus] = useState<Record<string, AiRequestStatus>>({});
  const aiRequestRef = useRef(new Set<string>());
  const aiRetryRef = useRef<Record<string, number>>({});
  const autoDispatchTickRef = useRef<number | null>(null);
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

  const requestAiTask = useCallback(
    async (citizenId: string, source: AiRequestSource = "manual") => {
      const citizen = city.citizens.find((item) => item.id === citizenId);
      const lastRequestTick = aiRetryRef.current[citizenId];

      if (!citizen || aiRequestRef.current.has(citizenId) || !canCitizenReceiveAiTask(city, citizenId)) {
        return;
      }

      if (source === "auto" && typeof lastRequestTick === "number" && city.tick - lastRequestTick < aiRetryCooldownTicks) {
        return;
      }

      aiRequestRef.current.add(citizenId);
      aiRetryRef.current[citizenId] = city.tick;
      setAiRequestStatus((current) => ({
        ...current,
        [citizenId]: {
          ...current[citizenId],
          error: "",
          loading: true,
          lastRequestedTick: city.tick,
          source,
        },
      }));

      try {
        const proposal = await aiProvider.proposeCitizenAction(city, citizenId);
        const normalizedProposal: CitizenActionProposal = {
          ...proposal,
          citizenId,
          targetId: proposal.targetId || undefined,
          reason: proposal.reason || "AI proposed this task from the current city state.",
        };
        let scheduled = false;
        let error = "";

        setCity((current) => {
          const validation = validateCitizenActionProposal(current, normalizedProposal);

          if (!validation.valid) {
            error = validation.reasons.join(" ");
            return current;
          }

          const next = scheduleCitizenActionProposal(current, normalizedProposal);
          scheduled = next !== current;
          return next;
        });

        setAiRequestStatus((current) => ({
          ...current,
          [citizenId]: {
            error,
            loading: false,
            proposal: normalizedProposal,
            lastRequestedTick: city.tick,
            lastScheduledTick: scheduled ? city.tick : current[citizenId]?.lastScheduledTick,
            source,
          },
        }));
      } catch (error) {
        setAiRequestStatus((current) => ({
          ...current,
          [citizenId]: {
            ...current[citizenId],
            error: error instanceof Error ? error.message : "Ollama request failed.",
            loading: false,
            source,
          },
        }));
      } finally {
        aiRequestRef.current.delete(citizenId);
      }
    },
    [city],
  );

  useEffect(() => {
    if (!autoRun || autoDispatchTickRef.current === city.tick) {
      return;
    }

    const citizensReadyForAi = city.citizens
      .filter((citizen) => canCitizenReceiveAiTask(city, citizen.id))
      .filter((citizen) => !aiRequestRef.current.has(citizen.id))
      .filter((citizen) => {
        const lastRequestTick = aiRetryRef.current[citizen.id];
        return typeof lastRequestTick !== "number" || city.tick - lastRequestTick >= aiRetryCooldownTicks;
      })
      .slice(0, aiAutonomousBatchSize);

    if (citizensReadyForAi.length === 0) {
      return;
    }

    autoDispatchTickRef.current = city.tick;
    citizensReadyForAi.forEach((citizen) => {
      void requestAiTask(citizen.id, "auto");
    });
  }, [autoRun, city, requestAiTask]);

  function handleAdvance() {
    setCity((current) => advanceCity(current));
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
        aiRequestStatus={aiRequestStatus[templateCitizen.id]}
        city={city}
        citizen={templateCitizen}
        onRequestAiTask={requestAiTask}
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
          onRequestAiTask={requestAiTask}
          aiRequestStatus={aiRequestStatus[selectedCitizen.id]}
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
          <PanelTitle eyebrow="Roads" title="Network" />
          <RoadList city={city} />
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
  aiRequestStatus,
  city,
  onPersonalityChange,
  onRequestAiTask,
  onSelectCitizen,
  selectedCitizen,
  selectedCitizenId,
}: {
  aiRequestStatus?: AiRequestStatus;
  city: CityState;
  onPersonalityChange: (key: keyof Personality, value: number) => void;
  onRequestAiTask: (citizenId: string, source?: AiRequestSource) => void;
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
          aiRequestStatus={aiRequestStatus}
          city={city}
          citizen={selectedCitizen}
          onRequestAiTask={onRequestAiTask}
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
  aiRequestStatus,
  city,
  citizen,
  onRequestAiTask,
}: {
  aiRequestStatus?: AiRequestStatus;
  city: CityState;
  citizen: Citizen;
  onRequestAiTask: (citizenId: string, source?: AiRequestSource) => void;
}) {
  const activeTask = getActiveTaskForCitizen(city, citizen.id);
  const aiProposal = aiRequestStatus?.proposal;
  const aiValidation = useMemo(
    () => (aiProposal && !activeTask ? validateCitizenActionProposal(city, aiProposal) : undefined),
    [activeTask, aiProposal, city],
  );
  const aiProposalMatchesCitizen = aiProposal?.citizenId === citizen.id;
  const canRequestAiTask = canCitizenReceiveAiTask(city, citizen.id) && !aiRequestStatus?.loading;

  return (
    <div className="action-controls">
      <section className="ai-action-card" aria-label="AI action proposal">
        <div className="ai-action-header">
          <div>
            <p className="eyebrow">Local AI</p>
            <h3>Task proposal</h3>
          </div>
          <span className="status-chip">{activeTask ? "busy" : "AI gated"}</span>
        </div>

        {activeTask ? <TaskStatus task={activeTask} tick={city.tick} /> : null}

        <button
          className="secondary-button full-width-button"
          disabled={!canRequestAiTask}
          type="button"
          onClick={() => onRequestAiTask(citizen.id, "manual")}
        >
          <Sparkles size={18} />
          {aiRequestStatus?.loading ? "Asking Ollama..." : "Ask AI for next task"}
        </button>

        {!canRequestAiTask && !activeTask && !aiRequestStatus?.loading ? (
          <div className="validation-message is-risk">
            <strong>AI request blocked</strong>
            <span>This citizen cannot receive a new task until the deterministic rules say they are free.</span>
          </div>
        ) : null}

        {aiRequestStatus?.error ? (
          <div className="validation-message is-risk">
            <strong>Ollama unavailable or invalid response</strong>
            <span>{aiRequestStatus.error}</span>
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

            {aiRequestStatus?.lastScheduledTick !== undefined ? (
              <div className="validation-message is-good">
                <strong>Scheduled through simulation time</strong>
                <span>The proposal became a task and will apply only after its completion tick.</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function TaskStatus({ task, tick }: { task: CitizenTask; tick: number }) {
  const remainingTicks = Math.max(0, task.completesAtTick - tick);
  const travelRemaining = Math.max(0, Math.min(task.travelDurationTicks, task.workStartsAtTick - tick));
  const taskRemaining = Math.max(0, remainingTicks - travelRemaining);
  const phase = travelRemaining > 0 ? "traveling" : "on task";

  return (
    <div className="validation-message is-good">
      <strong>
        {formatAction(task.action)} {phase}
      </strong>
      <span>
        {task.travelDurationTicks}h travel + {task.baseDurationTicks}h task = {task.durationTicks}h total.
      </span>
      <span>
        Task starts tick {task.workStartsAtTick}; completes tick {task.completesAtTick}; {remainingTicks}h remaining.
      </span>
      {task.travelDurationTicks > 0 ? <span>{travelRemaining}h travel and {taskRemaining}h task time still scheduled.</span> : null}
      <span>{task.reason}</span>
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
        <RoadLayer city={city} />
        <ActiveRouteLayer city={city} />
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

function RoadLayer({ city }: { city: CityState }) {
  return (
    <svg className="road-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {(city.roads ?? []).map((road) => {
        const from = city.structures.find((structure) => structure.id === road.fromStructureId);
        const to = city.structures.find((structure) => structure.id === road.toStructureId);

        if (!from || !to) {
          return null;
        }

        return (
          <line
            className={`road-line road-line--${road.kind}`}
            key={road.id}
            x1={from.position.x}
            x2={to.position.x}
            y1={from.position.y}
            y2={to.position.y}
          />
        );
      })}
    </svg>
  );
}

function ActiveRouteLayer({ city }: { city: CityState }) {
  const routes = city.tasks.filter((task) => task.status === "active" && (task.routeStructureIds?.length ?? 0) > 1);

  if (routes.length === 0) {
    return null;
  }

  return (
    <svg className="active-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {routes.flatMap((task) =>
        task.routeStructureIds.slice(1).map((structureId, index) => {
          const from = city.structures.find((structure) => structure.id === task.routeStructureIds[index]);
          const to = city.structures.find((structure) => structure.id === structureId);

          if (!from || !to) {
            return null;
          }

          return (
            <line
              className="active-route-line"
              key={`${task.id}:${from.id}:${to.id}`}
              x1={from.position.x}
              x2={to.position.x}
              y1={from.position.y}
              y2={to.position.y}
            />
          );
        }),
      )}
    </svg>
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
      <Stat label="Active tasks" value={city.tasks.filter((task) => task.status === "active").length.toString()} />
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

function RoadList({ city }: { city: CityState }) {
  return (
    <div className="road-list">
      {(city.roads ?? []).map((road) => {
        const from = city.structures.find((structure) => structure.id === road.fromStructureId);
        const to = city.structures.find((structure) => structure.id === road.toStructureId);

        return (
          <div className="road-row" key={road.id}>
            <div>
              <strong>{road.name}</strong>
              <span>{road.kind}</span>
            </div>
            <small>
              {from?.name ?? "Unknown"} / {to?.name ?? "Unknown"}
            </small>
          </div>
        );
      })}
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
  aiRequestStatus,
  city,
  citizen,
  onRequestAiTask,
}: {
  aiRequestStatus?: AiRequestStatus;
  city: CityState;
  citizen: Citizen;
  onRequestAiTask: (citizenId: string, source?: AiRequestSource) => void;
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
            click Ask AI for next task to request JSON from the local model, validate it, then schedule it as a timed task.
          </p>
        </div>

        <div className="panel validation-panel">
          <PanelTitle eyebrow="Controls" title="Live proposal" />
          <CitizenActionControls
            aiRequestStatus={aiRequestStatus}
            city={city}
            citizen={citizen}
            onRequestAiTask={onRequestAiTask}
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
    { x: 1.3, y: -1.1 },
    { x: -1.3, y: 1.1 },
    { x: 1.5, y: 1 },
    { x: -1.5, y: -1 },
    { x: 0.7, y: 1.7 },
    { x: -0.7, y: -1.7 },
    { x: 1.9, y: -0.4 },
    { x: -1.9, y: 0.4 },
    { x: 0.3, y: -2 },
    { x: -0.3, y: 2 },
    { x: 1.6, y: 1.6 },
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
