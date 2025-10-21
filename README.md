# Project Overview
CVRP Explorer is a monorepo that pairs a Spring Boot RL baseline service with an Angular + Tailwind dashboard so the team can prototype and compare Capacitated Vehicle Routing Problem solvers such as genetic algorithms, tabu search, or reinforcement learning.

**Architecture*
- `Angular UI (UI/)` — renders the interactive map, controls panel, and results dashboards; issues REST calls to the backend.
  - Talks to `POST http://localhost:8080/api/rl/solve` for the reinforcement-learning solver.
- `Java - Spring Boot API (backend/)` — hosts the RL solver (`QLearningCvrp`), validates datasets, and emits solve summaries for the UI.
  - Persisted datasets live in `/datasets` and can also be imported through the UI.



# Repository Structure
- `/backend/`
  - `pom.xml` — Maven build for the Spring Boot app.
  - `src/main/java/com/cvrp/api/RlSolveController.java` — REST entry point for RL solves.
  - `src/main/java/com/cvrp/api/dto/` — request/response DTOs (`RlSolveRequest`, `RlSolveResponse`, `ViolationsDto`).
  - `src/main/java/com/cvrp/model/` — shared domain records (`Instance`, `Customer`, `Depot`, `VehiclesConfig`, `RoutePlan`, `SolveResult`).
  - `src/main/java/com/cvrp/rl/QLearningCvrp.java` — tabular Q-learning baseline and `QParams` hyperparameters.
  - `src/main/resources/application.properties` — server defaults (access logging enabled).
- `/UI/`
  - `src/app/core/services/solver-adapter.service.ts` — orchestrates backend calls and mock solvers.
  - `src/app/features/controls-panel/` — dataset + algorithm selection UI.
  - `src/app/features/map-view/` and `features/routes-tab/` — center map + per-vehicle breakdown.
  - `src/environments/environment.ts` — Angular environment with `apiBaseUrl`.
- `/datasets/`
  - `city_circle.json` — sample 30-customer instance used in examples.
- `README.md` — this guide.

# Prerequisites
Ensure the following tools are installed locally:

| Tool | Minimum version |
| --- | --- |
| Java | 21 |
| Maven | 3.9+ |
| Node.js | 18+ |
| Angular CLI | 15+ |
| Git | latest |

Verify versions with:
```
java -version
mvn -version
node -v
npm -v
ng version
git --version
```

# Quick Start (Local Dev)
1. **Start the backend (run this first):**
   ```
   cd backend
   mvn clean install
   mvn spring-boot:run

   ```
2. **Start the UI (in a new terminal):**
   ```
   cd UI
   npm ci
   npm start
   ```
   - Angular CLI serves the app at `http://localhost:4200`.
3. **Browse the app:** open `http://localhost:4200`, choose a dataset, and run the RL baseline. The UI requires the backend to be reachable before initiating a solve.

# Configuration
- **Backend (`backend/src/main/resources/application.properties`):**
  - Access logging is enabled by default. 
  - CORS already allows `http://localhost:4200` through the `@CrossOrigin` annotation on `RlSolveController`.
- **UI (`UI/src/environments/environment.ts`):**
  - `apiBaseUrl` points to `http://localhost:8080` (backend runs locally on port 8080 by default).
- **Datasets:**
  - Sample JSON files live under `/datasets`. They match the `Instance` schema consumed by the backend.
  - From the UI, use the controls panel “Import dataset” action to load additional JSON files. Imported datasets persist in `localStorage` via `DatasetsStoreService`.

# Backend API (Current RL Baseline)
The RL pipeline follows this sequence:
1. `RlSolveController` (`POST /api/rl/solve`) accepts a `RlSolveRequest`.
2. The controller sanitizes the embedded `Instance` (defensive copy of customers) and resolves `QParams` defaults.
3. `QLearningCvrp.solve(Instance, QParams)` performs tabular Q-learning using `Stopwatch`, `SeededRandom`, and `Distance` helpers, returning a `SolveResult`.
4. `SolveResult` is wrapped into `RlSolveResponse`, including `ViolationsDto` for capacity breaches, then returned to the UI.

**Key DTOs (adapt names if your project differs):**
- `RlSolveRequest`
  - `instance` — CVRP instance (`id`, `depot` `{id,x,y}`, `customers` list `{id,x,y,demand}`, `vehicles` with `vehicles[]` array of `{id,capacity}`).
  - `params` (optional) — RL hyperparameters (`episodes`, `alpha`, `gamma`, `epsilon`, `bucketSize`, `maxSteps`, `seed`). `resolvedParams()` fills defaults (`QParams.defaultParams()`) when omitted.
- `SolveResult`
  - `distance` (double), `feasible` (boolean), `vehiclesUsed` (int), `routes` (`RoutePlan` list), `log` (list of strings), `runtimeMillis`, `capacityViolations` (int).
- `RlSolveResponse`
  - Mirrors `SolveResult` with fields renamed to `runtimeMs` and nests `ViolationsDto` (`capacity`). The UI expects route plans as `{vehicle,nodes,load,distance}`.

**Endpoint consumed by the UI:**
- `POST /api/rl/solve`
  - Request payload: `{ instance: { ... }, params?: { ... } }` as described above.
  - Response payload: `{ distance, feasible, vehiclesUsed, routes, violations: { capacity }, log, runtimeMs }`.


