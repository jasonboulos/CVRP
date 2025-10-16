package com.cvrp.api.dto;

import com.cvrp.model.RoutePlan;

import java.util.List;

public record RlSolveResponse(
        double distance,
        boolean feasible,
        int vehiclesUsed,
        List<RoutePlan> routes,
        ViolationsDto violations,
        List<String> log,
        long runtimeMs) {
}
