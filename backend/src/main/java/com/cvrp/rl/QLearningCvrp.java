package com.cvrp.rl;

import com.cvrp.model.Customer;
import com.cvrp.model.Instance;
import com.cvrp.model.RoutePlan;
import com.cvrp.model.SolveResult;
import com.cvrp.model.VehiclesConfig;
import com.cvrp.util.Distance;
import com.cvrp.util.SeededRandom;
import com.cvrp.util.Stopwatch;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class QLearningCvrp {
    private static final int RETURN_TO_DEPOT = -1;

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

        for (int episode = 1; episode <= params.episodes(); episode++) {
            EpisodeResult result = runEpisode(instance, params, distanceMatrix, rng, qTable);
            if (result.feasible()) {
                if (result.totalDistance() < bestFeasibleDistance) {
                    bestFeasibleDistance = result.totalDistance();
                    bestFeasibleRoutes = result.routes();
                    bestFeasibleVehicles = result.vehiclesUsed();
                }
            }
            if (result.totalDistance() < bestAttemptDistance) {
                bestAttemptDistance = result.totalDistance();
                bestAttemptRoutes = result.routes();
                bestAttemptVehicles = result.vehiclesUsed();
            }
            if (episode == 1 || episode % 50 == 0 || result.feasible() && result.totalDistance() <= bestFeasibleDistance) {
                log.add("Episode " + episode + " best distance " + String.format("%.2f", bestAttemptDistance));
            }
        }
        long runtime = stopwatch.elapsedMillis();

        double distance = bestFeasibleRoutes.isEmpty() ? bestAttemptDistance : bestFeasibleDistance;
        boolean feasible = !bestFeasibleRoutes.isEmpty();
        List<RoutePlan> chosenRoutes = feasible ? bestFeasibleRoutes : bestAttemptRoutes;
        int vehiclesUsed = feasible ? bestFeasibleVehicles : bestAttemptVehicles;

        if (Double.isInfinite(distance)) {
            distance = Double.NaN;
        }
        log.add("Runtime: " + runtime + " ms");

        return new SolveResult(distance, feasible, vehiclesUsed, chosenRoutes, List.copyOf(log));
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
        int remainingCapacity = vehiclesConfig.capacity();
        int bucketSize = Math.max(1, params.bucketSize());
        List<RoutePlan> routes = new ArrayList<>();
        List<Integer> currentRouteNodes = new ArrayList<>();
        currentRouteNodes.add(0);
        int currentRouteLoad = 0;
        double currentRouteDistance = 0.0;
        double totalDistance = 0.0;
        boolean feasible = true;

        for (int step = 0; step < params.maxSteps(); step++) {
            int remainingCustomers = customerCount - servedCount;
            boolean allServed = remainingCustomers == 0;
            boolean canReturn = (currentRouteNodes.size() > 1 && currentRouteNodes.get(currentRouteNodes.size() - 1) != 0)
                    || (currentNode != 0 && currentRouteNodes.get(currentRouteNodes.size() - 1) != 0);
            List<Integer> feasibleCustomers = new ArrayList<>();
            if (!allServed) {
                for (int i = 0; i < customerCount; i++) {
                    if (served[i + 1]) {
                        continue;
                    }
                    Customer customer = customers.get(i);
                    if (customer.demand() <= remainingCapacity) {
                        feasibleCustomers.add(i + 1);
                    }
                }
            }
            List<Integer> actions = new ArrayList<>(feasibleCustomers);
            if (canReturn) {
                actions.add(RETURN_TO_DEPOT);
            }
            if (actions.isEmpty()) {
                feasible = allServed;
                break;
            }

            StateKey state = new StateKey(
                    currentNode,
                    remainingCapacity / bucketSize,
                    remainingCustomers / bucketSize,
                    vehicleIdx);
            Map<Integer, Double> qValues = qTable.computeIfAbsent(state, key -> new HashMap<>());
            for (int action : actions) {
                qValues.putIfAbsent(action, 0.0);
            }
            int chosenAction = chooseAction(actions, qValues, params.epsilon(), rng);

            double reward;
            boolean terminal = false;
            StateKey nextState = null;

            if (chosenAction == RETURN_TO_DEPOT) {
                double added = currentNode == 0 ? 0.0 : distanceMatrix[currentNode][0];
                reward = -added;
                if (currentRouteNodes.size() > 1 && currentRouteNodes.get(currentRouteNodes.size() - 1) != 0) {
                    if (currentRouteNodes.get(currentRouteNodes.size() - 1) != 0) {
                        currentRouteNodes.add(0);
                    }
                    if (added > 0) {
                        currentRouteDistance += added;
                        totalDistance += added;
                    }
                    routes.add(new RoutePlan(
                            vehicleIdx,
                            List.copyOf(currentRouteNodes),
                            currentRouteLoad,
                            currentRouteDistance));
                }
                currentNode = 0;
                currentRouteNodes = new ArrayList<>();
                currentRouteNodes.add(0);
                currentRouteLoad = 0;
                currentRouteDistance = 0.0;
                if (servedCount == customerCount) {
                    terminal = true;
                } else if (vehicleIdx + 1 >= vehiclesConfig.count()) {
                    feasible = false;
                    terminal = true;
                } else {
                    vehicleIdx += 1;
                    remainingCapacity = vehiclesConfig.capacity();
                    remainingCustomers = customerCount - servedCount;
                    nextState = new StateKey(
                            currentNode,
                            remainingCapacity / bucketSize,
                            remainingCustomers / bucketSize,
                            vehicleIdx);
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
                remainingCustomers = customerCount - servedCount;
                if (remainingCustomers == 0) {
                    reward += 10.0;
                }
                nextState = new StateKey(
                        currentNode,
                        Math.max(0, remainingCapacity) / bucketSize,
                        remainingCustomers / bucketSize,
                        vehicleIdx);
            }

            double nextMax = 0.0;
            if (!terminal && nextState != null) {
                Map<Integer, Double> nextValues = qTable.get(nextState);
                if (nextValues != null && !nextValues.isEmpty()) {
                    nextMax = nextValues.values().stream().mapToDouble(Double::doubleValue).max().orElse(0.0);
                }
            }
            double currentQ = qValues.getOrDefault(chosenAction, 0.0);
            double updatedQ = currentQ + params.alpha() * (reward + params.gamma() * nextMax - currentQ);
            qValues.put(chosenAction, updatedQ);

            if (terminal) {
                break;
            }
        }

        if (currentRouteNodes.size() > 1 && currentRouteNodes.get(currentRouteNodes.size() - 1) != 0) {
            double added = currentNode == 0 ? 0.0 : distanceMatrix[currentNode][0];
            if (currentRouteNodes.get(currentRouteNodes.size() - 1) != 0) {
                currentRouteNodes.add(0);
            }
            if (added > 0) {
                totalDistance += added;
                currentRouteDistance += added;
            }
            routes.add(new RoutePlan(vehicleIdx, List.copyOf(currentRouteNodes), currentRouteLoad, currentRouteDistance));
        }

        return new EpisodeResult(totalDistance, feasible, List.copyOf(routes), routes.size());
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

    private record StateKey(int currentNode, int capacityBucket, int remainingBucket, int vehicleIdx) {
    }

    private record EpisodeResult(double totalDistance, boolean feasible, List<RoutePlan> routes, int vehiclesUsed) {
    }
}
