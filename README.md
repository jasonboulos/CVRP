# Project Overview
CVRP Explorer is a monorepo that pairs a Spring Boot RL baseline service with an Angular + Tailwind dashboard so the team can prototype and compare Capacitated Vehicle Routing Problem solvers such as genetic algorithms, tabu search, or reinforcement learning.

**Architecture at a glance**
- `Angular UI (UI/)` — renders the interactive map, controls panel, and results dashboards; issues REST calls to the backend.
  - Talks to `POST http://localhost:8080/api/rl/solve` for the reinforcement-learning baseline.
- `Spring Boot API (backend/)` — hosts the RL solver (`QLearningCvrp`), validates datasets, and emits solve summaries for the UI.
  - Persisted datasets live in `/datasets` and can also be imported through the UI.

**Screenshot placeholders**
- ![Center map placeholder](docs/screenshots/center-map.png "Add screenshot of the live map once available.")
- ![Left controls placeholder](docs/screenshots/controls-panel.png "Add screenshot of the controls panel once available.")
- ![Right results placeholder](docs/screenshots/results-panel.png "Add screenshot of the metrics/results panel once available.")

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
   - Default profile: Spring Boot `default`.
   - Environment variables: none required; set `SPRING_PROFILES_ACTIVE` if you introduce new profiles.
   - Port: `http://localhost:8080`.
   - Health: no dedicated health endpoint; send a solve request from the UI to confirm the service is up (logs show access events because Tomcat access logging is enabled).
2. **Start the UI (in a new terminal):**
   ```
   cd UI
   npm ci
   npm start
   ```
   - Angular CLI serves the app at `http://localhost:4200`.
   - Authentication: none — all features are accessible once the backend is running.
3. **Browse the app:** open `http://localhost:4200`, choose a dataset, and run the RL baseline. The UI requires the backend to be reachable before initiating a solve.

# Configuration
- **Backend (`backend/src/main/resources/application.properties`):**
  - Access logging is enabled by default. Add properties here (e.g., `server.port`) if you need to change ports or configure data paths.
  - CORS already allows `http://localhost:4200` through the `@CrossOrigin` annotation on `RlSolveController`.
- **UI (`UI/src/environments/environment.ts`):**
  - `apiBaseUrl` points to `http://localhost:8080`. Update this value when running the backend on another host or port.
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
  - Errors: validation exceptions bubble up if `Instance` or `QParams` fields are invalid (e.g., missing customers, out-of-range hyperparameters). Handle with standard Spring exception handlers when extending.

# Extending the Backend with New Algorithms (GA, Tabu, …)
Follow a strategy-style integration to keep the controller agnostic:
1. **Define a contract:** if none exists yet, add an interface such as `RoutingAlgorithm` with a signature like `solve(RlSolveRequest request)` returning `SolveResult`. Place it in a shared package, e.g., `com.cvrp.solver` (adjust if your project already uses another naming convention).
2. **Implement algorithms:**
   - Create classes like `GaAlgorithm`, `TabuSearchAlgorithm`, etc., under `backend/src/main/java/com/cvrp/solver/` (or the equivalent package your team uses).
   - Each class should accept dependencies (distance calculators, random generators) via constructor injection and return a populated `SolveResult`.
   - Annotate with `@Component`/`@Service` so Spring can inject them.
3. **Register selection logic:** pick one of two controller wiring patterns:
   - **Option 1 – Single endpoint dispatch (recommended for UI simplicity):** extend `RlSolveController` (or rename to a generic `SolveController`) to accept an `algorithm` identifier in the request body. Use a dispatcher service to select the correct `RoutingAlgorithm` bean by name. Pros: one URL for all solvers, easier UI integration. Cons: controller gains a bit of branching logic.
   - **Option 2 – Dedicated endpoints per algorithm:** expose `/api/solve/ga`, `/api/solve/tabu`, etc., each backed by its own controller. Pros: explicit endpoints; Cons: UI must manage multiple URLs, more boilerplate.
4. **Reuse DTOs:** keep `RlSolveRequest`/`RlSolveResponse` as the shared contract. Introduce an optional `params` map (e.g., `populationSize`, `mutationRate`, `tabuTenure`, `maxIterations`) that your algorithm interprets. Validate defaults so existing RL calls keep working.
5. **Error handling:** ensure algorithms throw `ResponseStatusException` (or custom exceptions handled by `@ControllerAdvice`) when parameters are missing/invalid. Populate solver logs with actionable messages.
6. **Testing:**
   - Unit test each algorithm implementation with deterministic seeds and small `Instance` fixtures.
   - Add a Spring MVC slice or `@SpringBootTest` integration test covering the controller routing for every algorithm identifier.
7. **Documentation:** update this README and any API docs after adding new algorithms so the UI team knows the available identifiers.

# Connecting Algorithms to the UI
1. **Expose the algorithm in the selector:**
   - Update `UI/src/app/features/controls-panel/controls-panel.component.ts` to include the new algorithm in the dropdown (leveraging `SolverAdapterService.getAlgorithms()`).
   - If adding algorithm-specific controls, append them to `SolverAdapterService`’s `algorithms` map so metadata drives the dynamic form.
2. **Send the right payload:**
   - In `UI/src/app/core/services/solver-adapter.service.ts`, ensure `solve()` detects your algorithm ID and routes to a backend call (extend `solveWithBackend` or add a sibling method).
   - Map UI form values into the shared request DTO, including `{ algorithm: 'ga', params: { populationSize, ... } }` if you adopt the single-endpoint approach.
3. **Update models when necessary:**
   - Adjust `UI/src/app/core/models/index.ts` if the response gains new optional fields (e.g., convergence data). Prefer optional properties to keep backward compatibility.
4. **Render results:**
   - The metrics cards (`UI/src/app/features/metrics-cards/`) and route views already consume `SolveResponse`. Only extend them if the backend response changes shape.

**Implementation checklist**
- [ ] Add the algorithm metadata to the controls dropdown.
- [ ] Map UI parameters to the backend request payload.
- [ ] Ensure the API client points at the correct endpoint/base URL.
- [ ] Verify metrics cards and vehicle grid render the new solver’s response.
- [ ] Run an end-to-end solve on a sample dataset to confirm behavior.

# Running Examples
1. Start the backend (`mvn spring-boot:run`) and UI (`npm start`).
2. Open `http://localhost:4200` and pick the “City Circle (30 customers)” dataset (preloaded from `/datasets/city_circle.json`).
3. Choose an algorithm:
   - RL baseline: leave the selector on “Reinforcement Learning” and adjust `Episodes` / `Gamma` sliders as needed.
   - GA/Tabu (once implemented): select the new algorithm and tune sliders like `Population`, `Mutation %`, `Iterations`, or `Tabu Tenure`.
4. Click **Run**. The center map plots vehicle routes, the right-side tabs show metrics, logs, and per-route details.
5. Observe runtime, feasibility, and capacity violation summaries. Export JSON or PNG results via the controls panel if needed.

**Performance tips**
- Increase RL `Episodes` or GA `Iterations` gradually to balance runtime vs. solution quality.
- Use deterministic seeds (form’s “Seed” field) when comparing algorithms.
- Monitor the log tab for warnings about capacity violations or convergence plateaus.

# Contributing
- **Branch naming:** use `feat/<short-description>` for features and `fix/<issue-id>` for bug fixes.
- **Commits:** follow Conventional Commits (e.g., `feat(backend): add tabu search algorithm`).
- **PR checklist:** ensure unit/integration tests pass, update documentation, and request review from at least one teammate.
- **Code style:**
  - Java — keep existing formatting, favor constructor injection, and run `mvn clean install` before pushing to catch validation issues.
  - Angular — follow Angular style guide (standalone services, SCSS modules) and let Prettier/ESLint (if configured) format files.
- **Issues:** file bugs and feature requests via this repository’s issue tracker so we can triage work.

# Troubleshooting
- **CORS errors in the UI console:** confirm the backend includes your UI origin (`http://localhost:4200` is allowed by default via `@CrossOrigin`). Update the annotation if you serve the UI from another domain.
- **UI cannot reach the backend:** verify `environment.apiBaseUrl` matches the backend URL and the backend log shows incoming requests.
- **Maven or Node version mismatch:** re-run the version commands above and install the required versions (e.g., via SDKMAN! or nvm).
- **Port conflicts:** change the Angular dev server port (`npm start -- --port=4300`) or set `server.port=8081` in `application.properties`.
- **Dataset import failures:** ensure JSON files include `id`, `name`, `description`, `depot`, and `customers[]` with numeric `demand`. Schema mismatches are rejected by `DatasetsStoreService` normalization.

# License & Credits
- **License:** _(Add project license here.)_
- **Credits:** CVRP Explorer is maintained by the CVRP algorithm engineering team; reinforcement learning baseline adapted from the in-repo `QLearningCvrp` implementation.
