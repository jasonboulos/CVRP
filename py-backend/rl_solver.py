import math
import random
import time
from dataclasses import dataclass
from typing import Dict, List, Tuple

from models import (
    Instance,
    QParams,
    RoutePlan,
    ViolationsDto,
    RlSolveResponse,
)

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


# ---------- Un épisode de Q-Learning ----------

def run_episode(
    dist: List[List[float]],
    customers,
    vehicles,
    bucket_size: int,
    max_steps: int,
    Q: Dict[Tuple[int, int, int, int], Dict[int, float]],
    alpha: float,
    gamma: float,
    epsilon: float,
    rng: random.Random,
) -> EpisodeResult:
    """
    Un épisode = on sert tous les clients (si possible) en utilisant les véhicules,
    en suivant une politique epsilon-greedy sur la Q-table.
    """
    n_cust = len(customers)
    remaining_customers = set(range(1, n_cust + 1))  # indices 1..N
    routes: List[EpisodeRoute] = []
    total_distance = 0.0
    vehicle_idx = 0

    if not vehicles:
        return EpisodeResult(float("inf"), False, 0, [])

    remaining_capacity = vehicles[vehicle_idx].capacity
    current_idx = 0  # on commence au dépôt (index 0)
    current_route_nodes = [0]
    current_route_load = 0
    current_route_dist = 0.0

    def bucketize(val: int) -> int:
        return val // bucket_size

    steps = 0
    while steps < max_steps:
        steps += 1

        # ----- Actions possibles -----
        actions: List[int] = []

        # Visites de clients encore non servis et admissibles en capacité
        for ci in list(remaining_customers):
            demand = customers[ci - 1].demand
            if demand <= remaining_capacity:
                actions.append(ci)  # ci = index du client (1..N)

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

        # ----- Etat (state) = (position, capacité, nb clients restants, véhicule) -----
        cap_bucket = bucketize(remaining_capacity)
        rem_bucket = bucketize(len(remaining_customers))
        state = (current_idx, cap_bucket, rem_bucket, vehicle_idx)

        # Initialiser Q[state] si besoin
        if state not in Q:
            Q[state] = {a: 0.0 for a in actions}
        else:
            for a in actions:
                Q[state].setdefault(a, 0.0)

        # ----- Choix de l'action (epsilon-greedy) -----
        if rng.random() < epsilon:
            action = rng.choice(actions)
        else:
            qs = Q[state]
            max_q = max(qs[a] for a in actions)
            best_actions = [a for a in actions if qs[a] == max_q]
            action = rng.choice(best_actions)

        if action == 0 and current_idx == 0:
            # Retour dépôt alors qu'on est déjà au dépôt => on prend une autre action
            non_zero = [a for a in actions if a != 0]
            if non_zero:
                action = rng.choice(non_zero)

        # ----- Appliquer l'action -----
        if action == 0:
            # Retour au dépôt, on ferme la route
            d = dist[current_idx][0]
            reward = -d
            current_route_dist += d
            total_distance += d
            current_route_nodes.append(0)

            routes.append(
                EpisodeRoute(
                    vehicle=vehicles[vehicle_idx].id,
                    nodes=current_route_nodes,
                    load=current_route_load,
                    distance=current_route_dist,
                )
            )

            vehicle_idx += 1
            if vehicle_idx >= len(vehicles) or not remaining_customers:
                next_state = None  # terminal
            else:
                remaining_capacity = vehicles[vehicle_idx].capacity
                current_idx = 0
                current_route_nodes = [0]
                current_route_load = 0
                current_route_dist = 0.0
                next_state = (
                    current_idx,
                    bucketize(remaining_capacity),
                    bucketize(len(remaining_customers)),
                    vehicle_idx,
                )
        else:
            # Aller chez un client
            ci = action
            d = dist[current_idx][ci]
            reward = -d
            current_route_dist += d
            total_distance += d
            current_route_nodes.append(ci)
            remaining_capacity -= customers[ci - 1].demand
            current_route_load += customers[ci - 1].demand
            remaining_customers.remove(ci)
            current_idx = ci

            next_state = (
                current_idx,
                bucketize(remaining_capacity),
                bucketize(len(remaining_customers)),
                vehicle_idx,
            )

        # ----- Mise à jour de Q (Q-learning) -----
        qs = Q[state]
        old_q = qs[action]

        if next_state is None:
            target = reward
        else:
            # Prochaines actions possibles pour next_state
            next_actions: List[int] = []
            for ci in list(remaining_customers):
                if customers[ci - 1].demand <= remaining_capacity:
                    next_actions.append(ci)
            if current_idx != 0:
                next_actions.append(0)

            if not next_actions:
                target = reward
            else:
                if next_state not in Q:
                    Q[next_state] = {a: 0.0 for a in next_actions}
                else:
                    for a in next_actions:
                        Q[next_state].setdefault(a, 0.0)
                max_next_q = max(Q[next_state][a] for a in next_actions)
                target = reward + gamma * max_next_q

        qs[action] = old_q + alpha * (target - old_q)

        if next_state is None:
            break

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

    rng = random.Random(params.seed)
    Q: Dict[Tuple[int, int, int, int], Dict[int, float]] = {}

    best_routes: List[EpisodeRoute] = []
    best_distance = float("inf")
    best_feasible = False
    log: List[str] = []

    for ep in range(1, params.episodes + 1):
        ep_result = run_episode(
            dist=dist,
            customers=customers,
            vehicles=vehicles,
            bucket_size=params.bucketSize,
            max_steps=params.maxSteps,
            Q=Q,
            alpha=params.alpha,
            gamma=params.gamma,
            epsilon=params.epsilon,
            rng=rng,
        )
        log.append(
            f"Episode {ep}: distance={ep_result.total_distance:.2f}, feasible={ep_result.feasible}"
        )

        if ep_result.feasible:
            if (not best_feasible) or (ep_result.total_distance < best_distance):
                best_feasible = True
                best_distance = ep_result.total_distance
                best_routes = ep_result.routes
        elif not best_feasible and ep_result.total_distance < best_distance:
            best_distance = ep_result.total_distance
            best_routes = ep_result.routes

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

    return RlSolveResponse(
        distance=best_distance,
        feasible=best_feasible,
        vehiclesUsed=len(routes_out),
        routes=routes_out,
        violations=violations,
        log=log,
        runtimeMs=runtime_ms,
    )
