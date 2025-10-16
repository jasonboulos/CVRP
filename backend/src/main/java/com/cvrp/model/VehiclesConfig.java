package com.cvrp.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record VehiclesConfig(@NotEmpty List<@Valid Vehicle> vehicles) {

    public VehiclesConfig {
        if (vehicles == null || vehicles.isEmpty()) {
            throw new IllegalArgumentException("Vehicle list must not be empty");
        }
        this.vehicles = List.copyOf(vehicles);
    }

    public int count() {
        return vehicles.size();
    }

    public int capacityOf(int vehicleIdx) {
        if (vehicleIdx < 0 || vehicleIdx >= vehicles.size()) {
            throw new IllegalArgumentException("Vehicle index out of range: " + vehicleIdx);
        }
        return vehicles.get(vehicleIdx).capacity();
    }

    public int totalCapacity() {
        return vehicles.stream().mapToInt(Vehicle::capacity).sum();
    }
}
