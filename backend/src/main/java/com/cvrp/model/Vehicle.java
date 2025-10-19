package com.cvrp.model;

import jakarta.validation.constraints.Min;

public record Vehicle(int id, @Min(value = 1, message = "Vehicle capacity must be positive") int capacity) {
}
