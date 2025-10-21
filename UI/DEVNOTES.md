# DEVNOTES

## Tabs store
- Location: `src/app/features/dashboard/tabs-store.service.ts`.
- Exposes `state$`, `registerResult`, `activateTab`, `closeTab`, `openLastResult`, `openResult`, `reset`, and `getOrderedTabIds`.
- `registerResult` pins the immutable map tab, appends a `ResultTabData`, tracks run order, and updates the active tab.
- `openLastResult` reopens the latest run even if its tab has been closed (map summary keeps a reference).

## Run completion wiring
- `DashboardComponent.persistResult` (in `dashboard.component.ts`) builds the `RunResultSummary`, snapshots the instance/config, and calls `tabsStore.registerResult` after each successful run.
- The map tab UI consumes `tabsState$` (see `dashboard.component.html`) and switches tab content with `activateTab`, `closeTab`, and keyboard handlers tied to `getOrderedTabIds`.

## Hover → map highlight
- The vehicle roster in the map tab calls `setHoverVehicle` on hover/focus and resets on leave/blur so the map dims non-hovered polylines.
- `toggleVehicleSelection` adds a persistent selection (exposed by `isVehicleSelected`), so clicking a vehicle keeps it highlighted after hover ends; `highlightVehicle` resolves to the hover target first, then the saved selection.
- Route colors are assigned by `withRouteColors`/`getVehicleColor` so the map and vehicle list always share the same palette.

## Map info rail
- `toggleInfoRail` / `closeInfoRail` drive the drawer behaviour below `1024px`; on larger screens the aside stays open.
- `persistResult` reopens the drawer after each solve on narrow screens so the latest summary is visible.
