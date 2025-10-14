package com.cvrp.util;

import com.cvrp.model.Customer;
import com.cvrp.model.Instance;

import java.util.List;

public final class Distance {
    private Distance() {
    }

    public static double[][] buildMatrix(Instance instance) {
        List<Customer> customers = instance.customers();
        int size = customers.size() + 1;
        double[][] matrix = new double[size][size];
        for (int i = 0; i < size; i++) {
            for (int j = i; j < size; j++) {
                double dist = compute(instance, customers, i, j);
                matrix[i][j] = dist;
                matrix[j][i] = dist;
            }
        }
        return matrix;
    }

    private static double compute(Instance instance, List<Customer> customers, int from, int to) {
        double x1;
        double y1;
        if (from == 0) {
            x1 = instance.depot().x();
            y1 = instance.depot().y();
        } else {
            Customer c = customers.get(from - 1);
            x1 = c.x();
            y1 = c.y();
        }

        double x2;
        double y2;
        if (to == 0) {
            x2 = instance.depot().x();
            y2 = instance.depot().y();
        } else {
            Customer c = customers.get(to - 1);
            x2 = c.x();
            y2 = c.y();
        }
        double dx = x1 - x2;
        double dy = y1 - y2;
        return Math.hypot(dx, dy);
    }
}
