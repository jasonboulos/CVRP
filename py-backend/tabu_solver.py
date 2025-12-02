# py-backend/tabu_solver.py

import time
import math
import random
from typing import List, Tuple

from models import Instance, RlSolveResponse, RoutePlan, ViolationsDto, TabuParams
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
    Construction simple mais faisable :
    - on répartit les clients sur les véhicules sans dépasser la capacité
    - on ferme chaque route par un retour au dépôt
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
            # problème mal paramétré (demande > capacité totale)
            # on le met dans la dernière route (cela rendra la solution infeasible)
            routes[-1].nodes.insert(len(routes[-1].nodes) - 1, cust.id)
            routes[-1].load += cust.demand
        else:
            r = routes[best_route_idx]
            r.nodes.insert(len(r.nodes) - 1, cust.id)
            r.load += cust.demand

    # mise à jour des distances et vérification
    dist, feasible, viol = evaluate_solution_strict(routes, instance)
    if not feasible:
        print("[TABU] Attention: solution initiale infaisable (violations de capacité) :", viol)
    return routes


def _generate_random_relocate_move(
    routes: List[RoutePlan],
    rng: random.Random,
) -> Tuple[int, int, int, int]:
    """Renvoie (src_idx, pos_client, dst_idx, pos_insert) pour un mouvement relocate aléatoire."""
    non_empty = [i for i, r in enumerate(routes) if len(r.nodes) > 2]
    src_idx = rng.choice(non_empty)
    src_route = routes[src_idx]

    client_pos = rng.randrange(1, len(src_route.nodes) - 1)
    dst_idx = rng.randrange(len(routes))
    dst_route = routes[dst_idx]

    insert_pos = rng.randrange(1, len(dst_route.nodes))
    return src_idx, client_pos, dst_idx, insert_pos


def solve_cvrp_tabu(instance: Instance, params: TabuParams) -> RlSolveResponse:
    """
    Tabu Search "propre" :
    - objectif = distance totale
    - seuls les voisins faisables (aucune violation de capacité) sont acceptés
    """
    start_time = time.time()
    rng = random.Random(params.seed)

    # solution de départ
    current_routes = _construct_initial_solution(instance, params.seed)
    current_dist, feasible, viol = evaluate_solution_strict(current_routes, instance)
    if not feasible:
        # On continue quand même, mais on n'acceptera comme best que des solutions faisables
        print(f"[TABU] Solution initiale infaisable, viol={viol}")

    best_routes = _clone_routes(current_routes)
    best_dist = current_dist if feasible else math.inf

    iterations = params.iterations
    tabu_tenure = params.tabuTenure

    # liste tabou : on mémorise des mouvements (client, src, dst)
    tabu_list: List[Tuple[int, int, int]] = []

    log = [
        f"[TABU] start, dist={current_dist:.2f}, feasible={feasible}",
        f"iterations={iterations}, tabuTenure={tabu_tenure}",
    ]

    for it in range(iterations):
        best_neighbor = None
        best_neighbor_dist = math.inf
        best_move = None

        # on échantillonne quelques mouvements aléatoires
        for _ in range(30):
            src_idx, client_pos, dst_idx, insert_pos = _generate_random_relocate_move(current_routes, rng)
            client_id = current_routes[src_idx].nodes[client_pos]
            move_key = (client_id, src_idx, dst_idx)

            # critère tabou simple
            if move_key in tabu_list:
                continue

            neighbor = _clone_routes(current_routes)
            n_src = neighbor[src_idx]
            n_dst = neighbor[dst_idx]

            cid = n_src.nodes.pop(client_pos)
            insert_pos_clamped = max(1, min(insert_pos, len(n_dst.nodes)))
            n_dst.nodes.insert(insert_pos_clamped, cid)

            dist_n, feas_n, _ = evaluate_solution_strict(neighbor, instance)
            if not feas_n:
                # on n'accepte pas de voisins infaisables (modèle mathématique strict)
                continue

            if dist_n < best_neighbor_dist:
                best_neighbor_dist = dist_n
                best_neighbor = neighbor
                best_move = move_key

        if best_neighbor is None:
            # aucun voisin faisable trouvé, on arrête
            log.append(f"[TABU] iter {it}: aucun voisin faisable trouvé, arrêt.")
            break

        current_routes = best_neighbor
        current_dist = best_neighbor_dist

        # mise à jour best global
        if current_dist < best_dist:
            best_dist = current_dist
            best_routes = _clone_routes(current_routes)
            log.append(f"[TABU] iter {it}: new best dist={best_dist:.2f}")

        # mise à jour liste tabou
        tabu_list.append(best_move)
        if len(tabu_list) > tabu_tenure:
            tabu_list.pop(0)

    final_dist, feasible, viol = evaluate_solution_strict(best_routes, instance)
    vehicles_used = len([r for r in best_routes if len(r.nodes) > 2])
    runtime_ms = int((time.time() - start_time) * 1000)

    log.append(
        f"[TABU] end: dist={final_dist:.2f}, feasible={feasible}, viol={viol}, runtimeMs={runtime_ms}"
    )

    return RlSolveResponse(
        distance=round(final_dist, 2),
        feasible=feasible,
        vehiclesUsed=vehicles_used,
        routes=best_routes,
        violations=ViolationsDto(capacity=viol),
        log=log,
        runtimeMs=runtime_ms,
    )
