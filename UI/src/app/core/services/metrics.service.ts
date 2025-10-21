import { Injectable } from '@angular/core';
import { DashboardMetrics, ProblemInstance, SolveResponse } from '../models';

@Injectable({ providedIn: 'root' })
export class MetricsService {
  computeMetrics(solution: SolveResponse | null | undefined): DashboardMetrics | null {
    if (!solution) {
      return null;
    }

    return {
      totalDistance: Number(solution.distance.toFixed(2)),
      vehiclesUsed: solution.vehiclesUsed,
      capacityViolations: solution.violations.capacity,
      runtimeMs: solution.runtimeMs,
      feasible: typeof solution.feasible === 'boolean' ? solution.feasible : null,
    };
  }

  getUtilization(instance: ProblemInstance, solution: SolveResponse | null | undefined): number {
    if (!solution) {
      return 0;
    }
    const totalDemand = instance.customers.reduce((sum, customer) => sum + customer.demand, 0);
    const servedDemand = solution.routes.reduce((sum, route) => sum + route.load, 0);
    if (totalDemand === 0) {
      return 0;
    }
    return Math.min(100, Number(((servedDemand / totalDemand) * 100).toFixed(1)));
  }
}
