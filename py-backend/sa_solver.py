# py-backend/sa_solver.py

import math
import random
import time
from typing import List, Tuple

from models import Instance, RlSolveResponse, RoutePlan, ViolationsDto, SaParams
from cvrp_eval import evaluate_solution_strict, build_customer_map, compute_route_distance


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


def _construct_initial_solution(instance: Instance, seed: str) -> List[RoutePlan]:
    """
    Construction simple :
    - on essaie de répartir les clients sur les véhicules sans dépasser la capacité
    - si ce n'est pas parfaitement faisable, le recuit simulé essaiera d'améliorer.
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

            old_dist = compute_route_distance(r.nodes, instance, customers_map)
            new_nodes = list(r.nodes)
            new_nodes.insert(len(new_nodes) - 1, cust.id)
            new_dist = compute_route_distance(new_nodes, instance, customers_map)
            increase = new_dist - old_dist

            if increase < best_increase:
                best_increase = increase
                best_route_idx = idx

        if best_route_idx is None:
            # si aucune route ne peut accueillir ce client -> on force dans la dernière (peut créer une violation)
            routes[-1].nodes.insert(len(routes[-1].nodes) - 1, cust.id)
            routes[-1].load += cust.demand
        else:
            r = routes[best_route_idx]
            r.nodes.insert(len(r.nodes) - 1, cust.id)
            r.load += cust.demand

    # met à jour distance / feasibility (info)
    dist, feasible, viol = evaluate_solution_strict(routes, instance)
    if not feasible:
        print(f"[SA] Solution initiale infaisable, viol={viol}")
    return routes


def _generate_random_relocate_move(
    routes: List[RoutePlan],
    rng: random.Random,
) -> Tuple[int, int, int, int]:
    """
    Mouvement relocate aléatoire :
    renvoie (index_route_source, position_client, index_route_dest, position_insertion).
    """
    non_empty = [i for i, r in enumerate(routes) if len(r.nodes) > 2]
    src_idx = rng.choice(non_empty)
    src_route = routes[src_idx]

    client_pos = rng.randrange(1, len(src_route.nodes) - 1)
    dst_idx = rng.randrange(len(routes))
    dst_route = routes[dst_idx]

    insert_pos = rng.randrange(1, len(dst_route.nodes))
    return src_idx, client_pos, dst_idx, insert_pos


def solve_cvrp_sa(instance: Instance, params: SaParams) -> RlSolveResponse:
    """
    Recuit simulé "propre" :
    - objectif = distance totale
    - on n'accepte comme voisins que des solutions faisables (capacités respectées, visite unique)
    """
    start_time = time.time()
    rng = random.Random(params.seed)

    # solution initiale
    current_routes = _construct_initial_solution(instance, params.seed)
    current_dist, feasible, viol = evaluate_solution_strict(current_routes, instance)
    if not feasible:
        print(f"[SA] Solution initiale infaisable, viol={viol}")

    best_routes = _clone_routes(current_routes)
    best_dist = current_dist if feasible else math.inf

    T = float(params.startTemp)
    cooling = float(params.cooling)
    iterations = params.iterations

    log = [
        f"[SA] start, dist={current_dist:.2f}, feasible={feasible}, viol={viol}",
        f"iterations={iterations}, startTemp={T}, cooling={cooling}",
    ]

    for it in range(iterations):
        # génère un voisin par relocate
        src_idx, client_pos, dst_idx, insert_pos = _generate_random_relocate_move(current_routes, rng)

        neighbor = _clone_routes(current_routes)
        n_src = neighbor[src_idx]
        n_dst = neighbor[dst_idx]

        client_id = n_src.nodes.pop(client_pos)
        insert_pos_clamped = max(1, min(insert_pos, len(n_dst.nodes)))
        n_dst.nodes.insert(insert_pos_clamped, client_id)

        neigh_dist, feas_n, viol_n = evaluate_solution_strict(neighbor, instance)
        if not feas_n:
            # on ignore les voisins infaisables (modèle mathématique strict)
            T = max(T * cooling, 1e-3)
            continue

        # delta = variation de distance (objectif)
        if math.isfinite(current_dist):
            delta = neigh_dist - current_dist
        else:
            # si la solution courante est inf (infaisable au départ), on accepte tout voisin faisable
            delta = -1.0

        accept = False
        if delta < 0:
            accept = True
        else:
            if T > 1e-8:
                prob = math.exp(-delta / T)
                if rng.random() < prob:
                    accept = True

        if accept:
            current_routes = neighbor
            current_dist = neigh_dist

            if neigh_dist < best_dist:
                best_dist = neigh_dist
                best_routes = _clone_routes(neighbor)
                log.append(f"[SA] iter {it}: new best dist={best_dist:.2f}")

        # refroidissement
        T = max(T * cooling, 1e-3)

    final_dist, feasible_final, viol_final = evaluate_solution_strict(best_routes, instance)
    vehicles_used = len([r for r in best_routes if len(r.nodes) > 2])
    runtime_ms = int((time.time() - start_time) * 1000)

    log.append(
        f"[SA] end: dist={final_dist:.2f}, feasible={feasible_final}, viol={viol_final}, runtimeMs={runtime_ms}"
    )

    return RlSolveResponse(
        distance=round(final_dist, 2),
        feasible=feasible_final,
        vehiclesUsed=vehicles_used,
        routes=best_routes,
        violations=ViolationsDto(capacity=viol_final),
        log=log,
        runtimeMs=runtime_ms,
    )
