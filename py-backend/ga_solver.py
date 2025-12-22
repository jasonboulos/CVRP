# py-backend/ga_solver.py

import math
import random
import time
from typing import List, Tuple

from models import Instance, GAParams, RlSolveResponse, RoutePlan, ViolationsDto, Customer
from cvrp_eval import evaluate_solution_strict, build_customer_map


Chromosome = List[int]  # permutation des ids clients


def _build_distance_cache(instance: Instance, customers_map: dict[int, Customer]):
    """Pré-calcule les distances euclidiennes entre tous les nœuds (0 + clients).

    Le cache est utilisé par le décodage (affectation guidée par le coût) et par
    l'amélioration locale (2-opt). Cela évite de recalculer des distances à haute fréquence
    lors des évaluations.
    """
    coords: dict[int, tuple[float, float]] = {0: (instance.depot.x, instance.depot.y)}
    for cid, c in customers_map.items():
        coords[cid] = (c.x, c.y)

    node_ids = list(coords.keys())
    cache: dict[tuple[int, int], float] = {}
    for i in node_ids:
        x1, y1 = coords[i]
        for j in node_ids:
            if i == j:
                cache[(i, j)] = 0.0
                continue
            x2, y2 = coords[j]
            cache[(i, j)] = math.hypot(x1 - x2, y1 - y2)

    def dist(a: int, b: int) -> float:
        return cache[(a, b)]

    return dist


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


def _init_population(
    instance: Instance, params: GAParams, rng: random.Random
) -> List[Chromosome]:
    customers = [c.id for c in instance.customers]
    pop: List[Chromosome] = []
    for _ in range(params.populationSize):
        chrom = customers[:]
        rng.shuffle(chrom)
        pop.append(chrom)
    return pop


def _decode_chromosome_to_routes(
    chrom: Chromosome,
    instance: Instance,
    customers_map: dict[int, Customer],
    dist,
) -> List[RoutePlan]:
    """
    Transforme une permutation de clients en solution CVRP.

    Décodage guidé par le coût : pour chaque client, on choisit la tournée (véhicule)
    réalisable qui minimise le surcoût de l'insertion en fin de route.

    Si aucune tournée ne peut accueillir le client (capacité insuffisante), on l'insère
    dans la tournée qui minimise la violation de capacité (overflow), puis le surcoût.
    La solution sera alors pénalisée par l'évaluation stricte.
    """
    vehicles = instance.vehicles.vehicles
    capacities = [max(1, v.capacity) for v in vehicles]

    routes: List[RoutePlan] = []
    for v in vehicles:
        routes.append(RoutePlan(vehicle=v.id, nodes=[0, 0], load=0, distance=0.0))

    for cid in chrom:
        demand = customers_map[cid].demand

        best_idx = None
        best_delta = math.inf
        best_rem_after = math.inf

        # 1) Essayer d'abord les tournées réalisables : minimiser le surcoût d'insertion
        for idx, r in enumerate(routes):
            cap = capacities[idx]
            if r.load + demand > cap:
                continue

            last = r.nodes[-2]  # dernier nœud avant le retour dépôt
            delta = dist(last, cid) + dist(cid, 0) - dist(last, 0)
            rem_after = cap - (r.load + demand)

            if (delta < best_delta) or (delta == best_delta and rem_after < best_rem_after):
                best_delta = delta
                best_rem_after = rem_after
                best_idx = idx

        # 2) Si aucune tournée ne peut accueillir : minimiser la violation, puis le surcoût
        if best_idx is None:
            best_overflow = math.inf
            for idx, r in enumerate(routes):
                cap = capacities[idx]
                overflow = max(0, r.load + demand - cap)
                last = r.nodes[-2]
                delta = dist(last, cid) + dist(cid, 0) - dist(last, 0)
                if (overflow < best_overflow) or (overflow == best_overflow and delta < best_delta):
                    best_overflow = overflow
                    best_delta = delta
                    best_idx = idx

        # insertion en fin de tournée (avant le dépôt)
        r = routes[best_idx]
        r.nodes.insert(len(r.nodes) - 1, cid)
        r.load += demand

    return routes


def _two_opt_intra_route(nodes: List[int], dist, max_passes: int = 30) -> List[int]:
    """Amélioration locale 2-opt intra-tournée (0 ... 0).

    Ne modifie pas l'ensemble des clients servis : uniquement l'ordre de visite dans la tournée.
    """
    if len(nodes) <= 4:  # [0, a, 0] ou [0, a, b, 0]
        return nodes

    best = nodes
    n = len(best)
    passes = 0
    improved = True

    while improved and passes < max_passes:
        improved = False
        passes += 1
        # i et k définissent le segment à inverser : (i..k)
        for i in range(1, n - 2):
            a, b = best[i - 1], best[i]
            for k in range(i + 1, n - 1):
                c, d = best[k], best[k + 1]
                # gain si on remplace (a-b, c-d) par (a-c, b-d)
                gain = (dist(a, b) + dist(c, d)) - (dist(a, c) + dist(b, d))
                if gain > 1e-9:
                    best = best[:i] + list(reversed(best[i : k + 1])) + best[k + 1 :]
                    improved = True
                    break
            if improved:
                break

    return best


def _local_improve_routes(routes: List[RoutePlan], dist) -> None:
    """Applique une amélioration locale légère à chaque tournée (2-opt intra-route)."""
    for r in routes:
        # ignorer les routes vides [0,0]
        if len(r.nodes) <= 2:
            continue
        r.nodes = _two_opt_intra_route(r.nodes, dist)


def _fitness(
    chrom: Chromosome,
    instance: Instance,
    customers_map: dict[int, Customer],
    dist_fn,
) -> Tuple[float, bool, int, List[RoutePlan]]:
    """
    Calcule le coût du chromosome :
      - si solution faisable : fitness = distance totale
      - sinon : fitness très grande (infaisable, donc éliminé)
    """
    routes = _decode_chromosome_to_routes(chrom, instance, customers_map, dist_fn)
    # amélioration locale légère (intra-route) avant évaluation
    _local_improve_routes(routes, dist_fn)
    total_dist, feasible, viol = evaluate_solution_strict(routes, instance)
    if not feasible:
        # on pénalise fortement les solutions infaisables (tout en conservant un gradient via viol)
        return 1e9 + 1e6 * viol, False, viol, routes
    return total_dist, True, viol, routes


def _tournament_selection(
    population: List[Chromosome],
    fitnesses: List[float],
    rng: random.Random,
    k: int = 3,
) -> Chromosome:
    """Sélection par tournoi."""
    best_idx = None
    best_fit = math.inf
    n = len(population)
    for _ in range(k):
        i = rng.randrange(n)
        if fitnesses[i] < best_fit:
            best_fit = fitnesses[i]
            best_idx = i
    return population[best_idx][:]


def _order_crossover(p1: Chromosome, p2: Chromosome, rng: random.Random) -> Chromosome:
    """
    OX (Order Crossover) : conserve un segment de p1, puis complète
    avec l'ordre de p2 pour les gènes manquants.
    """
    n = len(p1)
    c = [-1] * n
    i, j = sorted([rng.randrange(n), rng.randrange(n)])
    # copie du segment de p1
    for idx in range(i, j + 1):
        c[idx] = p1[idx]

    # complète avec p2
    p2_idx = 0
    for idx in range(n):
        if c[idx] != -1:
            continue
        while p2[p2_idx] in c:
            p2_idx += 1
        c[idx] = p2[p2_idx]
    return c


def _mutate(chrom: Chromosome, mutation_rate: float, rng: random.Random) -> None:
    """Mutation par swap avec probabilité mutation_rate."""
    if rng.random() < mutation_rate:
        n = len(chrom)
        i, j = rng.randrange(n), rng.randrange(n)
        chrom[i], chrom[j] = chrom[j], chrom[i]


def solve_cvrp_ga(instance: Instance, params: GAParams) -> RlSolveResponse:
    """
    Algorithme génétique cohérent avec la formulation mathématique :
    - objectif = distance totale
    - seules les solutions faisables (evaluate_solution_strict) sont considérées “bonnes”
    - la meilleure solution renvoyée est faisable.
    """
    start_time = time.time()
    rng = random.Random(params.seed)
    customers_map = build_customer_map(instance)
    dist_fn = _build_distance_cache(instance, customers_map)

    # 1. Initialisation
    population = _init_population(instance, params, rng)

    best_chrom: Chromosome | None = None
    best_dist = math.inf
    best_routes: List[RoutePlan] | None = None
    best_viol = 0

    log: List[str] = [
        f"[GA] start: popSize={params.populationSize}, generations={params.generations}, "
        f"mutation={params.mutationRate}, decode=best-fit, local2opt=on"
    ]

    # 2. Boucle principale
    for gen in range(params.generations):
        fitnesses: List[float] = []
        routes_cache: List[List[RoutePlan]] = []
        feasible_flags: List[bool] = []

        # évaluation de la population
        for chrom in population:
            fit, feasible, viol, routes = _fitness(chrom, instance, customers_map, dist_fn)
            fitnesses.append(fit)
            routes_cache.append(routes)
            feasible_flags.append(feasible)

            if feasible and fit < best_dist:
                best_dist = fit
                best_chrom = chrom[:]
                best_routes = _clone_routes(routes)
                best_viol = viol

        log.append(
            f"[GA] gen {gen}: bestDistSoFar={best_dist:.2f}, "
            f"bestFitnessInGen={min(fitnesses):.2f}, "
            f"feasibleCount={sum(1 for f in feasible_flags if f)}"
        )

        # 3. Reproduction (elitisme + sélection + croisement + mutation)
        new_population: List[Chromosome] = []

        # Élitisime : si on a déjà un best_chrom faisable, on le garde
        if best_chrom is not None:
            new_population.append(best_chrom[:])

        while len(new_population) < params.populationSize:
            parent1 = _tournament_selection(population, fitnesses, rng)
            parent2 = _tournament_selection(population, fitnesses, rng)
            child = _order_crossover(parent1, parent2, rng)
            _mutate(child, params.mutationRate, rng)
            new_population.append(child)

        population = new_population

    # 4. Résultat final
    if best_chrom is None or best_routes is None or not math.isfinite(best_dist):
        # fallback : décoder le premier individu, même si ce n'est pas idéal
        first_chrom = population[0]
        _, feasible, viol, routes = _fitness(first_chrom, instance, customers_map, dist_fn)
        best_routes = routes
        best_dist, feasible_final, best_viol = evaluate_solution_strict(best_routes, instance)
    else:
        best_dist, feasible_final, best_viol = evaluate_solution_strict(best_routes, instance)

    vehicles_used = len([r for r in best_routes if len(r.nodes) > 2])
    runtime_ms = int((time.time() - start_time) * 1000)

    log.append(
        f"[GA] end: dist={best_dist:.2f}, feasible={feasible_final}, viol={best_viol}, runtimeMs={runtime_ms}"
    )

    return RlSolveResponse(
        distance=round(best_dist, 2),
        feasible=feasible_final,
        vehiclesUsed=vehicles_used,
        routes=best_routes,
        violations=ViolationsDto(capacity=best_viol),
        log=log,
        runtimeMs=runtime_ms,
    )
