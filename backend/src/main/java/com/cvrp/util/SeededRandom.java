package com.cvrp.util;

import java.nio.charset.StandardCharsets;
import java.util.random.RandomGenerator;
import java.util.random.RandomGeneratorFactory;

public final class SeededRandom {
    private final RandomGenerator generator;

    public SeededRandom(String seed) {
        long seedValue = mixSeed(seed);
        this.generator = RandomGeneratorFactory.of("L64X128MixRandom").create(seedValue);
    }

    private static long mixSeed(String seed) {
        byte[] data = seed.getBytes(StandardCharsets.UTF_8);
        long h1 = 0x9E3779B97F4A7C15L;
        long h2 = 0xC2B2AE3D27D4EB4FL;
        for (byte b : data) {
            h1 ^= b;
            h1 *= 0xBF58476D1CE4E5B9L;
            h2 ^= (long) b << 1;
            h2 *= 0x94D049BB133111EBL;
        }
        return h1 ^ h2;
    }

    public int nextInt(int bound) {
        return generator.nextInt(bound);
    }

    public int nextInt(int origin, int bound) {
        return generator.nextInt(origin, bound);
    }

    public double nextDouble() {
        return generator.nextDouble();
    }

    public double nextDouble(double origin, double bound) {
        return generator.nextDouble(origin, bound);
    }

    public double nextGaussian(double mean, double stdDev) {
        return mean + stdDev * generator.nextGaussian();
    }

    public RandomGenerator generator() {
        return generator;
    }
}
