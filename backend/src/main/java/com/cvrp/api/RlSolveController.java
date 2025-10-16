package com.cvrp.api;

import com.cvrp.api.dto.RlSolveRequest;
import com.cvrp.api.dto.RlSolveResponse;
import com.cvrp.api.dto.ViolationsDto;
import com.cvrp.model.Customer;
import com.cvrp.model.Instance;
import com.cvrp.model.SolveResult;
import com.cvrp.rl.QLearningCvrp;
import com.cvrp.rl.QParams;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/rl")
@CrossOrigin(origins = "http://localhost:4200")
public class RlSolveController {

    private final QLearningCvrp solver;

    public RlSolveController(QLearningCvrp solver) {
        this.solver = solver;
    }

    @PostMapping("/solve")
    public ResponseEntity<RlSolveResponse> solve(@Valid @RequestBody RlSolveRequest request) {
        Instance instance = sanitizeInstance(request.instance());
        QParams params = request.resolvedParams();
        validateVehicles(instance);
        SolveResult result = solver.solve(instance, params);
        RlSolveResponse response = new RlSolveResponse(
                result.distance(),
                result.feasible(),
                result.vehiclesUsed(),
                result.routes(),
                new ViolationsDto(result.capacityViolations()),
                result.log(),
                result.runtimeMillis());
        return ResponseEntity.ok(response);
    }

    private Instance sanitizeInstance(Instance instance) {
        List<Customer> copiedCustomers = new ArrayList<>(instance.customers());
        return new Instance(instance.id(), instance.depot(), copiedCustomers, instance.vehicles());
    }

    private void validateVehicles(Instance instance) {
        int totalDemand = instance.customers().stream().mapToInt(Customer::demand).sum();
        if (instance.vehicles().totalCapacity() < totalDemand) {
            // Allow the run but include a warning in solver logs; handled inside solver.
            return;
        }
    }
}
