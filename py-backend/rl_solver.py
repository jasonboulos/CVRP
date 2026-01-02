"""
Q-Learning solver for CVRP with scale-aware reward shaping.

Key improvements over baseline:
- Distance normalization: rewards scale with instance size
- Epsilon decay: exploration decreases over training
- Generalized state: uses has_more_vehicles instead of vehicle_idx
- Detailed logging: explains decisions for presentation
"""
import math
import random
import statistics
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from models import (
    Instance,
    QParams,
    RoutePlan,
    ViolationsDto,
    RlSolveResponse,
)

# ============================================================================
# REWARD SHAPING COEFFICIENTS (dimensionless, tuned for CVRPLIB instances)
# ============================================================================
# These coefficients are multiplied by normalized quantities, so they work
# consistently across instances of different scales (A-n32-k5 vs A-n80-k10).

K_STEP = 1.0          # Distance penalty multiplier (step_reward = -d/D_scale * K_STEP)
K_SERVE = 0.3         # Bonus for serving a customer (encourages progress)
K_EARLY_RETURN = 3.0  # Penalty for returning early with capacity left
K_NEW_VEHICLE = 4.0   # Penalty for starting a new vehicle
K_UNSERVED = 20.0     # Penalty per unserved customer at episode end
K_FULL = 25.0         # Bonus for serving all customers (full service)

# ============================================================================
# Internal data structures
# ============================================================================

@dataclass
class EpisodeRoute:
    """A single vehicle route in the solution."""
    vehicle: int          # vehicle ID
    nodes: List[int]      # node indices (0 = depot, 1..N = customers)
    load: int             # total demand served
    distance: float       # route distance


@dataclass
class EpisodeResult:
    """Result of a single training episode."""
    total_distance: float
    feasible: bool
    vehicles_used: int
    routes: List[EpisodeRoute]
    unserved_count: int = 0


# ============================================================================
# Helper functions
# ============================================================================

def build_distance_matrix(coords: List[Tuple[float, float]]) -> List[List[float]]:
    """Build Euclidean distance matrix between all nodes."""
    n = len(coords)
    mat = [[0.0] * n for _ in range(n)]
    for i in range(n):
        x1, y1 = coords[i]
        for j in range(n):
            if i != j:
                x2, y2 = coords[j]
                mat[i][j] = math.hypot(x1 - x2, y1 - y2)
    return mat


def compute_distance_scale(dist: List[List[float]], n_customers: int) -> float:
    """
    Compute characteristic distance scale for reward normalization.
    
    Uses median of depot→customer distances. This is robust to outliers
    and provides a stable reference for scaling rewards across instances.
    For typical CVRPLIB instances (coordinates 0-100), this is around 40-60.
    
    WHY: Makes reward magnitudes consistent across A-n32-k5 and A-n80-k10
    """
    if n_customers == 0:
        return 1.0
    depot_dists = [dist[0][i] for i in range(1, n_customers + 1)]
    scale = statistics.median(depot_dists)
    return max(scale, 1.0)  # Avoid division by zero


# ============================================================================
# Q-Learning Episode
# ============================================================================

def run_episode(
    dist: List[List[float]],
    customers,
    vehicles,
    bucket_size: int,
    max_steps: int,
    Q: Dict[Tuple, Dict[int, float]],
    alpha: float,
    gamma: float,
    epsilon: float,
    rng: random.Random,
    D_scale: float,
) -> EpisodeResult:
    """
    Run a single Q-learning episode.
    
    State representation: (current_node, capacity_bucket, remaining_bucket, has_more_vehicles)
    - current_node: where the vehicle is now (0=depot, i=customer)
    - capacity_bucket: remaining capacity // bucket_size
    - remaining_bucket: remaining customers // bucket_size  
    - has_more_vehicles: 1 if more vehicles available, 0 otherwise
    
    This representation generalizes better than including vehicle_idx directly,
    because Q-values learned for "vehicle 2" can transfer to "vehicle 3".
    """
    n_cust = len(customers)
    n_vehicles = len(vehicles)
    
    if not vehicles:
        return EpisodeResult(float("inf"), False, 0, [], n_cust)
    
    # Initialize tracking
    remaining_customers = set(range(1, n_cust + 1))  # indices 1..N
    routes: List[EpisodeRoute] = []
    total_distance = 0.0
    vehicle_idx = 0
    
    # Current route state
    vehicle_capacity = vehicles[vehicle_idx].capacity
    remaining_capacity = vehicle_capacity
    current_idx = 0  # Start at depot
    current_route_nodes = [0]
    current_route_load = 0
    current_route_dist = 0.0
    
    def bucketize(val: int) -> int:
        return val // bucket_size
    
    def get_state() -> Tuple[int, int, int, int]:
        """Build state tuple for Q-table lookup."""
        cap_bucket = bucketize(remaining_capacity)
        rem_bucket = bucketize(len(remaining_customers))
        has_more = 1 if vehicle_idx < n_vehicles - 1 else 0
        return (current_idx, cap_bucket, rem_bucket, has_more)
    
    steps = 0
    while steps < max_steps:
        steps += 1
        
        # ----- Build action set -----
        # Actions: customer indices that fit in capacity, or 0 (return to depot)
        actions: List[int] = []
        
        for ci in remaining_customers:
            demand = customers[ci - 1].demand
            if demand <= remaining_capacity:
                actions.append(ci)
        
        # Can return to depot if not already there
        if current_idx != 0:
            actions.append(0)
        
        # ----- No actions available: force route closure -----
        if not actions:
            # Close current route and move to next vehicle
            if current_idx != 0:
                d_back = dist[current_idx][0]
                current_route_dist += d_back
                total_distance += d_back
                current_route_nodes.append(0)
            
            if current_route_load > 0:
                routes.append(EpisodeRoute(
                    vehicle=vehicles[vehicle_idx].id,
                    nodes=current_route_nodes,
                    load=current_route_load,
                    distance=current_route_dist,
                ))
            
            vehicle_idx += 1
            if vehicle_idx >= n_vehicles or not remaining_customers:
                break  # No more vehicles or all served
            
            # Reset for new vehicle
            vehicle_capacity = vehicles[vehicle_idx].capacity
            remaining_capacity = vehicle_capacity
            current_idx = 0
            current_route_nodes = [0]
            current_route_load = 0
            current_route_dist = 0.0
            continue
        
        # ----- Get/initialize Q-values for current state -----
        state = get_state()
        if state not in Q:
            Q[state] = {a: 0.0 for a in actions}
        else:
            for a in actions:
                Q[state].setdefault(a, 0.0)
        
        # ----- Epsilon-greedy action selection -----
        if rng.random() < epsilon:
            action = rng.choice(actions)
        else:
            qs = Q[state]
            max_q = max(qs[a] for a in actions)
            best_actions = [a for a in actions if qs[a] == max_q]
            action = rng.choice(best_actions)
        
        # Prevent staying at depot when we could visit customers
        if action == 0 and current_idx == 0:
            non_zero = [a for a in actions if a != 0]
            if non_zero:
                action = rng.choice(non_zero)
        
        # ----- Execute action and compute reward -----
        if action == 0:
            # Return to depot: close current route
            d = dist[current_idx][0]
            
            # Base reward: normalized distance cost
            # WHY: -d/D_scale gives consistent magnitude across instances
            reward = -K_STEP * d / D_scale
            
            # Early return penalty: discourage returning with unused capacity
            # WHY: Penalty scales with how much capacity is wasted and how many customers remain
            if remaining_customers and remaining_capacity > 0:
                cap_ratio = remaining_capacity / vehicle_capacity
                cust_ratio = len(remaining_customers) / n_cust
                reward -= K_EARLY_RETURN * cap_ratio * cust_ratio
            
            # Update route
            current_route_dist += d
            total_distance += d
            current_route_nodes.append(0)
            
            routes.append(EpisodeRoute(
                vehicle=vehicles[vehicle_idx].id,
                nodes=current_route_nodes,
                load=current_route_load,
                distance=current_route_dist,
            ))
            
            # Move to next vehicle
            vehicle_idx += 1
            
            # New vehicle penalty (if we need to start another)
            # WHY: Encourage compact routes, fewer vehicles used
            if vehicle_idx < n_vehicles and remaining_customers:
                reward -= K_NEW_VEHICLE
            
            # Determine next state
            if vehicle_idx >= n_vehicles or not remaining_customers:
                next_state = None  # Terminal
            else:
                vehicle_capacity = vehicles[vehicle_idx].capacity
                remaining_capacity = vehicle_capacity
                current_idx = 0
                current_route_nodes = [0]
                current_route_load = 0
                current_route_dist = 0.0
                next_state = get_state()
        else:
            # Visit a customer
            ci = action
            d = dist[current_idx][ci]
            
            # Base reward: normalized distance cost + serve bonus
            # WHY: Small positive for progress helps Q-values propagate faster
            reward = -K_STEP * d / D_scale + K_SERVE
            
            # Update state
            current_route_dist += d
            total_distance += d
            current_route_nodes.append(ci)
            remaining_capacity -= customers[ci - 1].demand
            current_route_load += customers[ci - 1].demand
            remaining_customers.remove(ci)
            current_idx = ci
            
            next_state = get_state()
        
        # ----- Q-learning update -----
        old_q = Q[state][action]
        
        if next_state is None:
            # Terminal state: apply final rewards
            unserved = len(remaining_customers)
            
            # WHY: Large penalty per unserved customer dominates distance
            terminal_reward = -K_UNSERVED * unserved
            
            # WHY: Bonus for full service encourages feasible solutions
            if unserved == 0:
                terminal_reward += K_FULL
            
            target = reward + terminal_reward
        else:
            # Non-terminal: bootstrap from next state
            next_actions: List[int] = []
            for ci in remaining_customers:
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
        
        Q[state][action] = old_q + alpha * (target - old_q)
        
        if next_state is None:
            break
    
    feasible = len(remaining_customers) == 0
    return EpisodeResult(
        total_distance=total_distance,
        feasible=feasible,
        vehicles_used=len(routes),
        routes=routes,
        unserved_count=len(remaining_customers)
    )


# ============================================================================
# Main solver (called by FastAPI)
# ============================================================================

def solve_cvrp_qlearning(instance: Instance, params: QParams) -> RlSolveResponse:
    """
    Solve CVRP using tabular Q-learning with epsilon-greedy exploration.
    
    Features:
    - Scale-aware rewards: penalties normalized by instance distance scale
    - Epsilon decay: exploration decreases during training
    - Generalized state: transfers across vehicles
    - Detailed logging: for explainability during presentation
    """
    start = time.time()
    
    # Extract instance data
    depot = instance.depot
    customers = instance.customers
    vehicles = instance.vehicles.vehicles
    n_cust = len(customers)
    
    # Build distance matrix
    coords = [(depot.x, depot.y)] + [(c.x, c.y) for c in customers]
    dist = build_distance_matrix(coords)
    
    # Compute distance scale for reward normalization
    D_scale = compute_distance_scale(dist, n_cust)
    
    # Initialize
    rng = random.Random(params.seed)
    Q: Dict[Tuple, Dict[int, float]] = {}
    
    # Tracking
    best_routes: List[EpisodeRoute] = []
    best_distance = float("inf")
    best_feasible = False
    best_vehicles = 0
    best_unserved = n_cust
    
    feasible_count = 0
    feasible_distances: List[float] = []
    
    log: List[str] = []
    log.append(f"Instance: {instance.id}, customers={n_cust}, vehicles={len(vehicles)}, D_scale={D_scale:.2f}")
    
    # Epsilon decay setup
    epsilon = params.epsilonStart
    
    # Training loop
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
            epsilon=epsilon,
            rng=rng,
            D_scale=D_scale,
        )
        
        # Track feasibility
        if ep_result.feasible:
            feasible_count += 1
            feasible_distances.append(ep_result.total_distance)
            
            if not best_feasible or ep_result.total_distance < best_distance:
                best_feasible = True
                best_distance = ep_result.total_distance
                best_routes = ep_result.routes
                best_vehicles = ep_result.vehicles_used
                best_unserved = 0
        elif not best_feasible and ep_result.total_distance < best_distance:
            best_distance = ep_result.total_distance
            best_routes = ep_result.routes
            best_vehicles = ep_result.vehicles_used
            best_unserved = ep_result.unserved_count
        
        # Periodic logging (every 50 episodes or at key points)
        if ep <= 5 or ep % 50 == 0 or ep == params.episodes:
            log.append(
                f"Ep {ep}: dist={ep_result.total_distance:.1f}, "
                f"feas={ep_result.feasible}, veh={ep_result.vehicles_used}, "
                f"eps={epsilon:.3f}, Q-size={len(Q)}"
            )
        
        # Epsilon decay (exponential)
        epsilon = max(params.epsilonMin, epsilon * params.epsilonDecay)
    
    runtime_ms = int((time.time() - start) * 1000)
    
    # Handle no solution found
    if best_distance == float("inf"):
        best_distance = 0.0
        best_routes = []
        best_feasible = False
    
    # Convert routes to output format (indices → original IDs)
    routes_out: List[RoutePlan] = []
    for r in best_routes:
        node_ids: List[int] = []
        for idx in r.nodes:
            if idx == 0:
                node_ids.append(depot.id)
            else:
                node_ids.append(customers[idx - 1].id)
        routes_out.append(RoutePlan(
            vehicle=r.vehicle,
            nodes=node_ids,
            load=r.load,
            distance=r.distance,
        ))
    
    # Final summary log
    feasibility_rate = 100 * feasible_count / params.episodes if params.episodes > 0 else 0
    avg_feasible_dist = statistics.mean(feasible_distances) if feasible_distances else 0
    
    log.append("---")
    log.append(
        f"FINAL: best_dist={best_distance:.2f}, vehicles={best_vehicles}, "
        f"feasible={best_feasible}, unserved={best_unserved}"
    )
    log.append(
        f"Stats: feasibility_rate={feasibility_rate:.1f}%, "
        f"feasible_count={feasible_count}/{params.episodes}, "
        f"avg_feasible_dist={avg_feasible_dist:.2f}"
    )
    log.append(f"Q-table size: {len(Q)} states")
    
    violations = ViolationsDto(capacity=0)  # Capacity respected by construction
    
    return RlSolveResponse(
        distance=best_distance,
        feasible=best_feasible,
        vehiclesUsed=len(routes_out),
        routes=routes_out,
        violations=violations,
        log=log,
        runtimeMs=runtime_ms,
    )


# ============================================================================
# Quick Benchmark Utility
# ============================================================================

def quick_rl_benchmark(
    instance: Instance,
    seeds: Optional[List[str]] = None,
    episodes: int = 500,
) -> Dict:
    """
    Run Q-learning solver multiple times with different seeds.
    
    Useful for comparing "before/after" changes or tuning hyperparameters.
    
    Args:
        instance: CVRP instance to solve
        seeds: List of random seeds (defaults to 5 seeds if None)
        episodes: Number of episodes per run
    
    Returns:
        dict with: feasible_count, best_distance, avg_distance, results
    """
    if seeds is None:
        seeds = ["12345", "42", "123", "999", "2024"]
    
    results = []
    for seed in seeds:
        params = QParams(
            episodes=episodes,
            epsilonStart=0.9,
            epsilonMin=0.05,
            epsilonDecay=0.995,
            seed=seed,
        )
        res = solve_cvrp_qlearning(instance, params)
        results.append({
            "seed": seed,
            "distance": res.distance,
            "feasible": res.feasible,
            "vehiclesUsed": res.vehiclesUsed,
            "runtimeMs": res.runtimeMs,
        })
    
    feasible_results = [r for r in results if r["feasible"]]
    
    return {
        "instance_id": instance.id,
        "runs": len(results),
        "feasible_count": len(feasible_results),
        "feasibility_rate": 100 * len(feasible_results) / len(results) if results else 0,
        "best_distance": min(r["distance"] for r in feasible_results) if feasible_results else None,
        "avg_distance": statistics.mean(r["distance"] for r in feasible_results) if feasible_results else None,
        "results": results,
    }
