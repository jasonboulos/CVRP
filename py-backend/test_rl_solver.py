"""
Sanity tests for the Q-Learning CVRP solver.

Run with: python -m pytest test_rl_solver.py -v
Or simply: python test_rl_solver.py
"""
import sys
from models import Instance, Depot, Customer, Vehicle, VehiclesConfig, QParams
from rl_solver import solve_cvrp_qlearning, build_distance_matrix, compute_distance_scale


def make_small_instance() -> Instance:
    """Create a small 5-customer instance for testing."""
    return Instance(
        id="test-small-5",
        depot=Depot(id=0, x=50.0, y=50.0),
        customers=[
            Customer(id=1, x=60.0, y=50.0, demand=10),
            Customer(id=2, x=40.0, y=50.0, demand=15),
            Customer(id=3, x=50.0, y=60.0, demand=20),
            Customer(id=4, x=50.0, y=40.0, demand=10),
            Customer(id=5, x=70.0, y=50.0, demand=25),
        ],
        vehicles=VehiclesConfig(vehicles=[
            Vehicle(id=1, capacity=50),
            Vehicle(id=2, capacity=50),
        ])
    )


def test_solver_returns_feasible_on_small_instance():
    """With enough vehicles and capacity, solver should return a feasible solution."""
    instance = make_small_instance()
    params = QParams(episodes=100, seed="42")
    result = solve_cvrp_qlearning(instance, params)
    
    assert result.feasible, f"Expected feasible solution, got: {result.log}"
    print(f"✓ Feasible solution found: distance={result.distance:.2f}, vehicles={result.vehiclesUsed}")


def test_solver_no_crash():
    """Solver should not crash on valid input."""
    instance = make_small_instance()
    params = QParams(episodes=50, seed="12345")
    
    try:
        result = solve_cvrp_qlearning(instance, params)
        assert result is not None
        print(f"✓ Solver completed without crash: runtime={result.runtimeMs}ms")
    except Exception as e:
        assert False, f"Solver crashed: {e}"


def test_routes_start_and_end_at_depot():
    """All routes should start and end at depot (id=0)."""
    instance = make_small_instance()
    params = QParams(episodes=100, seed="42")
    result = solve_cvrp_qlearning(instance, params)
    
    for route in result.routes:
        assert route.nodes[0] == 0, f"Route should start at depot, got: {route.nodes}"
        assert route.nodes[-1] == 0, f"Route should end at depot, got: {route.nodes}"
    print(f"✓ All {len(result.routes)} routes start and end at depot")


def test_all_customers_served_exactly_once():
    """In a feasible solution, each customer should appear exactly once across all routes."""
    instance = make_small_instance()
    params = QParams(episodes=100, seed="42")
    result = solve_cvrp_qlearning(instance, params)
    
    if not result.feasible:
        print("⚠ Skipping test: solution not feasible")
        return
    
    served_customers = []
    for route in result.routes:
        for node in route.nodes:
            if node != 0:  # Skip depot
                served_customers.append(node)
    
    expected = {c.id for c in instance.customers}
    actual = set(served_customers)
    
    assert actual == expected, f"Expected {expected}, got {actual}"
    assert len(served_customers) == len(expected), "Some customer served more than once"
    print(f"✓ All {len(expected)} customers served exactly once")


def test_determinism_same_seed():
    """Same seed should produce identical results."""
    instance = make_small_instance()
    params = QParams(episodes=50, seed="deterministic_test")
    
    result1 = solve_cvrp_qlearning(instance, params)
    result2 = solve_cvrp_qlearning(instance, params)
    
    assert result1.distance == result2.distance, f"Distances differ: {result1.distance} vs {result2.distance}"
    assert result1.feasible == result2.feasible, "Feasibility differs"
    assert result1.vehiclesUsed == result2.vehiclesUsed, "Vehicles used differs"
    print(f"✓ Deterministic: both runs produced distance={result1.distance:.2f}")


def test_distance_scale_computation():
    """Distance scale should be computed correctly."""
    coords = [(50, 50), (60, 50), (40, 50), (50, 60)]  # depot + 3 customers
    dist = build_distance_matrix(coords)
    scale = compute_distance_scale(dist, 3)
    
    # Distances from depot: 10, 10, 10 -> median = 10
    assert abs(scale - 10.0) < 0.1, f"Expected scale ~10, got {scale}"
    print(f"✓ Distance scale computed correctly: {scale}")


def test_empty_vehicles_handled():
    """Edge case: no vehicles should not crash."""
    instance = Instance(
        id="test-no-vehicles",
        depot=Depot(id=0, x=0, y=0),
        customers=[Customer(id=1, x=10, y=10, demand=5)],
        vehicles=VehiclesConfig(vehicles=[])
    )
    params = QParams(episodes=10, seed="42")
    
    result = solve_cvrp_qlearning(instance, params)
    assert not result.feasible, "Should be infeasible with no vehicles"
    print("✓ No vehicles case handled gracefully")


def test_capacity_respected():
    """Verify no route exceeds vehicle capacity."""
    instance = make_small_instance()
    params = QParams(episodes=100, seed="42")
    result = solve_cvrp_qlearning(instance, params)
    
    for route in result.routes:
        assert route.load <= 50, f"Route load {route.load} exceeds capacity 50"
    print(f"✓ All routes respect capacity constraint (max load seen: {max(r.load for r in result.routes) if result.routes else 0})")


# ============================================================================
# Run all tests
# ============================================================================

if __name__ == "__main__":
    tests = [
        test_solver_no_crash,
        test_solver_returns_feasible_on_small_instance,
        test_routes_start_and_end_at_depot,
        test_all_customers_served_exactly_once,
        test_determinism_same_seed,
        test_distance_scale_computation,
        test_empty_vehicles_handled,
        test_capacity_respected,
    ]
    
    print("=" * 50)
    print("Running Q-Learning Solver Sanity Tests")
    print("=" * 50)
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            print(f"\n{test.__name__}:")
            test()
            passed += 1
        except AssertionError as e:
            print(f"✗ FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"✗ ERROR: {e}")
            failed += 1
    
    print("\n" + "=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)
    
    sys.exit(0 if failed == 0 else 1)
