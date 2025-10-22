export interface Depot {
  id: number;
  x: number;
  y: number;
}

export interface Customer {
  id: number;
  x: number;
  y: number;
  demand: number;
}

export interface Vehicle {
  id: number;
  capacity: number;
}

export interface VehiclesConfig {
  vehicles: Vehicle[];
}

export interface RoutePlan {
  vehicle: number;
  nodes: number[];
  load: number;
  distance: number;
  color?: string;
}

export interface SolveResponse {
  distance: number;
  runtimeMs: number;
  feasible: boolean;
  vehiclesUsed: number;
  routes: RoutePlan[];
  violations: { capacity: number };
  log: string[];
  convergence?: ConvergencePoint[];
  runtimeBreakdown?: RuntimeSlice[];
  gap?: number;
}

export interface ConvergencePoint {
  iteration: number;
  bestDistance: number;
}

export interface RuntimeSlice {
  label: string;
  ms: number;
}

export interface DatasetDefinition {
  id: string;
  name: string;
  description: string;
  size: number;
  kind: 'preset' | 'random';
}

export interface ProblemInstance {
  id: string;
  depot: Depot;
  customers: Customer[];
  name: string;
}

export interface SolverRunConfig {
  datasetId: string;
  vehicles: VehiclesConfig;
  algorithm: AlgorithmId;
  parameters: Record<string, number>;
  seed: string;
}

export type AlgorithmId = 'tabu' | 'ga' | 'sa' | 'aco' | 'rl';

export interface AlgorithmParameterDefinition {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  tooltip?: string;
}

export interface AlgorithmSummary {
  id: AlgorithmId;
  name: string;
  description: string;
  parameters: AlgorithmParameterDefinition[];
}

export interface DashboardMetrics {
  totalDistance: number;
  vehiclesUsed: number;
  capacityViolations: number;
  runtimeMs: number;
  feasible: boolean | null;
}

export interface RunResultSummary {
  totalDistance: number;
  vehiclesUsed: number;
  runtimeMs: number;
  feasible: boolean | null;
  capacityViolations: number;
  totalDemand: number;
  fleetCapacity: number;
  utilizationPct: number;
}

export interface RunAlgorithmInfo {
  id: AlgorithmId;
  name: string;
  code: string;
}

export interface ResultTabData {
  id: string;
  title: string;
  runNumber: number;
  createdAt: number;
  algorithm: RunAlgorithmInfo;
  summary: RunResultSummary;
  vehicles: RoutePlan[];
  customers: Customer[];
  geometry: {
    depot: Depot;
    routes: RoutePlan[];
  };
  rawRequest: {
    config: SolverRunConfig;
    instance: ProblemInstance;
  };
  rawResponse: SolveResponse;
}
