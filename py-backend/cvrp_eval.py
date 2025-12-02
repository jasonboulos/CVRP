# py-backend/cvrp_eval.py

import math
from typing import Dict, List, Tuple

from models import Instance, RoutePlan, Customer


def build_customer_map(instance: Instance) -> Dict[int, Customer]:
    """Map id -> Customer pour accès rapide."""
    return {c.id: c for c in instance.customers}


def node_coords(node_id: int, instance: Instance, customers_map: Dict[int, Customer]) -> Tuple[float, float]:
    """Coordonnées (x, y) d'un noeud (0 = dépôt, sinon client)."""
    if node_id == 0:
        return instance.depot.x, instance.depot.y
    c = customers_map[node_id]
    return c.x, c.y


def compute_route_distance(nodes: List[int], instance: Instance, customers_map: Dict[int, Customer]) -> float:
    """Distance d'une route [0, i1, i2, ..., 0]."""
    dist = 0.0
    for i in range(len(nodes) - 1):
        x1, y1 = node_coords(nodes[i], instance, customers_map)
        x2, y2 = node_coords(nodes[i + 1], instance, customers_map)
        dx = x1 - x2
        dy = y1 - y2
        dist += math.hypot(dx, dy)
    return dist


def evaluate_solution_strict(
    routes: List[RoutePlan],
    instance: Instance,
) -> Tuple[float, bool, int]:
    """
    Évalue une solution selon la formulation mathématique :

    - distance_totale = somme des distances des routes
    - feasible = True si :
        * toutes les capacités sont respectées,
        * chaque client est visité exactement une fois
    - viol = somme des dépassements de capacité (info)

    Retourne : (distance_totale, feasible, viol)
    """
    customers_map = build_customer_map(instance)
    vehicles = instance.vehicles.vehicles
    capacities = [max(1, v.capacity) for v in vehicles]

    total_distance = 0.0
    total_violation = 0
    visited = set()

    # route.vehicle doit correspondre à un véhicule connu
    vehicle_id_to_index = {v.id: idx for idx, v in enumerate(vehicles)}

    for r in routes:
        if r.vehicle not in vehicle_id_to_index:
            # véhicule inconnu : solution invalide
            return math.inf, False, 0

        idx = vehicle_id_to_index[r.vehicle]
        cap = capacities[idx]

        load = 0
        for nid in r.nodes:
            if nid == 0:
                continue
            if nid in visited:
                # client visité plusieurs fois -> infaisable
                return math.inf, False, 0
            visited.add(nid)
            demand = customers_map[nid].demand
            load += demand
            if load > cap:
                total_violation += load - cap

        d = compute_route_distance(r.nodes, instance, customers_map)
        r.distance = round(d, 2)
        r.load = load
        total_distance += d

    # tous les clients doivent être visités exactement une fois
    if visited != set(customers_map.keys()):
        return math.inf, False, total_violation

    feasible = (total_violation == 0)
    return total_distance, feasible, total_violation
# py-backend/cvrp_eval.py

import math
from typing import Dict, List, Tuple

from models import Instance, RoutePlan, Customer


def build_customer_map(instance: Instance) -> Dict[int, Customer]:
    """Map id -> Customer pour accès rapide."""
    return {c.id: c for c in instance.customers}


def node_coords(node_id: int, instance: Instance, customers_map: Dict[int, Customer]) -> Tuple[float, float]:
    """Coordonnées (x, y) d'un noeud (0 = dépôt, sinon client)."""
    if node_id == 0:
        return instance.depot.x, instance.depot.y
    c = customers_map[node_id]
    return c.x, c.y


def compute_route_distance(nodes: List[int], instance: Instance, customers_map: Dict[int, Customer]) -> float:
    """Distance d'une route [0, i1, i2, ..., 0]."""
    dist = 0.0
    for i in range(len(nodes) - 1):
        x1, y1 = node_coords(nodes[i], instance, customers_map)
        x2, y2 = node_coords(nodes[i + 1], instance, customers_map)
        dx = x1 - x2
        dy = y1 - y2
        dist += math.hypot(dx, dy)
    return dist


def evaluate_solution_strict(
    routes: List[RoutePlan],
    instance: Instance,
) -> Tuple[float, bool, int]:
    """
    Évalue une solution selon la formulation mathématique :

    - distance_totale = somme des distances des routes
    - feasible = True si :
        * toutes les capacités sont respectées,
        * chaque client est visité exactement une fois
    - viol = somme des dépassements de capacité (info)

    Retourne : (distance_totale, feasible, viol)
    """
    customers_map = build_customer_map(instance)
    vehicles = instance.vehicles.vehicles
    capacities = [max(1, v.capacity) for v in vehicles]

    total_distance = 0.0
    total_violation = 0
    visited = set()

    # route.vehicle doit correspondre à un véhicule connu
    vehicle_id_to_index = {v.id: idx for idx, v in enumerate(vehicles)}

    for r in routes:
        if r.vehicle not in vehicle_id_to_index:
            # véhicule inconnu : solution invalide
            return math.inf, False, 0

        idx = vehicle_id_to_index[r.vehicle]
        cap = capacities[idx]

        load = 0
        for nid in r.nodes:
            if nid == 0:
                continue
            if nid in visited:
                # client visité plusieurs fois -> infaisable
                return math.inf, False, 0
            visited.add(nid)
            demand = customers_map[nid].demand
            load += demand
            if load > cap:
                total_violation += load - cap

        d = compute_route_distance(r.nodes, instance, customers_map)
        r.distance = round(d, 2)
        r.load = load
        total_distance += d

    # tous les clients doivent être visités exactement une fois
    if visited != set(customers_map.keys()):
        return math.inf, False, total_violation

    feasible = (total_violation == 0)
    return total_distance, feasible, total_violation
