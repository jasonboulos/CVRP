package com.cvrp.model;

import java.util.List;

public record SolveResult(double distance, boolean feasible, int vehiclesUsed, List<RoutePlan> routes, List<String> log) {
}
