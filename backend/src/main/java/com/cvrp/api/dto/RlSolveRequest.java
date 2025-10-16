package com.cvrp.api.dto;

import com.cvrp.model.Instance;
import com.cvrp.rl.QParams;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record RlSolveRequest(@Valid @NotNull Instance instance, @Valid QParams params) {

    public QParams resolvedParams() {
        return params == null ? QParams.defaultParams() : params;
    }
}
