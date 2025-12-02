from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import (
    RlSolveRequest,
    RlSolveResponse,
    QParams,
    GaSolveRequest,
    GAParams,
    TabuSolveRequest,
    TabuParams,
    SaSolveRequest,
    SaParams,
    AcoSolveRequest,
    AcoParams,
)

from rl_solver import solve_cvrp_qlearning
from ga_solver import solve_cvrp_ga
from tabu_solver import solve_cvrp_tabu
from sa_solver import solve_cvrp_sa
from aco_solver import solve_cvrp_aco

app = FastAPI(title="CVRP Python Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check() -> dict:
  """
  Petit endpoint de test pour vérifier que l'API tourne.
  """
  return {"status": "ok"}


# ---------------- RL (Q-Learning) ----------------

@app.post("/api/rl/solve", response_model=RlSolveResponse)
def solve_rl(request: RlSolveRequest) -> RlSolveResponse:
    params = request.params or QParams()
    return solve_cvrp_qlearning(request.instance, params)


# ---------------- GA (Genetic Algorithm) ----------------

@app.post("/api/ga/solve", response_model=RlSolveResponse)
def solve_ga(request: GaSolveRequest) -> RlSolveResponse:
    """
    Endpoint pour l'algorithme génétique.
    """
    params = request.params or GAParams()
    return solve_cvrp_ga(request.instance, params)


# ---------------- Tabu Search ----------------

@app.post("/api/tabu/solve", response_model=RlSolveResponse)
def solve_tabu(request: TabuSolveRequest) -> RlSolveResponse:
    """
    Endpoint pour l'algorithme Tabu Search.
    """
    params = request.params or TabuParams()
    return solve_cvrp_tabu(request.instance, params)


# ---------------- Simulated Annealing ----------------

@app.post("/api/sa/solve", response_model=RlSolveResponse)
def solve_sa(request: SaSolveRequest) -> RlSolveResponse:
    """
    Endpoint pour l'algorithme Simulated Annealing.
    """
    params = request.params or SaParams()
    return solve_cvrp_sa(request.instance, params)


# ---------------- Ant Colony Optimization ----------------

@app.post("/api/aco/solve", response_model=RlSolveResponse)
def solve_aco(request: AcoSolveRequest) -> RlSolveResponse:
    """
    Endpoint pour l'algorithme Ant Colony Optimization.
    """
    params = request.params or AcoParams()
    return solve_cvrp_aco(request.instance, params)
