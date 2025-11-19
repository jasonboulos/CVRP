import math
import random
import time
from dataclasses import dataclass
from typing import List, Tuple, Dict

from models import (
    Instance,
    GAParams,
    RoutePlan,
    ViolationsDto,
    RlSolveResponse,
)

# ---------- Outils communs ----------

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


@dataclass
class GARoute:
    vehicle: int       # id du véhicule
    nodes: List[int]   # 0 = dépôt, sinon id indexé 1..N
    load: int          # charge totale
    distance: float    # distance de la route


# ---------- Décodage d’un chromosome en routes CVRP ----------

def decode_chromosome(
    instance: Instance,
    dist: List[List[float]],
    chrom: List[int],
    big_penalty: float = 10_000.0,
) -> Tuple[float, float, bool, int, List[GARoute]]:
    """
    - chrom : permutation des clients (indices 1..N).
    - On parcourt le chromosome et on coupe les routes quand on atteint la capacité.
    - Si on utilise plus de véhicules que disponibles, on ajoute une grosse pénalité.
    Retourne :
      fitness, distance_sans_penalite, feasible, extra_vehicles, routes
    """
    depot = instance.depot
    customers = instance.customers
    vehicles = instance.vehicles.vehicles
    max_vehicles = len(vehicles)

    routes: List[GARoute] = []
    total_distance = 0.0

    # première route
    current_nodes = [0]    # on part du dépôt (index 0 dans la matrice)
    current_load = 0
    current_distance = 0.0
    current_idx = 0        # index dans la matrice de distance (0 = dépôt)
    vehicle_idx = 0
    extra_vehicles = 0

    for gene in chrom:
        cust_idx = gene             # 1..N
        c = customers[cust_idx - 1]
        demand = c.demand

        vehicle_index_safe = min(vehicle_idx, max_vehicles - 1)
        capacity = vehicles[vehicle_index_safe].capacity
        remaining_capacity = capacity - current_load

        # Si on ne peut plus ajouter ce client : on ferme la route et on passe au véhicule suivant
        if demand > remaining_capacity and len(current_nodes) > 1:
            # retour au dépôt
            d_back = dist[current_idx][0]
            current_distance += d_back
            total_distance += d_back
            current_nodes.append(0)

            routes.append(
                GARoute(
                    vehicle=vehicles[vehicle_index_safe].id,
                    nodes=current_nodes.copy(),
                    load=current_load,
                    distance=current_distance,
                )
            )

            # nouveau véhicule
            vehicle_idx += 1
            if vehicle_idx >= max_vehicles:
                # on dépasse la flotte autorisée
                extra_vehicles += 1
                vehicle_idx = max_vehicles - 1  # on réutilise le dernier juste pour l'id

            current_nodes = [0]
            current_load = 0
            current_distance = 0.0
            current_idx = 0
            vehicle_index_safe = min(vehicle_idx, max_vehicles - 1)
            capacity = vehicles[vehicle_index_safe].capacity
            remaining_capacity = capacity

        # Aller servir le client
        d_go = dist[current_idx][cust_idx]
        current_distance += d_go
        total_distance += d_go
        current_nodes.append(cust_idx)
        current_load += demand
        current_idx = cust_idx

    # Fermer la dernière route si elle contient des clients
    if len(current_nodes) > 1:
        d_back = dist[current_idx][0]
        current_distance += d_back
        total_distance += d_back
        current_nodes.append(0)
        vehicle_index_safe = min(vehicle_idx, max_vehicles - 1)
        routes.append(
            GARoute(
                vehicle=vehicles[vehicle_index_safe].id,
                nodes=current_nodes.copy(),
                load=current_load,
                distance=current_distance,
            )
        )

    vehicles_used = len(routes)
    # pénalité si on a utilisé plus de véhicules que disponibles
    extra_vehicles = max(0, vehicles_used - max_vehicles) + extra_vehicles
    feasible = (extra_vehicles == 0)
    penalty = big_penalty * extra_vehicles
    fitness = total_distance + penalty

    return fitness, total_distance, feasible, extra_vehicles, routes


# ---------- Opérateurs GA ----------

def tournament_select(pop: List[Dict], k: int, rng: random.Random) -> Dict:
    """Sélection par tournoi (on garde le meilleur de k individus tirés au hasard)."""
    best = None
    for _ in range(k):
        cand = rng.choice(pop)
        if best is None or cand["fitness"] < best["fitness"]:
            best = cand
    return best


def ordered_crossover(p1: List[int], p2: List[int], rng: random.Random) -> List[int]:
    """Crossover type OX (Ordered Crossover) pour permutations."""
    n = len(p1)
    a, b = sorted(rng.sample(range(n), 2))
    child = [None] * n
    child[a:b] = p1[a:b]

    pos = b
    for gene in p2:
        if gene not in child:
            if pos >= n:
                pos = 0
            child[pos] = gene
            pos += 1

    return child


def mutate_swap(chrom: List[int], rng: random.Random) -> None:
    """Mutation : échange de deux positions dans le chromosome."""
    i, j = rng.sample(range(len(chrom)), 2)
    chrom[i], chrom[j] = chrom[j], chrom[i]


# ---------- Solveur GA principal ----------

def solve_cvrp_ga(instance: Instance, params: GAParams) -> RlSolveResponse:
    start = time.time()

    depot = instance.depot
    customers = instance.customers

    coords = [(depot.x, depot.y)] + [(c.x, c.y) for c in customers]
    dist = build_distance_matrix(coords)

    rng = random.Random(params.seed)
    n = len(customers)
    base_genes = list(range(1, n + 1))

    # ----- Initialisation de la population -----
    population: List[Dict] = []
    for _ in range(params.populationSize):
        chrom = base_genes.copy()
        rng.shuffle(chrom)
        fitness, dist_raw, feasible, extra, routes = decode_chromosome(instance, dist, chrom)
        population.append(
            {
                "chrom": chrom,
                "fitness": fitness,
                "distance": dist_raw,
                "feasible": feasible,
                "routes": routes,
            }
        )

    # meilleur individu courant
    best = min(population, key=lambda ind: ind["fitness"])
    log: List[str] = [
        f"Init: bestDistance={best['distance']:.2f}, feasible={best['feasible']}"
    ]

    # ----- Boucle GA -----
    for gen in range(1, params.generations + 1):
        new_pop: List[Dict] = []

        # Élitisime : on garde le meilleur
        new_pop.append(best)

        # On complète la population
        while len(new_pop) < params.populationSize:
            p1 = tournament_select(population, k=3, rng=rng)
            p2 = tournament_select(population, k=3, rng=rng)

            child = ordered_crossover(p1["chrom"], p2["chrom"], rng)

            if rng.random() < params.mutationRate:
                mutate_swap(child, rng)

            fitness, dist_raw, feasible, extra, routes = decode_chromosome(
                instance, dist, child
            )
            new_pop.append(
                {
                    "chrom": child,
                    "fitness": fitness,
                    "distance": dist_raw,
                    "feasible": feasible,
                    "routes": routes,
                }
            )

        population = new_pop
        current_best = min(population, key=lambda ind: ind["fitness"])
        if current_best["fitness"] < best["fitness"]:
            best = current_best

        if gen % 10 == 0 or gen == params.generations:
            log.append(
                f"Generation {gen}: bestDistance={best['distance']:.2f}, feasible={best['feasible']}"
            )

    runtime_ms = int((time.time() - start) * 1000)

    # Conversion des routes internes -> RoutePlan pour l'API
    routes_out: List[RoutePlan] = []
    for r in best["routes"]:
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

    violations = ViolationsDto(capacity=0)  # les pénalités sont dans le fitness

    return RlSolveResponse(
        distance=best["distance"],
        feasible=best["feasible"],
        vehiclesUsed=len(routes_out),
        routes=routes_out,
        violations=violations,
        log=log,
        runtimeMs=runtime_ms,
    )
