# AI City Dashboard Screen Spec

## Frame

- Desktop frame: 1440 x 1024
- Background: `#F4F1EB`
- Content max width: 1320
- Outer spacing: 32
- Panel radius: 8
- Panel border: `#D8D1C3`

## Layout

```txt
Topbar
  Left: product name and MVP label
  Right: time pill, auto-time toggle, 6x/10x speed selector, and optional Step 1h button

Full-screen map
  Main layer: large modern city map
  Floating HUD: time and simulation advance
  Drawer: navigation, economy, districts
  Floating inspector: selected citizen
```

## Panels

### City Map

- Title: Central grid
- Status chip: Mood 65%
- Visual asset: `public/city-map-forest.png`
- Map style:
  - modern city simulation illustration
  - central civic plaza and compact downtown blocks
  - apartments, clinic, workshop, market, green labs, transit, and waterfront
  - readable streets and open plazas for many citizen markers
  - subtle asphalt, concrete, glass, grass, and water texture
  - clear edge boundary with pure forest outside the city map
  - citizen markers with initials and names on hover/selection
- District labels:
  - Keep labels outside the map as a legend in the dashboard.
  - Avoid large floating cards on top of the image.
- Legend:
  - Harbor Apartments
  - Green Labs
  - Glass Market
  - Civic Plaza
  - Maker Quarter
- Citizen markers:
  - Anna
  - Milo
  - Lina
  - Rio
  - Sofia
  - Leo
  - Nia
  - Omar
  - Iris
  - Vale

### Citizen Inspector

- Selected citizen: Rio
- Alignment chip: ruthless
- Stats:
  - Money
  - Hunger
  - Energy
  - Reputation
- Sliders:
  - Morality
  - Empathy
  - Ambition
  - Risk
- Traits:
  - impulsive
  - secretive

### Economy

- Food
- Materials
- Credits

### Jobs

- Farm Shift
- Bakery Shift
- Repair Crew
- Clinic Aid

### Event Log

Latest events show tick, title, and short description. Use colored left borders:

- green: positive
- red: risk
- amber: warning
- neutral: info

## Interaction Notes

- Clicking a citizen marker changes the inspector.
- Sliders change personality immediately.
- Alignment label derives from morality and empathy.
- The advance button runs one simulation tick.
- Future AI actions should appear as reviewable proposals before they mutate
  simulation state.

## Figma Template Pages

1. `01 Overview`: high-level city screen with map preview and summary panels.
2. `02 Map Workspace`: large zoomable city map with side information.
3. `03 Citizens`: citizen list, profile, personality settings, and behavior notes.
4. `04 Events`: event timeline with city information and economy context.
5. `05 AI Proposal`: modal/template for reviewing AI-suggested actions.
6. `06 Assets`: map image, district chips, citizen marker styles, event cards,
   color tokens, and panel components.
