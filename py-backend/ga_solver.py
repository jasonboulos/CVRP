# py-backend/ga_solver.py

import math
import random
import time
from typing import List, Tuple

from models import Instance, GAParams, RlSolveResponse, RoutePlan, ViolationsDto, Customer
from cvrp_eval import evaluate_solution_strict, build_customer_map


Chromosome = List[int]  # permutation des ids clients


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
) -> List[RoutePlan]:
    """
    Transforme une permutation de clients en solution CVRP :
    on remplit les véhicules séquentiellement en respectant la capacité si possible,
    sinon on force dans la dernière route (ce sera marqué comme infaisable par evaluate_solution_strict).
    """
    vehicles = instance.vehicles.vehicles
    capacities = [max(1, v.capacity) for v in vehicles]

    routes: List[RoutePlan] = []
    for v in vehicles:
        routes.append(RoutePlan(vehicle=v.id, nodes=[0, 0], load=0, distance=0.0))

    for cid in chrom:
        demand = customers_map[cid].demand
        placed = False

        for idx, r in enumerate(routes):
            cap = capacities[idx]
            if r.load + demand <= cap:
                r.nodes.insert(len(r.nodes) - 1, cid)
                r.load += demand
                placed = True
                break

        if not placed:
            # si aucun véhicule ne peut accueillir le client -> on le force dans la dernière route
            routes[-1].nodes.insert(len(routes[-1].nodes) - 1, cid)
            routes[-1].load += demand

    return routes


def _fitness(
    chrom: Chromosome,
    instance: Instance,
    customers_map: dict[int, Customer],
) -> Tuple[float, bool, int, List[RoutePlan]]:
    """
    Calcule le coût du chromosome :
      - si solution faisable : fitness = distance totale
      - sinon : fitness très grande (infaisable, donc éliminé)
    """
    routes = _decode_chromosome_to_routes(chrom, instance, customers_map)
    dist, feasible, viol = evaluate_solution_strict(routes, instance)
    if not feasible:
        # on pénalise fortement les solutions infaisables
        return 1e12 + viol, False, viol, routes
    return dist, True, viol, routes


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

    # 1. Initialisation
    population = _init_population(instance, params, rng)

    best_chrom: Chromosome | None = None
    best_dist = math.inf
    best_routes: List[RoutePlan] | None = None
    best_viol = 0

    log: List[str] = [
        f"[GA] start: popSize={params.populationSize}, generations={params.generations}, mutation={params.mutationRate}"
    ]

    # 2. Boucle principale
    for gen in range(params.generations):
        fitnesses: List[float] = []
        routes_cache: List[List[RoutePlan]] = []
        feasible_flags: List[bool] = []

        # évaluation de la population
        for chrom in population:
            fit, feasible, viol, routes = _fitness(chrom, instance, customers_map)
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
        _, feasible, viol, routes = _fitness(first_chrom, instance, customers_map)
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
