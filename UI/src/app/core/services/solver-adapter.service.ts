import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AlgorithmId,
  AlgorithmParameterDefinition,
  AlgorithmSummary,
  ProblemInstance,
  RoutePlan,
  SolveResponse,
  VehiclesConfig,
} from '../models';
import { computeRouteDistance } from '../utils/distance';
import { combineSeeds } from '../utils/seed';
import { createSeededRng } from '../utils/random';
import { environment } from '../../../environments/environment';

interface BuildRoutesOptions {
  instance: ProblemInstance;
  vehicles: VehiclesConfig;
  rngSeed: string;
}

interface BackendSolveApiResponse {
  distance: number;
  feasible: boolean;
  vehiclesUsed: number;
  routes: RoutePlan[];
  violations: { capacity: number };
  log: string[];
  runtimeMs: number;
}

@Injectable({ providedIn: 'root' })
export class SolverAdapterService {
  constructor(private readonly http: HttpClient) {}

  private readonly algorithms: Record<AlgorithmId, AlgorithmSummary> = {
    tabu: {
      id: 'tabu',
      name: 'Tabu Search',
      description: 'Adaptive tabu with aspiration criteria.',
      parameters: [
        { key: 'iterations', label: 'Iterations', min: 50, max: 500, step: 10, defaultValue: 200 },
        { key: 'tabuTenure', label: 'Tabu Tenure', min: 5, max: 40, step: 1, defaultValue: 15 },
      ],
    },
    ga: {
      id: 'ga',
      name: 'Genetic Algorithm',
      description: 'Elitist GA with partially mapped crossover.',
      parameters: [
        { key: 'population', label: 'Population', min: 10, max: 200, step: 5, defaultValue: 60 },
        { key: 'mutation', label: 'Mutation %', min: 1, max: 40, step: 1, defaultValue: 8 },
      ],
    },
    sa: {
      id: 'sa',
      name: 'Simulated Annealing',
      description: 'Geometric cooling schedule with reheats.',
      parameters: [
        { key: 'startTemp', label: 'Start Temp', min: 10, max: 200, step: 5, defaultValue: 100 },
        { key: 'cooling', label: 'Cooling Rate', min: 0.8, max: 0.99, step: 0.01, defaultValue: 0.92 },
      ],
    },
    aco: {
      id: 'aco',
      name: 'Ant Colony',
      description: 'Max-Min Ant System with pheromone evaporation.',
      parameters: [
        { key: 'ants', label: 'Ants', min: 5, max: 80, step: 1, defaultValue: 20 },
        { key: 'evaporation', label: 'Evaporation', min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.45 },
      ],
    },
  };

  getAlgorithms(): AlgorithmSummary[] {
    return Object.values(this.algorithms);
  }

  getAlgorithmParameters(algorithm: AlgorithmId): AlgorithmParameterDefinition[] {
    return this.algorithms[algorithm]?.parameters ?? [];
  }

  async solve(
    instance: ProblemInstance,
    vehicles: VehiclesConfig,
    algorithm: AlgorithmId,
    parameters: Record<string, number>,
    seed: string,
  ): Promise<SolveResponse> {
    if (algorithm === 'ga') {
      console.log('Solving with backend GA service...');
      return this.solveWithBackendGa(instance, vehicles, parameters, seed);
    }

    if (algorithm === 'tabu') {
      console.log('Solving with backend TABU service...');
      return this.solveWithBackendTabu(instance, vehicles, parameters, seed);
    }

    if (algorithm === 'sa') {
      console.log('Solving with backend SA service...');
      return this.solveWithBackendSa(instance, vehicles, parameters, seed);
    }

    if (algorithm === 'aco') {
      console.log('Solving with backend ACO service...');
      return this.solveWithBackendAco(instance, vehicles, parameters, seed);
    }

    console.log('Solving with local mock solver...');
    console.log(algorithm);
    return this.solveWithMock(instance, vehicles, algorithm, parameters, seed);
  }

  // ---------------- MOQUE : TABU / SA / ACO ----------------

  private async solveWithMock(
    instance: ProblemInstance,
    vehicles: VehiclesConfig,
    algorithm: AlgorithmId,
    parameters: Record<string, number>,
    seed: string,
  ): Promise<SolveResponse> {
    const vehicleCount = this.getVehicleCount(vehicles);
    const capacitiesKey = vehicles.vehicles.map((vehicle) => vehicle.capacity).join('-');
    const rngSeed = combineSeeds(seed, algorithm, vehicleCount, capacitiesKey, instance.customers.length);
    const { routes, totalDemand, capacityViolations } = this.buildRoutes({ instance, vehicles, rngSeed });

    const totalDistance = routes.reduce((sum, route) => sum + route.distance, 0);
    const runtimeRng = createSeededRng(`${rngSeed}-runtime`);
    const runtimeMs = Math.round(800 + runtimeRng.nextRange(0, 400));
    const vehiclesUsed = routes.filter((route) => route.nodes.length > 2).length;
    const feasible = capacityViolations === 0;
    const gap = Number(runtimeRng.nextRange(3, 10).toFixed(2));

    const log: string[] = this.generateLogs({
      algorithm,
      runtimeMs,
      capacityViolations,
      totalDemand,
      vehiclesUsed,
      parameters,
    });

    const convergence = this.generateConvergence(runtimeRng, totalDistance);
    const runtimeBreakdown = this.generateRuntimeBreakdown(runtimeRng, runtimeMs);

    const coloredRoutes = this.applyRouteColors(routes, vehicleCount);

    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({
          distance: Number(totalDistance.toFixed(2)),
          runtimeMs,
          feasible,
          vehiclesUsed,
          routes: coloredRoutes,
          violations: { capacity: capacityViolations },
          log,
          convergence,
          runtimeBreakdown,
          gap,
        });
      }, 1000);
    });
  }

  // ---------------- BACKEND GA ----------------

  private async solveWithBackendGa(
    instance: ProblemInstance,
    vehicles: VehiclesConfig,
    parameters: Record<string, number>,
    seed: string,
  ): Promise<SolveResponse> {
    const vehicleCount = this.getVehicleCount(vehicles);

    const payload = {
      instance: {
        id: instance.id,
        depot: instance.depot,
        customers: instance.customers,
        vehicles: {
          vehicles: vehicles.vehicles.map((vehicle, index) => ({
            id: vehicle.id ?? index + 1,
            capacity: Math.max(1, Math.round(vehicle.capacity)),
          })),
        },
      },
      params: {
        populationSize: Math.round(parameters['population'] ?? 60),
        generations: Math.round(parameters['generations'] ?? 200), // si tu ajoutes un slider plus tard
        mutationRate: (parameters['mutation'] ?? 8) / 100,
        seed,
      },
    };

    const url = `${environment.apiBaseUrl}/api/ga/solve`;
    const response = await firstValueFrom(this.http.post<BackendSolveApiResponse>(url, payload));
    console.log('GA Solve Response:', response);
    const coloredRoutes = this.applyRouteColors(response.routes, vehicleCount);

    return {
      distance: Number(response.distance.toFixed(2)),
      runtimeMs: response.runtimeMs,
      feasible: response.feasible,
      vehiclesUsed: response.vehiclesUsed,
      routes: coloredRoutes,
      violations: response.violations,
      log: response.log,
      convergence: undefined,
      runtimeBreakdown: undefined,
      gap: undefined,
    };
  }

  // ---------------- BACKEND TABU ----------------

  private async solveWithBackendTabu(
    instance: ProblemInstance,
    vehicles: VehiclesConfig,
    parameters: Record<string, number>,
    seed: string,
  ): Promise<SolveResponse> {
    const vehicleCount = this.getVehicleCount(vehicles);

    const payload = {
      instance: {
        id: instance.id,
        depot: instance.depot,
        customers: instance.customers,
        vehicles: {
          vehicles: vehicles.vehicles.map((vehicle, index) => ({
            id: vehicle.id ?? index + 1,
            capacity: Math.max(1, Math.round(vehicle.capacity)),
          })),
        },
      },
      params: {
        iterations: Math.round(parameters['iterations'] ?? 200),
        tabuTenure: Math.round(parameters['tabuTenure'] ?? 15),
        seed,
      },
    };

    const url = `${environment.apiBaseUrl}/api/tabu/solve`;
    const response = await firstValueFrom(this.http.post<BackendSolveApiResponse>(url, payload));
    console.log('TABU Solve Response:', response);
    const coloredRoutes = this.applyRouteColors(response.routes, vehicleCount);

    return {
      distance: Number(response.distance.toFixed(2)),
      runtimeMs: response.runtimeMs,
      feasible: response.feasible,
      vehiclesUsed: response.vehiclesUsed,
      routes: coloredRoutes,
      violations: response.violations,
      log: response.log,
      convergence: undefined,
      runtimeBreakdown: undefined,
      gap: undefined,
    };
  }

  // ---------------- BACKEND SA ----------------

  private async solveWithBackendSa(
    instance: ProblemInstance,
    vehicles: VehiclesConfig,
    parameters: Record<string, number>,
    seed: string,
  ): Promise<SolveResponse> {
    const vehicleCount = this.getVehicleCount(vehicles);

    const payload = {
      instance: {
        id: instance.id,
        depot: instance.depot,
        customers: instance.customers,
        vehicles: {
          vehicles: vehicles.vehicles.map((vehicle, index) => ({
            id: vehicle.id ?? index + 1,
            capacity: Math.max(1, Math.round(vehicle.capacity)),
          })),
        },
      },
      params: {
        iterations: Math.round(parameters['iterations'] ?? 2000), // interne, pas de slider
        startTemp: parameters['startTemp'] ?? 100,
        cooling: parameters['cooling'] ?? 0.92,
        seed,
      },
    };

    const url = `${environment.apiBaseUrl}/api/sa/solve`;
    const response = await firstValueFrom(this.http.post<BackendSolveApiResponse>(url, payload));
    console.log('SA Solve Response:', response);
    const coloredRoutes = this.applyRouteColors(response.routes, vehicleCount);

    return {
      distance: Number(response.distance.toFixed(2)),
      runtimeMs: response.runtimeMs,
      feasible: response.feasible,
      vehiclesUsed: response.vehiclesUsed,
      routes: coloredRoutes,
      violations: response.violations,
      log: response.log,
      convergence: undefined,
      runtimeBreakdown: undefined,
      gap: undefined,
    };
  }

  // ---------------- BACKEND ACO ----------------

  private async solveWithBackendAco(
    instance: ProblemInstance,
    vehicles: VehiclesConfig,
    parameters: Record<string, number>,
    seed: string,
  ): Promise<SolveResponse> {
    const vehicleCount = this.getVehicleCount(vehicles);

    const payload = {
      instance: {
        id: instance.id,
        depot: instance.depot,
        customers: instance.customers,
        vehicles: {
          vehicles: vehicles.vehicles.map((vehicle, index) => ({
            id: vehicle.id ?? index + 1,
            capacity: Math.max(1, Math.round(vehicle.capacity)),
          })),
        },
      },
      params: {
        ants: Math.round(parameters['ants'] ?? 20),
        iterations: Math.round(parameters['iterations'] ?? 100), // interne
        evaporation: parameters['evaporation'] ?? 0.45,
        seed,
      },
    };

    const url = `${environment.apiBaseUrl}/api/aco/solve`;
    const response = await firstValueFrom(this.http.post<BackendSolveApiResponse>(url, payload));
    console.log('ACO Solve Response:', response);
    const coloredRoutes = this.applyRouteColors(response.routes, vehicleCount);

    return {
      distance: Number(response.distance.toFixed(2)),
      runtimeMs: response.runtimeMs,
      feasible: response.feasible,
      vehiclesUsed: response.vehiclesUsed,
      routes: coloredRoutes,
      violations: response.violations,
      log: response.log,
      convergence: undefined,
      runtimeBreakdown: undefined,
      gap: undefined,
    };
  }

  // ---------------- UTILITAIRES EXISTANTS ----------------

  private buildRoutes({ instance, vehicles, rngSeed }: BuildRoutesOptions): {
    routes: RoutePlan[];
    totalDemand: number;
    capacityViolations: number;
  } {
    const rng = createSeededRng(`${rngSeed}-routes`);
    const vehicleRoutes: RoutePlan[] = [];
    const colors = this.getColorPalette(this.getVehicleCount(vehicles));
    const capacities = vehicles.vehicles.map((vehicle) => Math.max(1, Math.round(vehicle.capacity)));

    for (let i = 0; i < capacities.length; i += 1) {
      const vehicleId = vehicles.vehicles[i]?.id ?? i + 1;
      vehicleRoutes.push({ vehicle: vehicleId, nodes: [0, 0], load: 0, distance: 0, color: colors[i] });
    }

    const shuffledCustomers = rng.shuffle(instance.customers);
    let totalDemand = 0;
    let capacityViolations = 0;

    shuffledCustomers.forEach((customer) => {
      totalDemand += customer.demand;
      let chosenIndex = -1;
      for (let i = 0; i < vehicleRoutes.length; i += 1) {
        if (vehicleRoutes[i].load + customer.demand <= capacities[i]) {
          chosenIndex = i;
          break;
        }
      }
      if (chosenIndex === -1) {
        chosenIndex = rng.nextInt(vehicleRoutes.length);
      }
      const targetRoute = vehicleRoutes[chosenIndex];
      const capacityLimit = capacities[chosenIndex];

      if (targetRoute.load + customer.demand > capacityLimit) {
        capacityViolations += targetRoute.load + customer.demand - capacityLimit;
      }

      targetRoute.nodes.splice(targetRoute.nodes.length - 1, 0, customer.id);
      targetRoute.load += customer.demand;
    });

    vehicleRoutes.forEach((route) => {
      route.distance = computeRouteDistance(route, instance.depot, instance.customers);
      route.distance = Number(route.distance.toFixed(2));
    });

    return { routes: vehicleRoutes, totalDemand, capacityViolations };
  }

  private generateLogs(config: {
    algorithm: AlgorithmId;
    runtimeMs: number;
    capacityViolations: number;
    totalDemand: number;
    vehiclesUsed: number;
    parameters: Record<string, number>;
  }): string[] {
    const { algorithm, runtimeMs, capacityViolations, totalDemand, vehiclesUsed, parameters } = config;
    const header = `[${new Date().toISOString()}] Running ${this.algorithms[algorithm].name}`;
    const paramSummary = Object.entries(parameters)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    return [
      header,
      `Parameters -> ${paramSummary || 'default settings'}`,
      `Total demand assigned: ${totalDemand.toFixed(0)} units across ${vehiclesUsed} vehicles`,
      capacityViolations > 0
        ? `Capacity violations detected: ${capacityViolations.toFixed(0)} units over capacity`
        : 'Solution is capacity-feasible',
      `Runtime: ${(runtimeMs / 1000).toFixed(2)}s`,
    ];
  }

  private generateConvergence(rng: ReturnType<typeof createSeededRng>, best: number) {
    const points: { iteration: number; bestDistance: number }[] = [];
    let current = best * rng.nextRange(1.05, 1.3);
    for (let i = 1; i <= 10; i += 1) {
      current -= rng.nextRange(best * 0.02, best * 0.05);
      if (current < best) {
        current = best * rng.nextRange(0.98, 1.01);
      }
      points.push({ iteration: i * 10, bestDistance: Number(current.toFixed(2)) });
    }
    return points;
  }

  private generateRuntimeBreakdown(rng: ReturnType<typeof createSeededRng>, runtimeMs: number) {
    const stages = ['Preprocessing', 'Construction', 'Improvement', 'Post-processing'];
    const weights = stages.map(() => rng.nextRange(0.8, 2));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    return stages.map((label, index) => ({
      label,
      ms: Number(((weights[index] / totalWeight) * runtimeMs).toFixed(0)),
    }));
  }

  private getColorPalette(count: number): string[] {
    const palette = [
      '#3b82f6',
      '#ec4899',
      '#22c55e',
      '#f97316',
      '#8b5cf6',
      '#06b6d4',
      '#facc15',
      '#ef4444',
      '#14b8a6',
      '#a855f7',
    ];
    const colors: string[] = [];
    for (let i = 0; i < count; i += 1) {
      colors.push(palette[i % palette.length]);
    }
    return colors;
  }

  private applyRouteColors(routes: RoutePlan[], count: number): RoutePlan[] {
    const palette = this.getColorPalette(Math.max(count, routes.length));
    return routes.map((route, index) => ({
      ...route,
      color: route.color ?? palette[index % palette.length],
    }));
  }

  private getVehicleCount(vehicles: VehiclesConfig): number {
    return vehicles.vehicles.length;
  }
}
