package com.cvrp.model;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record Instance(
        @NotBlank String id,
        @Valid @NotNull Depot depot,
        @NotNull List<@Valid Customer> customers,
        @Valid @NotNull VehiclesConfig vehicles) {

    public Instance {
        if ( customers.isEmpty()) {
            throw new IllegalArgumentException("Instance must define at least one customer");
        }
        customers = List.copyOf(customers);
    }
}
