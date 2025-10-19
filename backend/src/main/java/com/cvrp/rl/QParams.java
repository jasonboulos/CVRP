package com.cvrp.rl;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record QParams(
        @Min(1) int episodes,
        double alpha,
        double gamma,
        double epsilon,
        @Min(1) int bucketSize,
        @Min(1) int maxSteps,
        @NotBlank String seed) {

    public QParams {
        if (alpha <= 0 || alpha > 1) {
            throw new IllegalArgumentException("alpha must be in (0, 1]");
        }
        if (gamma < 0 || gamma > 1) {
            throw new IllegalArgumentException("gamma must be in [0, 1]");
        }
        if (epsilon < 0 || epsilon > 1) {
            throw new IllegalArgumentException("epsilon must be in [0, 1]");
        }
    }

    public static QParams defaultParams() {
        return new QParams(200, 0.3, 0.9, 0.1, 5, 5_000, "12345");
    }
}
