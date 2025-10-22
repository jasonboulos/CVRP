# DEVNOTES

## Tabs store
- Location: `src/app/features/dashboard/tabs-store.service.ts`.
- Exposes `state$`, `registerResult`, `activateTab`, `closeTab`, `openLastResult`, `openResult`, `reset`, and `getOrderedTabIds`.
- `registerResult` pins the immutable map tab, appends a `ResultTabData`, tracks run order, formats titles as `Result #N — ALGO · distance`, and keeps the active tab on Map after each run.
- `openLastResult` reopens the latest run even if its tab has been closed (map summary keeps a reference).

## Run completion wiring
- `DashboardComponent.persistResult` (in `dashboard.component.ts`) builds the `RunResultSummary`, snapshots the instance/config, attaches algorithm metadata, and calls `tabsStore.registerResult` after each successful run.
- The map tab UI consumes `tabsState$` (see `dashboard.component.html`) and switches tab content with `activateTab`, `closeTab`, and keyboard handlers tied to `getOrderedTabIds`.
- Result tabs stay in the background when a run finishes; a toast (`Run #N — ALGO ready`) gives users a one-click “Open” affordance.

## Hover → map highlight
- The vehicle roster in the map tab calls `setHoverVehicle` on hover/focus and resets on leave/blur so the map dims non-hovered polylines.
- `toggleVehicleSelection` adds a persistent selection (exposed by `isVehicleSelected`), so clicking a vehicle keeps it highlighted after hover ends; `highlightVehicle` resolves to the hover target first, then the saved selection.
- Route colors are assigned by `withRouteColors`/`getVehicleColor` so the map and vehicle list always share the same palette.

## Map info rail
- `toggleInfoRail` / `closeInfoRail` drive the drawer behaviour below `1024px`; on larger screens the aside stays open.
- `persistResult` reopens the drawer after each solve on narrow screens so the latest summary is visible.
- Feasibility is surfaced as a badge inside the route map header (`formatCapacityStatus` renders the violation sublabel) so the
  right rail can stay focused on distance, vehicles, capacity, and roster details.

## Result report layout
- The `ResultReportComponent` now builds a seven-part report (Executive Summary → Performance Summary → Capacity Overview →
  Compare Runs → Charts → Fleet Overview → Logs).
- Executive Summary pulls dataset + seed from `rawRequest`, algorithm metadata via the solver service, and renders the
  feasibility badge with the shared capacity message helper.
- `comparisonTable` ranks the most recent N runs across distance, runtime (ms), capacity violations, and vehicles used while
  surfacing algorithm key parameters inline per run. The charts track distance (km) and runtime (ms) with shared tooltips that
  echo the algo + parameter summary. Fleet details are presented in a sticky-header table so vehicle colors and paths align with
  the map palette.
