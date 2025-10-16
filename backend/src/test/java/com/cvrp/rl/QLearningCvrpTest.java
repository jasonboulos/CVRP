package com.cvrp.rl;

import com.cvrp.mock.MockInstances;
import com.cvrp.model.Instance;
import com.cvrp.model.RoutePlan;
import com.cvrp.model.SolveResult;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QLearningCvrpTest {
    @Test
    void tinyInstanceIsDeterministicAndFeasible() {
        Instance instance = MockInstances.tiny15("unittest");
        QParams params = new QParams(150, 0.3, 0.9, 0.05, 5, 5_000, "unittest");
        QLearningCvrp solver = new QLearningCvrp();

        SolveResult first = solver.solve(instance, params);
        SolveResult second = solver.solve(instance, params);

        assertTrue(first.feasible(), "expected feasible solution for tiny instance");
        assertEquals(first.distance(), second.distance(), 1e-6, "deterministic distance for same seed");
        assertEquals(first.routes().size(), second.routes().size(), "deterministic route count");

        for (RoutePlan route : first.routes()) {
            assertFalse(route.nodes().isEmpty(), "route should include depot");
            assertEquals(0, route.nodes().get(0), "route must start at depot");
            assertEquals(0, route.nodes().get(route.nodes().size() - 1), "route must end at depot");
            int vehicleIdx = route.vehicle() - 1;
            assertTrue(vehicleIdx >= 0, "vehicle indices are 1-based");
            assertTrue(route.load() <= instance.vehicles().capacityOf(vehicleIdx), "route load within capacity");
        }

        assertTrue(first.distance() > 0.0, "distance should be positive");
        double sum = first.routes().stream().mapToDouble(RoutePlan::distance).sum();
        assertEquals(first.distance(), sum, 1.0, "route distances sum near total");
        assertEquals(0, first.capacityViolations(), "no capacity violations expected");
        assertTrue(first.runtimeMillis() >= 0, "runtime should be non-negative");
    }
}
