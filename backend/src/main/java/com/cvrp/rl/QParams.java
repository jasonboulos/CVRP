package com.cvrp.rl;

public record QParams(int episodes, double alpha, double gamma, double epsilon, int bucketSize, int maxSteps, String seed) {
    public static QParams defaultParams() {
        return new QParams(200, 0.3, 0.9, 0.1, 5, 5_000, "12345");
    }
}
