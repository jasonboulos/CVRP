"""Deep RL solver architecture scaffolding for CVRP.

This module replaces the former tabular Q-learning baseline with a
structure ready for a DQN-based solver featuring rich state encoding,
action masking, advanced reward shaping, replay memory, and training
loops with target networks.

Implementation is intentionally staged: the current commit focuses on
organizing responsibilities and defining interfaces so future work can
fill in the learning logic without refactoring again.
"""
from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from models import (
    Instance,
    QParams,
    RlSolveResponse,
    RoutePlan,
    ViolationsDto,
)


# ---------------------------------------------------------------------------
# Core data structures
# ---------------------------------------------------------------------------


@dataclass
class EpisodeRoute:
    vehicle: int
    nodes: List[int]
    load: int
    distance: float


@dataclass
class EpisodeResult:
    total_distance: float
    feasible: bool
    vehicles_used: int
    routes: List[EpisodeRoute]
    log: List[str] = field(default_factory=list)


@dataclass
class Transition:
    state: np.ndarray
    action: int
    reward: float
    next_state: Optional[np.ndarray]
    done: bool
    action_mask: Optional[np.ndarray] = None


@dataclass
class ReplayBuffer:
    capacity: int
    buffer: List[Transition] = field(default_factory=list)
    position: int = 0

    def push(self, transition: Transition) -> None:
        if len(self.buffer) < self.capacity:
            self.buffer.append(transition)
        else:
            self.buffer[self.position] = transition
        self.position = (self.position + 1) % self.capacity

    def sample(self, batch_size: int) -> List[Transition]:
        if len(self.buffer) < batch_size:
            raise ValueError("Not enough transitions to sample a batch yet")
        return random.sample(self.buffer, batch_size)

    def __len__(self) -> int:  # pragma: no cover - trivial
        return len(self.buffer)


@dataclass
class RLHyperParams:
    gamma: float
    epsilon_start: float
    epsilon_end: float
    epsilon_decay: int
    learning_rate: float
    batch_size: int
    replay_capacity: int
    target_tau: float
    max_steps: int
    seed: int
    save_every: int


# ---------------------------------------------------------------------------
# State representation and action masking
# ---------------------------------------------------------------------------


class StateEncoder:
    """Builds rich state tensors for the DQN.

    The encoder collects per-customer features (presence mask, demand,
    coordinates), current vehicle capacity, vehicle index, and distance
    matrix context. This mirrors research-grade VRP encoders without yet
    committing to a specific neural architecture.
    """

    def __init__(self, instance: Instance) -> None:
        self.instance = instance
        self.coords = [(instance.depot.x, instance.depot.y)] + [
            (c.x, c.y) for c in instance.customers
        ]
        self.dist_matrix = self._build_distance_matrix(self.coords)

    @staticmethod
    def _build_distance_matrix(coords: List[Tuple[float, float]]) -> np.ndarray:
        n = len(coords)
        mat = np.zeros((n, n), dtype=np.float32)
        for i, (x1, y1) in enumerate(coords):
            for j, (x2, y2) in enumerate(coords):
                if i == j:
                    continue
                mat[i, j] = math.hypot(x1 - x2, y1 - y2)
        return mat

    def encode(
        self,
        current_idx: int,
        remaining_capacity: float,
        vehicle_idx: int,
        remaining_customers: Iterable[int],
        served_mask: np.ndarray,
    ) -> np.ndarray:
        del remaining_customers  # retained for parity with future implementation
        demands = np.array([c.demand for c in self.instance.customers], dtype=np.float32)
        coords = np.array(self.coords, dtype=np.float32).flatten()
        normalized_capacity = remaining_capacity / max(
            1, max(v.capacity for v in self.instance.vehicles.vehicles)
        )
        state_vector = np.concatenate(
            [
                self._one_hot_node(current_idx),
                np.array([normalized_capacity], dtype=np.float32),
                served_mask.astype(np.float32),
                demands,
                coords,
                self.dist_matrix.flatten(),
                np.array([vehicle_idx], dtype=np.float32),
            ]
        )
        return state_vector

    def _one_hot_node(self, index: int) -> np.ndarray:
        size = len(self.coords)
        vec = np.zeros(size, dtype=np.float32)
        vec[index] = 1.0
        return vec

    def build_action_mask(
        self,
        remaining_capacity: float,
        remaining_customers: Iterable[int],
        current_idx: int,
    ) -> np.ndarray:
        n_actions = len(self.instance.customers) + 1
        mask = np.zeros(n_actions, dtype=np.float32)
        for ci in remaining_customers:
            demand = self.instance.customers[ci - 1].demand
            if demand <= remaining_capacity:
                mask[ci] = 1.0
        if current_idx != 0:
            mask[0] = 1.0
        return mask


# ---------------------------------------------------------------------------
# Reward shaping blueprint
# ---------------------------------------------------------------------------


@dataclass
class RewardConfig:
    unserved_penalty: float = -1000.0
    extra_vehicle_penalty: float = -500.0
    early_return_penalty: float = -300.0
    detour_penalty: float = -50.0
    cluster_penalty: float = -50.0
    full_service_bonus: float = 2000.0
    compact_route_bonus: float = 1000.0
    vehicle_saving_bonus: float = 500.0


class RewardEngine:
    """Encapsulates reward shaping logic for CVRP.

    Methods return scalar rewards given the move context and terminal state.
    Implementation details will be filled in alongside the DQN training loop.
    """

    def __init__(self, reward_config: RewardConfig) -> None:
        self.config = reward_config

    def step_reward(
        self,
        distance_travelled: float,
        early_return: bool,
        overlong_detour: bool,
        cluster_break: bool,
    ) -> float:
        reward = -distance_travelled
        if early_return:
            reward += self.config.early_return_penalty
        if overlong_detour:
            reward += self.config.detour_penalty
        if cluster_break:
            reward += self.config.cluster_penalty
        return reward

    def terminal_reward(
        self,
        unserved_customers: int,
        extra_vehicles: int,
        served_all: bool,
        compact_routes: bool,
        vehicle_saving: bool,
    ) -> float:
        reward = self.config.unserved_penalty * unserved_customers
        reward += self.config.extra_vehicle_penalty * extra_vehicles
        if served_all:
            reward += self.config.full_service_bonus
        if compact_routes:
            reward += self.config.compact_route_bonus
        if vehicle_saving:
            reward += self.config.vehicle_saving_bonus
        return reward


# ---------------------------------------------------------------------------
# DQN placeholders
# ---------------------------------------------------------------------------


class QNetwork:
    """Placeholder for a neural Q-network with dense layers.

    Implementations should follow the DQN architecture with 3-5 dense
    ReLU layers and output masked Q-values for each action.
    """

    def __init__(self, state_dim: int, action_dim: int, hidden_sizes: Sequence[int]):
        self.state_dim = state_dim
        self.action_dim = action_dim
        self.hidden_sizes = hidden_sizes

    def predict(self, state: np.ndarray, action_mask: Optional[np.ndarray]) -> np.ndarray:
        raise NotImplementedError("Neural forward pass not implemented yet")

    def soft_update_from(self, other: "QNetwork", tau: float) -> None:
        raise NotImplementedError("Target network soft update to be implemented")

    def save(self, path: str) -> None:
        raise NotImplementedError("Persisting weights not implemented yet")


# ---------------------------------------------------------------------------
# Trainer orchestrating DQN workflow
# ---------------------------------------------------------------------------


class DQNSolver:
    """High-level trainer/inference pipeline for the CVRP DQN agent."""

    def __init__(self, instance: Instance, params: QParams) -> None:
        self.instance = instance
        self.params = params
        self.encoder = StateEncoder(instance)
        self.reward_engine = RewardEngine(RewardConfig())
        self.hyper = self._build_hyper_params(params)
        self.replay = ReplayBuffer(capacity=self.hyper.replay_capacity)
        self.rng = random.Random(self.hyper.seed)
        self._init_networks()

    def _build_hyper_params(self, params: QParams) -> RLHyperParams:
        return RLHyperParams(
            gamma=params.gamma,
            epsilon_start=params.epsilon,
            epsilon_end=max(0.05, params.epsilon * 0.1),
            epsilon_decay=max(1, params.episodes // 2),
            learning_rate=params.alpha,
            batch_size=max(64, params.batchSize if hasattr(params, "batchSize") else 64),
            replay_capacity=50000,
            target_tau=0.01,
            max_steps=params.maxSteps,
            seed=params.seed,
            save_every=50,
        )

    def _init_networks(self) -> None:
        dummy_state = self.encoder.encode(
            current_idx=0,
            remaining_capacity=self.instance.vehicles.vehicles[0].capacity,
            vehicle_idx=0,
            remaining_customers=list(range(1, len(self.instance.customers) + 1)),
            served_mask=np.zeros(len(self.instance.customers), dtype=np.float32),
        )
        action_dim = len(self.instance.customers) + 1
        hidden = (256, 256, 128)
        self.q_net = QNetwork(state_dim=len(dummy_state), action_dim=action_dim, hidden_sizes=hidden)
        self.target_q_net = QNetwork(
            state_dim=len(dummy_state), action_dim=action_dim, hidden_sizes=hidden
        )
        # Placeholder until soft update is implemented

    def train(self) -> EpisodeResult:
        """Run episodes of DQN training.

        The logic will encompass epsilon decay, replay sampling, target
        network updates, and checkpointing. For now, we return a stub result
        to validate the reorganized API surface.
        """

        log: List[str] = [
            "DQN training pipeline initialized (implementation pending)",
            f"Planned replay capacity: {self.replay.capacity}",
            f"Planned epsilon decay: start={self.hyper.epsilon_start} end={self.hyper.epsilon_end}",
        ]
        return EpisodeResult(
            total_distance=float("inf"),
            feasible=False,
            vehicles_used=0,
            routes=[],
            log=log,
        )

    def infer_best(self) -> EpisodeResult:
        """Run deterministic inference after training (stub)."""

        log = ["Inference stub executed; replace with greedy argmax policy"]
        return EpisodeResult(
            total_distance=float("inf"),
            feasible=False,
            vehicles_used=0,
            routes=[],
            log=log,
        )


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


def solve_cvrp_qlearning(instance: Instance, params: QParams) -> RlSolveResponse:
    start = time.time()
    solver = DQNSolver(instance, params)
    train_result = solver.train()
    best_result = solver.infer_best()

    log = train_result.log + best_result.log

    runtime_ms = int((time.time() - start) * 1000)

    routes_out: List[RoutePlan] = []
    depot = instance.depot
    customers = instance.customers
    for r in best_result.routes:
        node_ids: List[int] = []
        for idx in r.nodes:
            if idx == 0:
                node_ids.append(depot.id)
            else:
                node_ids.append(customers[idx - 1].id)
        routes_out.append(
            RoutePlan(
                vehicle=r.vehicle,
                nodes=node_ids,
                load=r.load,
                distance=r.distance,
            )
        )

    violations = ViolationsDto(capacity=0)

    return RlSolveResponse(
        distance=best_result.total_distance,
        feasible=best_result.feasible,
        vehiclesUsed=len(routes_out),
        routes=routes_out,
        violations=violations,
        log=log,
        runtimeMs=runtime_ms,
    )
