import { Injectable } from '@angular/core';
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

interface BuildRoutesOptions {
  instance: ProblemInstance;
  vehicles: VehiclesConfig;
  rngSeed: string;
}

@Injectable({ providedIn: 'root' })
export class SolverAdapterService {
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
        { key: 'cooling', label: 'Cooling Rate', min: 0.80, max: 0.99, step: 0.01, defaultValue: 0.92 },
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
    rl: {
      id: 'rl',
      name: 'Reinforcement Learning',
      description: 'Policy gradient with experience replay.',
      parameters: [
        { key: 'episodes', label: 'Episodes', min: 50, max: 500, step: 10, defaultValue: 120 },
        { key: 'gamma', label: 'Gamma', min: 0.5, max: 0.99, step: 0.01, defaultValue: 0.9 },
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
    const rngSeed = combineSeeds(seed, algorithm, vehicles.count, vehicles.capacity, instance.customers.length);
    const { routes, totalDemand, capacityViolations } = this.buildRoutes({
      instance,
      vehicles,
      rngSeed,
    });

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

    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({
          distance: Number(totalDistance.toFixed(2)),
          runtimeMs,
          feasible,
          vehiclesUsed,
          routes,
          violations: { capacity: capacityViolations },
          log,
          convergence,
          runtimeBreakdown,
          gap,
        });
      }, 1000);
    });
  }

  private buildRoutes({ instance, vehicles, rngSeed }: BuildRoutesOptions): {
    routes: RoutePlan[];
    totalDemand: number;
    capacityViolations: number;
  } {
    const rng = createSeededRng(`${rngSeed}-routes`);
    const vehicleRoutes: RoutePlan[] = [];
    const colors = this.getColorPalette(vehicles.count);

    for (let i = 0; i < vehicles.count; i += 1) {
      vehicleRoutes.push({ vehicle: i + 1, nodes: [0, 0], load: 0, distance: 0, color: colors[i] });
    }

    const shuffledCustomers = rng.shuffle(instance.customers);
    let totalDemand = 0;
    let capacityViolations = 0;

    shuffledCustomers.forEach((customer) => {
      totalDemand += customer.demand;
      const availableRoute = vehicleRoutes.find((route) => route.load + customer.demand <= vehicles.capacity);
      const targetRoute = availableRoute ?? vehicleRoutes[rng.nextInt(vehicleRoutes.length)];

      if (targetRoute.load + customer.demand > vehicles.capacity) {
        capacityViolations += targetRoute.load + customer.demand - vehicles.capacity;
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
      `Runtime: ${(runtimeMs / 1000).toFixed(2)}s`
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
}
