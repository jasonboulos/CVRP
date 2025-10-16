package com.cvrp.rl;

import com.cvrp.model.Customer;
import com.cvrp.model.Instance;
import com.cvrp.model.RoutePlan;
import com.cvrp.model.SolveResult;
import com.cvrp.model.VehiclesConfig;
import com.cvrp.util.Distance;
import com.cvrp.util.SeededRandom;
import com.cvrp.util.Stopwatch;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class QLearningCvrp {
    private static final int RETURN_TO_DEPOT = -1;
    private static final Logger LOGGER = LoggerFactory.getLogger(QLearningCvrp.class);

    public SolveResult solve(Instance instance, QParams params) {
        double[][] distanceMatrix = Distance.buildMatrix(instance);
        SeededRandom rng = new SeededRandom(params.seed());
        Stopwatch stopwatch = Stopwatch.startNew();
        Map<StateKey, Map<Integer, Double>> qTable = new HashMap<>();
        List<String> log = new ArrayList<>();
        double bestFeasibleDistance = Double.POSITIVE_INFINITY;
        List<RoutePlan> bestFeasibleRoutes = Collections.emptyList();
        int bestFeasibleVehicles = 0;
        double bestAttemptDistance = Double.POSITIVE_INFINITY;
        List<RoutePlan> bestAttemptRoutes = Collections.emptyList();
        int bestAttemptVehicles = 0;

        int totalDemand = instance.customers().stream().mapToInt(Customer::demand).sum();
        int totalCapacity = instance.vehicles().totalCapacity();
        if (totalCapacity < totalDemand) {
            log.add("Warning: total vehicle capacity " + totalCapacity + " < total demand " + totalDemand);
        }

        for (int episode = 1; episode <= params.episodes(); episode++) {
            EpisodeResult result = runEpisode(instance, params, distanceMatrix, rng, qTable);
            if (result.feasible() && result.totalDistance() < bestFeasibleDistance) {
                bestFeasibleDistance = result.totalDistance();
                bestFeasibleRoutes = result.routes();
                bestFeasibleVehicles = result.vehiclesUsed();
            }
            if (result.totalDistance() < bestAttemptDistance) {
                bestAttemptDistance = result.totalDistance();
                bestAttemptRoutes = result.routes();
                bestAttemptVehicles = result.vehiclesUsed();
            }
            if (episode == 1
                    || episode % 50 == 0
                    || (result.feasible() && result.totalDistance() <= bestFeasibleDistance)) {
                log.add("Episode " + episode + " best distance " + String.format("%.2f", bestAttemptDistance));
            }
        }

        long runtime = stopwatch.elapsedMillis();

        boolean feasible = !bestFeasibleRoutes.isEmpty();
        List<RoutePlan> chosenRoutes = feasible ? bestFeasibleRoutes : bestAttemptRoutes;
        double distance = feasible ? bestFeasibleDistance : bestAttemptDistance;
        int vehiclesUsed = feasible ? bestFeasibleVehicles : bestAttemptVehicles;
        if (Double.isInfinite(distance)) {
            distance = Double.NaN;
        }

        log.add("Runtime: " + runtime + " ms");

        int capacityViolations = computeCapacityViolations(chosenRoutes, instance.vehicles());
        LOGGER.info(
                "QL solve finished — feasible={}, distance={}, runtime={}ms, vehiclesUsed={}, instance={}",
                feasible,
                formatDistance(distance),
                runtime,
                vehiclesUsed,
                instance.id());
        return new SolveResult(distance, feasible, vehiclesUsed, chosenRoutes, List.copyOf(log), runtime, capacityViolations);
    }

    private EpisodeResult runEpisode(
            Instance instance,
            QParams params,
            double[][] distanceMatrix,
            SeededRandom rng,
            Map<StateKey, Map<Integer, Double>> qTable) {
        List<Customer> customers = instance.customers();
        int customerCount = customers.size();
        VehiclesConfig vehiclesConfig = instance.vehicles();
        boolean[] served = new boolean[customerCount + 1];
        int servedCount = 0;
        int currentNode = 0;
        int vehicleIdx = 0;
        int remainingCapacity = vehiclesConfig.capacityOf(vehicleIdx);
        int bucketSize = Math.max(1, params.bucketSize());
        List<RoutePlan> routes = new ArrayList<>();
        List<Integer> currentRouteNodes = new ArrayList<>();
        int depotId = instance.depot().id();
        currentRouteNodes.add(depotId);
        int currentRouteLoad = 0;
        double currentRouteDistance = 0.0;
        double totalDistance = 0.0;
        boolean feasible = true;

        for (int step = 0; step < params.maxSteps(); step++) {
            int remainingCustomers = customerCount - servedCount;
            boolean allServed = remainingCustomers == 0;
            boolean mustReturn = allServed && currentNode != 0;
            List<Integer> actions = computeActions(currentNode, remainingCapacity, served, customers, mustReturn);
            if (actions.isEmpty()) {
                feasible = allServed && currentNode == 0;
                break;
            }

            StateKey state = new StateKey(
                    currentNode,
                    Math.max(0, remainingCapacity) / bucketSize,
                    remainingCustomers / bucketSize,
                    vehicleIdx);
            Map<Integer, Double> qValues = qTable.computeIfAbsent(state, key -> new HashMap<>());
            for (int action : actions) {
                qValues.putIfAbsent(action, 0.0);
            }

            int chosenAction = chooseAction(actions, qValues, params.epsilon(), rng);
            double reward;
            boolean terminal = false;

            if (chosenAction == RETURN_TO_DEPOT) {
                double added = currentNode == 0 ? 0.0 : distanceMatrix[currentNode][0];
                reward = -added;
                if (currentNode != 0) {
                    currentRouteNodes.add(depotId);
                }
                if (added > 0) {
                    totalDistance += added;
                    currentRouteDistance += added;
                }
                if (currentRouteNodes.size() > 1) {
                    routes.add(new RoutePlan(
                            vehicleIdx + 1,
                            List.copyOf(currentRouteNodes),
                            currentRouteLoad,
                            currentRouteDistance));
                }
                currentNode = 0;
                currentRouteNodes = new ArrayList<>();
                currentRouteNodes.add(depotId);
                currentRouteLoad = 0;
                currentRouteDistance = 0.0;
                if (servedCount == customerCount) {
                    terminal = true;
                } else if (vehicleIdx + 1 >= vehiclesConfig.count()) {
                    feasible = false;
                    terminal = true;
                } else {
                    vehicleIdx += 1;
                    remainingCapacity = vehiclesConfig.capacityOf(vehicleIdx);
                }
            } else {
                int customerIndex = chosenAction;
                Customer customer = customers.get(customerIndex - 1);
                double added = distanceMatrix[currentNode][customerIndex];
                reward = -added;
                totalDistance += added;
                currentRouteDistance += added;
                currentNode = customerIndex;
                currentRouteNodes.add(customer.id());
                served[customerIndex] = true;
                servedCount += 1;
                remainingCapacity -= customer.demand();
                currentRouteLoad += customer.demand();
                if (servedCount == customerCount) {
                    reward += 10.0;
                }
            }

            StateKey nextState = new StateKey(
                    currentNode,
                    Math.max(0, remainingCapacity) / bucketSize,
                    (customerCount - servedCount) / bucketSize,
                    vehicleIdx);

            double nextMax = 0.0;
            if (!terminal) {
                boolean nextMustReturn = (customerCount - servedCount) == 0 && currentNode != 0;
                List<Integer> nextActions = computeActions(currentNode, remainingCapacity, served, customers, nextMustReturn);
                Map<Integer, Double> nextValues = qTable.computeIfAbsent(nextState, key -> new HashMap<>());
                for (int action : nextActions) {
                    nextValues.putIfAbsent(action, 0.0);
                }
                if (!nextActions.isEmpty()) {
                    nextMax = nextValues.values().stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
                } else {
                    terminal = true;
                    feasible = feasible && (customerCount - servedCount) == 0 && currentNode == 0;
                }
            }

            double currentQ = qValues.getOrDefault(chosenAction, 0.0);
            double updatedQ = currentQ + params.alpha() * (reward + params.gamma() * nextMax - currentQ);
            qValues.put(chosenAction, updatedQ);

            if (terminal) {
                break;
            }
        }

        if (currentRouteNodes.size() > 1) {
            if (currentRouteNodes.get(currentRouteNodes.size() - 1) != depotId) {
                double added = currentNode == 0 ? 0.0 : distanceMatrix[currentNode][0];
                if (added > 0) {
                    totalDistance += added;
                    currentRouteDistance += added;
                }
                currentRouteNodes.add(depotId);
            }
            routes.add(new RoutePlan(vehicleIdx + 1, List.copyOf(currentRouteNodes), currentRouteLoad, currentRouteDistance));
        }

        feasible = feasible && servedCount == customerCount;
        return new EpisodeResult(totalDistance, feasible, List.copyOf(routes), routes.size());
    }

    private List<Integer> computeActions(
            int currentNode,
            int remainingCapacity,
            boolean[] served,
            List<Customer> customers,
            boolean mustReturn) {
        List<Integer> actions = new ArrayList<>();
        if (!mustReturn) {
            for (int idx = 1; idx <= customers.size(); idx++) {
                if (served[idx]) {
                    continue;
                }
                Customer customer = customers.get(idx - 1);
                if (customer.demand() <= remainingCapacity) {
                    actions.add(idx);
                }
            }
        }
        if (currentNode != 0) {
            if (mustReturn) {
                actions.clear();
                actions.add(RETURN_TO_DEPOT);
            } else {
                actions.add(RETURN_TO_DEPOT);
            }
        }
        return actions;
    }

    private int chooseAction(List<Integer> actions, Map<Integer, Double> qValues, double epsilon, SeededRandom rng) {
        if (actions.isEmpty()) {
            throw new IllegalStateException("No actions available");
        }
        if (rng.nextDouble() < epsilon) {
            return actions.get(rng.nextInt(actions.size()));
        }
        double bestValue = Double.NEGATIVE_INFINITY;
        List<Integer> bestActions = new ArrayList<>();
        for (int action : actions) {
            double value = qValues.getOrDefault(action, 0.0);
            if (value > bestValue + 1e-9) {
                bestValue = value;
                bestActions.clear();
                bestActions.add(action);
            } else if (Math.abs(value - bestValue) <= 1e-9) {
                bestActions.add(action);
            }
        }
        if (bestActions.isEmpty()) {
            return actions.get(0);
        }
        Collections.sort(bestActions);
        return bestActions.get(rng.nextInt(bestActions.size()));
    }

    private int computeCapacityViolations(List<RoutePlan> routes, VehiclesConfig vehiclesConfig) {
        int violations = 0;
        for (RoutePlan route : routes) {
            int vehicleIdx = route.vehicle() - 1;
            if (vehicleIdx < 0 || vehicleIdx >= vehiclesConfig.count()) {
                continue;
            }
            int capacity = vehiclesConfig.capacityOf(vehicleIdx);
            if (route.load() > capacity) {
                violations += route.load() - capacity;
            }
        }
        return violations;
    }

    private record StateKey(int currentNode, int capacityBucket, int remainingBucket, int vehicleIdx) {
    }

    private record EpisodeResult(double totalDistance, boolean feasible, List<RoutePlan> routes, int vehiclesUsed) {
    }

    private String formatDistance(double distance) {
        if (Double.isFinite(distance)) {
            return String.format("%.2f", distance);
        }
        return "NaN";
    }
}
