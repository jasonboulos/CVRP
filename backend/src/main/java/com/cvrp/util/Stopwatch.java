package com.cvrp.util;

public final class Stopwatch {
    private final long start;

    private Stopwatch(long start) {
        this.start = start;
    }

    public static Stopwatch startNew() {
        return new Stopwatch(System.nanoTime());
    }

    public long elapsedMillis() {
        long now = System.nanoTime();
        return Math.round((now - start) / 1_000_000.0);
    }
}
