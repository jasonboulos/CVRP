# py-backend/benchmark.py

from __future__ import annotations

import csv
import math
import time
import json  
from copy import deepcopy
from pathlib import Path
from typing import Dict, List

from models import (
    Instance,
    QParams,
    GAParams,
    TabuParams,
    SaParams,
    AcoParams,
    RlSolveResponse,
)
from rl_solver import solve_cvrp_qlearning
from ga_solver import solve_cvrp_ga
from tabu_solver import solve_cvrp_tabu
from sa_solver import solve_cvrp_sa
from aco_solver import solve_cvrp_aco


# Dossier où tu mets tes instances exportées depuis l'UI
BENCHMARK_DIR = Path(__file__).parent / "benchmarks"

# Même graine pour tout le monde → comparaison plus juste
COMMON_SEED = "12345"


class AlgoConfig:
    def __init__(self, name: str, solver, default_params):
        self.name = name
        self.solver = solver
        self.default_params = default_params


ALGORITHMS: Dict[str, AlgoConfig] = {
    "TABU": AlgoConfig(
        name="Tabu Search",
        solver=solve_cvrp_tabu,
        default_params=TabuParams(iterations=200, tabuTenure=15, seed=COMMON_SEED),
    ),
    "GA": AlgoConfig(
        name="Genetic Algorithm",
        solver=solve_cvrp_ga,
        default_params=GAParams(
            populationSize=60, generations=200, mutationRate=0.08, seed=COMMON_SEED
        ),
    ),
    "SA": AlgoConfig(
        name="Simulated Annealing",
        solver=solve_cvrp_sa,
        default_params=SaParams(
            iterations=2000, startTemp=100.0, cooling=0.92, seed=COMMON_SEED
        ),
    ),
    "ACO": AlgoConfig(
        name="Ant Colony",
        solver=solve_cvrp_aco,
        default_params=AcoParams(
            ants=20, iterations=100, evaporation=0.45, seed=COMMON_SEED
        ),
    ),
    "RL": AlgoConfig(
        name="Reinforcement Learning (Q-learning)",
        solver=solve_cvrp_qlearning,
        default_params=QParams(
            episodes=1000,
            alpha=0.3,
            gamma=0.9,
            epsilon=0.1,
            bucketSize=5,
            maxSteps=5000,
            seed=COMMON_SEED,
        ),
    ),
}


def run_single_algo(
    instance: Instance,
    algo_id: str,
    cfg: AlgoConfig,
) -> Dict[str, object]:
    """Lance un algo sur une instance et renvoie un dict avec les métriques utiles."""
    params = deepcopy(cfg.default_params)

    t0 = time.time()
    res: RlSolveResponse = cfg.solver(instance, params)
    t1 = time.time()

    return {
        "instance": instance.id,
        "algorithm": algo_id,
        "algorithmName": cfg.name,
        "distance": float(res.distance),
        "runtimeMs": int(res.runtimeMs),  # déjà calculé dans les solveurs
        "vehiclesUsed": int(res.vehiclesUsed),
        "feasible": bool(res.feasible),
        "capacityViolations": int(res.violations.capacity),
        "pythonRuntimeMs": int((t1 - t0) * 1000),  # mesure brute Python
    }


def run_benchmarks() -> List[Dict[str, object]]:
    results: List[Dict[str, object]] = []

    if not BENCHMARK_DIR.exists():
        raise RuntimeError(f"Dossier benchmarks introuvable: {BENCHMARK_DIR}")

    json_files = sorted(BENCHMARK_DIR.glob("*.json"))
    if not json_files:
        raise RuntimeError(
            f"Aucun fichier .json trouvé dans {BENCHMARK_DIR}. "
            "Exporte des instances ou des solutions depuis l'UI et mets-les ici."
        )

    print(f"== Benchmarks sur {len(json_files)} instance(s) ==")

    for path in json_files:
        # --- lecture générique du JSON (solution ou instance simple) ---
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)

        # cas export "solution" : {config, instance, solution}
        if "instance" in data:
            inst_dict = data["instance"]
            config_dict = data.get("config", {})
        else:
            # cas instance "brute"
            inst_dict = data
            config_dict = data

        # si l'instance n'a pas de champ 'vehicles', on le reconstruit
        if "vehicles" not in inst_dict:
            if "vehicles" in config_dict:
                # format identique à ce que l'API RL utilise déjà
                inst_dict["vehicles"] = config_dict["vehicles"]
            else:
                raise RuntimeError(
                    f"Aucune information 'vehicles' trouvée pour le fichier {path}. "
                    "Il doit contenir soit instance.vehicles, soit config.vehicles."
                )

        # validation Pydantic -> Instance Python
        instance = Instance.model_validate(inst_dict)
        # ---------------------------------------------------------------

        print(f"\n--- Instance: {instance.id or path.stem} ---")

        for algo_id, cfg in ALGORITHMS.items():
            print(f"  -> {algo_id} ({cfg.name}) ...", end="", flush=True)
            row = run_single_algo(instance, algo_id, cfg)
            results.append(row)
            status = "OK" if row["feasible"] and row["capacityViolations"] == 0 else "INFEASIBLE"
            print(
                f" {status} | dist={row['distance']:.2f} km, "
                f"t={row['runtimeMs']} ms, veh={row['vehiclesUsed']}"
            )

    return results



def save_csv(results: List[Dict[str, object]], csv_path: Path) -> None:
    if not results:
        return

    fieldnames = list(results[0].keys())
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in results:
            writer.writerow(row)

    print(f"\nCSV écrit dans: {csv_path}")


def print_markdown_tables(results: List[Dict[str, object]]) -> None:
    """
    Affiche des tableaux Markdown par instance, que tu peux coller dans ton rapport.
    """
    if not results:
        return

    # regrouper par instance
    by_instance: Dict[str, List[Dict[str, object]]] = {}
    for row in results:
        inst = str(row["instance"])
        by_instance.setdefault(inst, []).append(row)

    for inst, rows in by_instance.items():
        print(f"\n### Résultats pour l'instance `{inst}`\n")
        print("| Algorithme | Distance (km) | Temps (ms) | Véhicules | Faisable | Violations capacité |")
        print("|-----------|---------------:|-----------:|----------:|:--------:|--------------------:|")
        for r in rows:
            feas = "✅" if r["feasible"] and r["capacityViolations"] == 0 else "❌"
            print(
                f"| {r['algorithmName']} "
                f"| {r['distance']:.2f} "
                f"| {r['runtimeMs']} "
                f"| {r['vehiclesUsed']} "
                f"| {feas} "
                f"| {r['capacityViolations']} |"
            )


if __name__ == "__main__":
    all_results = run_benchmarks()
    # 1) CSV pour Excel / Google Sheets
    save_csv(all_results, BENCHMARK_DIR / "benchmark_results.csv")
    # 2) Tables Markdown pour ton rapport
    print_markdown_tables(all_results)
