package com.cvrp.mock;

import com.cvrp.model.Customer;
import com.cvrp.model.Depot;
import com.cvrp.model.Instance;
import com.cvrp.model.Vehicle;
import com.cvrp.model.VehiclesConfig;
import com.cvrp.util.SeededRandom;

import java.util.ArrayList;
import java.util.List;

public final class MockInstances {
    private MockInstances() {
    }

    public static Instance tiny15(String seed) {
        String derivedSeed = seed == null ? "" : seed;
        SeededRandom random = new SeededRandom("tiny15-" + derivedSeed);
        Depot depot = new Depot(0, 50.0, 50.0);
        List<Customer> customers = new ArrayList<>();
        int count = 15;
        for (int i = 0; i < count; i++) {
            double angle = 2.0 * Math.PI * i / count;
            double radius = 18.0 + random.nextDouble(0.0, 8.0);
            double x = depot.x() + Math.cos(angle) * radius + random.nextGaussian(0.0, 0.8);
            double y = depot.y() + Math.sin(angle) * radius + random.nextGaussian(0.0, 0.8);
            int demand = 5 + random.nextInt(6);
            customers.add(new Customer(i + 1, x, y, demand));
        }
        List<Vehicle> vehicles = List.of(
                new Vehicle(0, 42),
                new Vehicle(1, 38),
                new Vehicle(2, 40),
                new Vehicle(3, 36));
        VehiclesConfig vehiclesConfig = new VehiclesConfig(vehicles);
        return new Instance("tiny15", depot, List.copyOf(customers), vehiclesConfig);
    }

    public static Instance grid20(String seed) {
        String derivedSeed = seed == null ? "" : seed;
        SeededRandom random = new SeededRandom("grid20-" + derivedSeed);
        Depot depot = new Depot(0, 25.0, 25.0);
        List<Customer> customers = new ArrayList<>();
        int columns = 5;
        int rows = 4;
        double spacing = 10.0;
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < columns; c++) {
                int id = r * columns + c + 1;
                double x = 10.0 + c * spacing + random.nextGaussian(0.0, 0.5);
                double y = 10.0 + r * spacing + random.nextGaussian(0.0, 0.5);
                int demand = 4 + random.nextInt(6);
                customers.add(new Customer(id, x, y, demand));
            }
        }
        List<Vehicle> vehicles = List.of(
                new Vehicle(0, 36),
                new Vehicle(1, 40),
                new Vehicle(2, 34),
                new Vehicle(3, 38),
                new Vehicle(4, 42));
        VehiclesConfig vehiclesConfig = new VehiclesConfig(vehicles);
        return new Instance("grid20", depot, List.copyOf(customers), vehiclesConfig);
    }
}
