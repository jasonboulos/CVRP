# py-backend/aco_solver.py

import math
import random
import time
from typing import List, Tuple

from models import Instance, RlSolveResponse, RoutePlan, ViolationsDto, AcoParams
from cvrp_eval import evaluate_solution_strict, build_customer_map, node_coords


def _clone_routes(routes: List[RoutePlan]) -> List[RoutePlan]:
    return [
        RoutePlan(
            vehicle=r.vehicle,
            nodes=list(r.nodes),
            load=r.load,
            distance=r.distance,
        )
        for r in routes
    ]


def _euclidean_distance(
    i: int, j: int, instance: Instance, customers_map
) -> float:
    x1, y1 = node_coords(i, instance, customers_map)
    x2, y2 = node_coords(j, instance, customers_map)
    dx = x1 - x2
    dy = y1 - y2
    return math.hypot(dx, dy)


def _construct_initial_solution(instance: Instance, seed: str) -> List[RoutePlan]:
    """
    Construction simple (même idée que SA/Tabu), pour servir de fallback si ACO ne trouve rien.
    """
    rng = random.Random(seed)
    customers = list(instance.customers)
    rng.shuffle(customers)

    vehicles = instance.vehicles.vehicles
    capacities = [max(1, v.capacity) for v in vehicles]
    customers_map = build_customer_map(instance)

    routes: List[RoutePlan] = []
    for v in vehicles:
        routes.append(RoutePlan(vehicle=v.id, nodes=[0, 0], load=0, distance=0.0))

    for cust in customers:
        best_route_idx = None
        best_increase = math.inf

        for idx, r in enumerate(routes):
            cap = capacities[idx]
            if r.load + cust.demand > cap:
                continue

            # approximation locale
            old_dist = 0.0
            for k in range(len(r.nodes) - 1):
                old_dist += _euclidean_distance(r.nodes[k], r.nodes[k + 1], instance, customers_map)

            new_nodes = list(r.nodes)
            new_nodes.insert(len(new_nodes) - 1, cust.id)
            new_dist = 0.0
            for k in range(len(new_nodes) - 1):
                new_dist += _euclidean_distance(new_nodes[k], new_nodes[k + 1], instance, customers_map)

            increase = new_dist - old_dist

            if increase < best_increase:
                best_increase = increase
                best_route_idx = idx

        if best_route_idx is None:
            routes[-1].nodes.insert(len(routes[-1].nodes) - 1, cust.id)
            routes[-1].load += cust.demand
        else:
            r = routes[best_route_idx]
            r.nodes.insert(len(r.nodes) - 1, cust.id)
            r.load += cust.demand

    return routes


def _build_solution_with_ants(
    instance: Instance,
    customers_map,
    capacities: List[int],
    pheromone: List[List[float]],
    alpha: float,
    beta: float,
    rng: random.Random,
) -> List[RoutePlan]:
    """
    Construit une solution avec une fourmi :
    - respecte les capacités lors de la construction
    - si des clients restent non servis, la solution sera déclarée infaisable par evaluate_solution_strict.
    """
    vehicles = instance.vehicles.vehicles
    customer_ids = [c.id for c in instance.customers]
    unserved = set(customer_ids)

    routes: List[RoutePlan] = []
    n_nodes = len(customer_ids) + 1  # 0 = dépôt

    # pré-calcul heuristique 1/d
    eta = [[0.0 for _ in range(n_nodes)] for _ in range(n_nodes)]
    for i in range(n_nodes):
        for j in range(n_nodes):
            if i == j:
                eta[i][j] = 0.0
            else:
                d = _euclidean_distance(i, j, instance, customers_map)
                eta[i][j] = 1.0 / d if d > 0 else 0.0

    for v_idx, v in enumerate(vehicles):
        route_nodes = [0]
        load = 0
        cap = capacities[v_idx]
        current_node = 0

        while True:
            candidates = [
                c_id for c_id in unserved
                if load + customers_map[c_id].demand <= cap
            ]
            if not candidates:
                break

            weights = []
            for c_id in candidates:
                tau = pheromone[current_node][c_id]
                h = eta[current_node][c_id]
                w = (tau ** alpha) * (h ** beta)
                weights.append(w)

            total_w = sum(weights)
            if total_w <= 0:
                chosen = rng.choice(candidates)
            else:
                r = rng.random() * total_w
                cum = 0.0
                chosen = candidates[-1]
                for c_id, w in zip(candidates, weights):
                    cum += w
                    if r <= cum:
                        chosen = c_id
                        break

            route_nodes.append(chosen)
            load += customers_map[chosen].demand
            unserved.remove(chosen)
            current_node = chosen

            if not unserved:
                break

        route_nodes.append(0)
        routes.append(RoutePlan(vehicle=v.id, nodes=route_nodes, load=load, distance=0.0))

        if not unserved:
            break

    # s'il reste des clients non servis, evaluate_solution_strict marquera la solution infaisable
    if unserved:
        # on laisse les clients non servis : cela sera détecté comme infaisable
        pass

    return routes


def solve_cvrp_aco(instance: Instance, params: AcoParams) -> RlSolveResponse:
    """
    ACO "propre" :
    - objectif = distance totale
    - seules les solutions faisables (capacités OK, visite unique) sont gardées pour la mise à jour.
    """
    start_time = time.time()

    customers_map = build_customer_map(instance)
    vehicles = instance.vehicles.vehicles
    capacities = [max(1, v.capacity) for v in vehicles]
    customer_ids = [c.id for c in instance.customers]
    n_nodes = len(customer_ids) + 1  # 0 = dépôt

    alpha = 1.0
    beta = 2.0
    rho = params.evaporation       # taux d'évaporation
    n_ants = max(1, params.ants)
    n_iterations = max(1, params.iterations)

    rng = random.Random(params.seed)

    # matrice de phéromones
    tau0 = 1.0
    pheromone = [[tau0 for _ in range(n_nodes)] for _ in range(n_nodes)]

    best_routes: List[RoutePlan] | None = None
    best_dist = math.inf
    best_viol = 0

    log = [
        f"[ACO] start: ants={n_ants}, iterations={n_iterations}, evap={rho}",
    ]

    for it in range(n_iterations):
        for _ in range(n_ants):
            routes = _build_solution_with_ants(
                instance, customers_map, capacities, pheromone, alpha, beta, rng
            )
            dist, feasible, viol = evaluate_solution_strict(routes, instance)
            if not feasible:
                continue  # on ignore les solutions infaisables

            if dist < best_dist:
                best_dist = dist
                best_routes = _clone_routes(routes)
                best_viol = viol
                log.append(f"[ACO] iter {it}: new best dist={best_dist:.2f}, viol={best_viol}")

        # évaporation
        for i in range(n_nodes):
            for j in range(n_nodes):
                pheromone[i][j] *= (1.0 - rho)
                if pheromone[i][j] < 1e-6:
                    pheromone[i][j] = 1e-6

        # renforcement global sur la meilleure solution connue
        if best_routes is not None and math.isfinite(best_dist) and best_dist > 0:
            delta_tau = 1.0 / best_dist
            for r in best_routes:
                for k in range(len(r.nodes) - 1):
                    a = r.nodes[k]
                    b = r.nodes[k + 1]
                    pheromone[a][b] += delta_tau
                    pheromone[b][a] += delta_tau

    if best_routes is None:
        # fallback : solution construite simplement
        best_routes = _construct_initial_solution(instance, params.seed)
        best_dist, feasible, best_viol = evaluate_solution_strict(best_routes, instance)
    else:
        best_dist, feasible, best_viol = evaluate_solution_strict(best_routes, instance)

    vehicles_used = len([r for r in best_routes if len(r.nodes) > 2])
    runtime_ms = int((time.time() - start_time) * 1000)

    log.append(
        f"[ACO] end: dist={best_dist:.2f}, feasible={feasible}, viol={best_viol}, runtimeMs={runtime_ms}"
    )

    return RlSolveResponse(
        distance=round(best_dist, 2),
        feasible=feasible,
        vehiclesUsed=vehicles_used,
        routes=best_routes,
        violations=ViolationsDto(capacity=best_viol),
        log=log,
        runtimeMs=runtime_ms,
    )
