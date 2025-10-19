package com.cvrp.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record Instance(
        @NotBlank String id,
        @Valid @NotNull Depot depot,
        @NotNull List<@Valid Customer> customers,
        @Valid @NotNull VehiclesConfig vehicles) {

    public Instance {
        if (customers == null || customers.isEmpty()) {
            throw new IllegalArgumentException("Instance must define at least one customer");
        }
        this.customers = List.copyOf(customers);
    }
}
