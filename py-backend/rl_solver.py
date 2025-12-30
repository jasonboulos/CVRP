"""
Tabular Q-learning baseline for CVRP.

Why RL struggles vs GA/Tabu:
- CVRP has a huge combinatorial space (states/actions) so a coarse state leads to
  sparse, inconsistent learning.
- Rewards are often poorly scaled, making penalties dominate useful signals.
- Exploring all customers each step is expensive and noisy.

This module keeps the solver lightweight (API-friendly) while improving:
- State richness with compact buckets to reduce sparsity.
- Action pruning (k nearest + big-demand) to focus learning.
- Reward scaling with kilometer-based costs and proportional penalties.
- Double Q-learning, epsilon decay, and evaluation episodes for stability.
"""

import math
import random
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from models import Instance, QParams, RoutePlan, ViolationsDto, RlSolveResponse

# ---------- Petites structures internes pour un épisode ----------


@dataclass
class EpisodeRoute:
    vehicle: int          # id du véhicule
    nodes: List[int]      # indices (0 = dépôt, 1..N = clients dans l'ordre de la liste)
    load: int             # somme des demandes
    distance: float       # distance de la route


@dataclass
class EpisodeResult:
    total_distance: float
    feasible: bool
    vehicles_used: int
    routes: List[EpisodeRoute]


@dataclass
class DistanceStats:
    mean_leg: float
    mean_depot_leg: float


def build_distance_matrix(coords: List[Tuple[float, float]]) -> List[List[float]]:
    """Matrice de distances euclidiennes entre tous les nœuds."""
    n = len(coords)
    mat = [[0.0] * n for _ in range(n)]
    for i in range(n):
        x1, y1 = coords[i]
        for j in range(n):
            if i == j:
                continue
            x2, y2 = coords[j]
            mat[i][j] = math.hypot(x1 - x2, y1 - y2)
    return mat


def compute_distance_stats(dist: List[List[float]]) -> DistanceStats:
    """Déduit des distances typiques pour calibrer les récompenses."""
    depot_legs: List[float] = []
    all_legs: List[float] = []
    for i, row in enumerate(dist):
        for j, d in enumerate(row):
            if i == j:
                continue
            all_legs.append(d)
            if i == 0:
                depot_legs.append(d)
    mean_leg = sum(all_legs) / len(all_legs) if all_legs else 0.0
    mean_depot = sum(depot_legs) / len(depot_legs) if depot_legs else mean_leg
    return DistanceStats(mean_leg=mean_leg, mean_depot_leg=mean_depot)


def bucket_from_value(value: float, bucket_size: float, max_bucket: int) -> int:
    """Compact bucketing to keep the Q-table dense enough for tabular learning."""
    if bucket_size <= 0:
        return 0
    return int(min(value // bucket_size, max_bucket))


def ensure_state(q_table: Dict[Tuple[int, ...], Dict[int, float]], state: Tuple[int, ...], actions: Sequence[int]) -> None:
    """Make sure every (state, action) pair exists in the Q-table."""
    if state not in q_table:
        q_table[state] = {a: 0.0 for a in actions}
        return
    for a in actions:
        q_table[state].setdefault(a, 0.0)


def greedy_action(q1: Dict[int, float], q2: Dict[int, float], actions: Sequence[int], rng: random.Random) -> int:
    """Epsilon=0 selection using the sum of two Q-tables."""
    max_q = None
    best: List[int] = []
    for a in actions:
        q_val = q1.get(a, 0.0) + q2.get(a, 0.0)
        if (max_q is None) or (q_val > max_q):
            max_q = q_val
            best = [a]
        elif q_val == max_q:
            best.append(a)
    return rng.choice(best) if best else rng.choice(list(actions))


def select_action(q1: Dict[int, float], q2: Dict[int, float], actions: Sequence[int], epsilon: float, rng: random.Random) -> int:
    """Standard epsilon-greedy on the merged estimate of Q1 and Q2."""
    if not actions:
        raise ValueError("select_action called with empty action list")
    if rng.random() < epsilon:
        return rng.choice(list(actions))
    return greedy_action(q1, q2, actions, rng)


def double_q_update(
    state: Tuple[int, ...],
    action: int,
    reward: float,
    next_state: Optional[Tuple[int, ...]],
    next_actions: Sequence[int],
    alpha: float,
    gamma: float,
    q1: Dict[Tuple[int, ...], Dict[int, float]],
    q2: Dict[Tuple[int, ...], Dict[int, float]],
    rng: random.Random,
) -> None:
    """Classic Double Q-learning: update one table with the other's estimate."""
    update_first = rng.random() < 0.5
    q_update = q1 if update_first else q2
    q_target = q2 if update_first else q1

    current_q = q_update[state][action]
    if next_state is None or not next_actions:
        target = reward
    else:
        ensure_state(q_update, next_state, next_actions)
        ensure_state(q_target, next_state, next_actions)
        next_best = greedy_action(q_update[next_state], q_target[next_state], next_actions, rng)
        target = reward + gamma * q_target[next_state][next_best]
    q_update[state][action] = current_q + alpha * (target - current_q)


# ---------- Un épisode de Q-Learning ----------


def run_episode(
    dist: List[List[float]],
    customers,
    vehicles,
    bucket_size: int,
    distance_bucket_size: float,
    max_steps: int,
    k_nearest: int,
    alpha: float,
    gamma: float,
    epsilon: float,
    rng: random.Random,
    q1: Dict[Tuple[int, ...], Dict[int, float]],
    q2: Dict[Tuple[int, ...], Dict[int, float]],
    distance_stats: DistanceStats,
    eval_only: bool = False,
) -> EpisodeResult:
    """
    Un épisode = on sert tous les clients (si possible) en utilisant les véhicules,
    en suivant une politique epsilon-greedy sur la Q-table (Double Q-learning).
    L'état est enrichi pour réduire la sparsité et l'espace d'action est filtré
    (k plus proches clients admissibles + clients à forte demande + retour dépôt).
    """
    n_cust = len(customers)
    remaining_customers = set(range(1, n_cust + 1))  # indices 1..N
    remaining_demand = sum(c.demand for c in customers)
    routes: List[EpisodeRoute] = []
    total_distance = 0.0
    vehicle_idx = 0
    total_capacity = sum(v.capacity for v in vehicles) if vehicles else 0

    if not vehicles:
        return EpisodeResult(float("inf"), False, 0, [])

    remaining_capacity = vehicles[vehicle_idx].capacity
    current_idx = 0  # on commence au dépôt (index 0)
    current_route_nodes = [0]
    current_route_load = 0
    current_route_dist = 0.0

    max_bucket_capacity = 10
    max_bucket_customers = 10
    max_bucket_vehicles = 5
    max_bucket_distance = 10

    def build_state() -> Tuple[int, ...]:
        """État compact mais informatif pour tabular Q-learning."""
        vehicles_left = max(0, len(vehicles) - vehicle_idx - 1)
        depot_distance = dist[current_idx][0]
        feasible_customers = [
            ci for ci in remaining_customers if customers[ci - 1].demand <= remaining_capacity
        ]
        min_feasible_dist = 0.0
        if feasible_customers:
            min_feasible_dist = min(dist[current_idx][ci] for ci in feasible_customers)
        return (
            current_idx,
            bucket_from_value(remaining_capacity, bucket_size, max_bucket_capacity),
            bucket_from_value(len(remaining_customers), max(1, bucket_size), max_bucket_customers),
            bucket_from_value(vehicles_left, 1, max_bucket_vehicles),
            bucket_from_value(depot_distance, distance_bucket_size, max_bucket_distance),
            bucket_from_value(min_feasible_dist, distance_bucket_size, max_bucket_distance),
            bucket_from_value(current_route_dist, distance_bucket_size, max_bucket_distance),
            bucket_from_value(remaining_demand, bucket_size, max_bucket_capacity),
        )

    def feasible_and_candidates() -> Tuple[List[int], List[int]]:
        feasible = [
            ci for ci in remaining_customers if customers[ci - 1].demand <= remaining_capacity
        ]
        if not feasible:
            return [], []
        # k plus proches
        nearest = sorted(feasible, key=lambda ci: dist[current_idx][ci])[:k_nearest]
        # 1–2 clients à forte demande pour éviter de n'alimenter que les petites demandes
        high_demand = sorted(feasible, key=lambda ci: customers[ci - 1].demand, reverse=True)[:2]
        # fusion en conservant l'ordre de priorité
        seen = set()
        candidates: List[int] = []
        for ci in nearest + high_demand:
            if ci not in seen:
                candidates.append(ci)
                seen.add(ci)
        return feasible, candidates

    steps = 0
    while steps < max_steps:
        steps += 1

        feasible_customers, candidate_actions = feasible_and_candidates()
        actions: List[int] = list(candidate_actions)

        # Retour au dépôt possible si on n'y est pas déjà
        if current_idx != 0:
            actions.append(0)  # 0 = action "retour dépôt"

        if not actions:
            # Aucun mouvement possible : on ferme la route, on passe au véhicule suivant
            if current_idx != 0:
                d_back = dist[current_idx][0]
                current_route_dist += d_back
                total_distance += d_back
                current_route_nodes.append(0)

            if current_route_load > 0:
                routes.append(
                    EpisodeRoute(
                        vehicle=vehicles[vehicle_idx].id,
                        nodes=current_route_nodes,
                        load=current_route_load,
                        distance=current_route_dist,
                    )
                )

            vehicle_idx += 1
            if vehicle_idx >= len(vehicles):
                break  # plus de véhicules

            remaining_capacity = vehicles[vehicle_idx].capacity
            current_idx = 0
            current_route_nodes = [0]
            current_route_load = 0
            current_route_dist = 0.0
            continue

        # ----- Etat enrichi -----
        state = build_state()

        ensure_state(q1, state, actions)
        ensure_state(q2, state, actions)

        # ----- Choix de l'action (epsilon-greedy) -----
        action = select_action(q1[state], q2[state], actions, epsilon, rng)

        # ----- Appliquer l'action -----
        reward = 0.0
        next_state: Optional[Tuple[int, ...]]
        if action == 0:
            # Retour au dépôt, on ferme la route
            d = dist[current_idx][0]
            reward -= d  # coût distance
            if remaining_capacity > 0 and feasible_customers:
                # pénalise un retour prématuré proportionnel à la capacité non utilisée et au volume restant
                remaining_ratio = remaining_capacity / max(1, vehicles[vehicle_idx].capacity)
                waiting_ratio = len(feasible_customers) / max(1, len(customers))
                reward -= distance_stats.mean_leg * 0.5 * remaining_ratio * waiting_ratio
            current_route_dist += d
            total_distance += d
            if current_route_nodes[-1] != 0:
                current_route_nodes.append(0)

            if current_route_load > 0:
                routes.append(
                    EpisodeRoute(
                        vehicle=vehicles[vehicle_idx].id,
                        nodes=current_route_nodes,
                        load=current_route_load,
                        distance=current_route_dist,
                    )
                )

            vehicle_idx += 1
            if vehicle_idx < len(vehicles) and remaining_customers:
                # pénalité proportionnelle au coût attendu d'un nouveau véhicule
                reward -= distance_stats.mean_depot_leg * 2.0
            if vehicle_idx >= len(vehicles) or not remaining_customers:
                next_state = None  # terminal
            else:
                remaining_capacity = vehicles[vehicle_idx].capacity
                current_idx = 0
                current_route_nodes = [0]
                current_route_load = 0
                current_route_dist = 0.0
                next_state = build_state()
        else:
            # Aller chez un client
            ci = action
            d = dist[current_idx][ci]
            reward -= d
            current_route_dist += d
            total_distance += d
            current_route_nodes.append(ci)
            demand_ci = customers[ci - 1].demand
            remaining_capacity -= demand_ci
            current_route_load += demand_ci
            remaining_customers.remove(ci)
            remaining_demand -= demand_ci
            current_idx = ci

            next_state = build_state() if remaining_customers else None

        # ----- Récompense terminale -----
        terminal_reward = 0.0
        if next_state is None:
            unserved = len(remaining_customers)
            if unserved == 0:
                # petit bonus de faisabilité qui reste dans l'ordre de grandeur des coûts réels
                terminal_reward += distance_stats.mean_leg * 0.5 * len(customers)
            else:
                demand_ratio = remaining_demand / max(1, total_capacity)
                terminal_reward -= distance_stats.mean_leg * unserved
                terminal_reward -= distance_stats.mean_depot_leg * 0.5 * unserved
                terminal_reward -= distance_stats.mean_leg * demand_ratio * len(customers)

        # ----- Mise à jour de Q (Double Q-learning) -----
        if not eval_only:
            next_actions: List[int] = []
            if next_state is not None:
                feas, cand = feasible_and_candidates()
                next_actions = cand.copy()
                if current_idx != 0:
                    next_actions.append(0)
            ensure_state(q1, state, actions)
            ensure_state(q2, state, actions)
            double_q_update(
                state=state,
                action=action,
                reward=reward + terminal_reward,
                next_state=next_state,
                next_actions=next_actions,
                alpha=alpha,
                gamma=gamma,
                q1=q1,
                q2=q2,
                rng=rng,
            )

        if next_state is None:
            break

    # Si l'épisode s'arrête alors qu'on est sur un client, on referme proprement la route.
    if current_route_load > 0 and current_route_nodes[-1] != 0:
        back = dist[current_idx][0]
        current_route_dist += back
        total_distance += back
        current_route_nodes.append(0)
        routes.append(
            EpisodeRoute(
                vehicle=vehicles[vehicle_idx].id,
                nodes=current_route_nodes,
                load=current_route_load,
                distance=current_route_dist,
            )
        )

    feasible = not remaining_customers
    vehicles_used = len(routes)
    return EpisodeResult(total_distance=total_distance, feasible=feasible, vehicles_used=vehicles_used, routes=routes)


# ---------- Fonction principale appelée par FastAPI ----------


def solve_cvrp_qlearning(instance: Instance, params: QParams) -> RlSolveResponse:
    start = time.time()

    depot = instance.depot
    customers = instance.customers
    vehicles = instance.vehicles.vehicles

    coords = [(depot.x, depot.y)] + [(c.x, c.y) for c in customers]
    dist = build_distance_matrix(coords)
    dist_stats = compute_distance_stats(dist)

    rng = random.Random(params.seed)
    q1: Dict[Tuple[int, ...], Dict[int, float]] = {}
    q2: Dict[Tuple[int, ...], Dict[int, float]] = {}

    best_routes: List[EpisodeRoute] = []
    best_distance = float("inf")
    best_feasible = False
    best_episode_idx = -1
    infeasible_seen = False
    log: List[str] = []

    def epsilon_for_episode(ep: int) -> float:
        if params.episodes <= 1:
            return params.epsilonEnd
        decay_power = max(0, ep - 1)
        eps = params.epsilonEnd + (params.epsilonStart - params.epsilonEnd) * (params.epsilonDecay ** decay_power)
        return max(params.epsilonEnd, min(params.epsilonStart, eps))

    for ep in range(1, params.episodes + 1):
        epsilon = epsilon_for_episode(ep)
        eval_only = params.evalEvery > 0 and ep % params.evalEvery == 0
        # On peut faire plusieurs épisodes d'éval consécutifs pour lisser le bruit
        eval_runs = params.evalEpisodes if eval_only else 1
        for _ in range(eval_runs):
            ep_result = run_episode(
                dist=dist,
                customers=customers,
                vehicles=vehicles,
                bucket_size=params.bucketSize,
                distance_bucket_size=params.distanceBucketSize,
                max_steps=params.maxSteps,
                k_nearest=params.kNearestActions,
                alpha=params.alpha,
                gamma=params.gamma,
                epsilon=0.0 if eval_only else epsilon,
                rng=rng,
                q1=q1,
                q2=q2,
                distance_stats=dist_stats,
                eval_only=eval_only,
            )

            log.append(
                f"Episode {ep}{' (eval)' if eval_only else ''}: epsilon={epsilon:.3f}, distance={ep_result.total_distance:.2f}, vehicles={ep_result.vehicles_used}, feasible={ep_result.feasible}"
            )

            candidate_better = ep_result.feasible and (not best_feasible or ep_result.total_distance < best_distance)
            if candidate_better:
                best_feasible = True
                best_distance = ep_result.total_distance
                best_routes = ep_result.routes
                best_episode_idx = ep
            elif not best_feasible and ep_result.total_distance < best_distance:
                best_distance = ep_result.total_distance
                best_routes = ep_result.routes
                best_episode_idx = ep
                infeasible_seen = True
            elif not ep_result.feasible:
                infeasible_seen = True

    runtime_ms = int((time.time() - start) * 1000)

    if best_distance == float("inf"):
        # aucun plan trouvé
        best_distance = 0.0
        best_routes = []
        best_feasible = False

    # Conversion des routes (indices -> ids originaux)
    routes_out: List[RoutePlan] = []
    for r in best_routes:
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

    violations = ViolationsDto(capacity=0)  # on respecte la capacité par construction

    log.append(
        f"Best summary: distance={best_distance:.2f}, vehicles={len(routes_out)}, feasible={best_feasible}, from_episode={best_episode_idx}, infeasible_seen={infeasible_seen}"
    )

    return RlSolveResponse(
        distance=best_distance,
        feasible=best_feasible,
        vehiclesUsed=len(routes_out),
        routes=routes_out,
        violations=violations,
        log=log,
        runtimeMs=runtime_ms,
    )


if __name__ == "__main__":
    # Petit harnais de test pour du développement local. Génère une instance simple
    # (non destiné à la prod) et affiche le meilleur résultat trouvé.
    from models import Customer, Depot, Vehicle, VehiclesConfig

    depot = Depot(id=0, x=0.0, y=0.0)
    customers = [
        Customer(id=i, x=random.uniform(0, 50), y=random.uniform(0, 50), demand=random.randint(1, 5))
        for i in range(1, 16)
    ]
    vehicles = VehiclesConfig(vehicles=[Vehicle(id=i, capacity=15) for i in range(3)])
    instance = Instance(id="dev", depot=depot, customers=customers, vehicles=vehicles)
    params = QParams(episodes=50, seed="dev-seed")
    result = solve_cvrp_qlearning(instance, params)
    print(result)
