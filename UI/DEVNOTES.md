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
- The vehicle list inside the map tab (same template) triggers `onHighlightChange` on `mouseenter` / `focus` and `mouseleave` / `blur`.
- `onHighlightChange` updates `highlightVehicle`, which feeds directly into `<app-map-view>` for live highlighting.
