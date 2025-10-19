package com.cvrp.model;

import java.util.List;

public record RoutePlan(int vehicle, List<Integer> nodes, int load, double distance) {
}
