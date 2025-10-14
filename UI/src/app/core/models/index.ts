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

export interface VehiclesConfig {
  count: number;
  capacity: number;
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
  optimalityGap: number;
}
