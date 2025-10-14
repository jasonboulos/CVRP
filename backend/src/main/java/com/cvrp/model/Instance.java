package com.cvrp.model;

import java.util.List;

public record Instance(String id, Depot depot, List<Customer> customers, VehiclesConfig vehicles) {
}
