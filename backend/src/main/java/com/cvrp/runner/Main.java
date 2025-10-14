package com.cvrp.runner;

import com.cvrp.mock.MockInstances;
import com.cvrp.model.Instance;
import com.cvrp.model.RoutePlan;
import com.cvrp.model.SolveResult;
import com.cvrp.rl.QLearningCvrp;
import com.cvrp.rl.QParams;
import com.cvrp.util.Stopwatch;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class Main {
    private Main() {
    }

    public static void main(String[] args) {
        Map<String, String> options = parseArgs(args);
        String instanceName = options.getOrDefault("instance", "tiny15");
        int episodes = Integer.parseInt(options.getOrDefault("episodes", "200"));
        double alpha = Double.parseDouble(options.getOrDefault("alpha", "0.3"));
        double gamma = Double.parseDouble(options.getOrDefault("gamma", "0.9"));
        double epsilon = Double.parseDouble(options.getOrDefault("epsilon", "0.1"));
        String seed = options.getOrDefault("seed", "12345");

        QParams params = new QParams(episodes, alpha, gamma, epsilon, 5, 5_000, seed);
        Instance instance = loadInstance(instanceName, seed);

        System.out.println("Running Q-learning CVRP solver");
        System.out.println("Instance: " + instance.id());
        System.out.println(
                String.format(
                        Locale.US,
                        "episodes=%d alpha=%.3f gamma=%.3f epsilon=%.3f seed=%s",
                        params.episodes(),
                        params.alpha(),
                        params.gamma(),
                        params.epsilon(),
                        params.seed()));

        Stopwatch stopwatch = Stopwatch.startNew();
        QLearningCvrp solver = new QLearningCvrp();
        SolveResult result = solver.solve(instance, params);
        long elapsed = stopwatch.elapsedMillis();

        System.out.println("Runtime: " + elapsed + " ms");
        System.out.println(String.format(Locale.US, "Distance: %.2f", result.distance()));
        System.out.println("Feasible: " + result.feasible());
        System.out.println("Vehicles used: " + result.vehiclesUsed());
        for (RoutePlan route : result.routes()) {
            StringBuilder builder = new StringBuilder();
            builder.append("Vehicle ").append(route.vehicle()).append(": ");
            for (int i = 0; i < route.nodes().size(); i++) {
                if (i > 0) {
                    builder.append(" -> ");
                }
                builder.append(route.nodes().get(i));
            }
            builder.append(" | load ").append(route.load());
            builder.append(String.format(Locale.US, " | dist %.2f", route.distance()));
            System.out.println(builder);
        }
        List<String> logLines = result.log();
        int limit = Math.min(5, logLines.size());
        for (int i = 0; i < limit; i++) {
            System.out.println("log: " + logLines.get(i));
        }
    }

    private static Instance loadInstance(String name, String seed) {
        return switch (name) {
            case "grid20" -> MockInstances.grid20(seed);
            case "tiny15" -> MockInstances.tiny15(seed);
            default -> throw new IllegalArgumentException("Unknown instance: " + name);
        };
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> options = new HashMap<>();
        for (String arg : args) {
            if (!arg.startsWith("--")) {
                continue;
            }
            int idx = arg.indexOf('=');
            if (idx < 0) {
                continue;
            }
            String key = arg.substring(2, idx);
            String value = arg.substring(idx + 1);
            options.put(key, value);
        }
        return options;
    }
}
