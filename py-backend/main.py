from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from models import RlSolveRequest, RlSolveResponse, QParams, GaSolveRequest, GAParams
from rl_solver import solve_cvrp_qlearning
from ga_solver import solve_cvrp_ga

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/rl/solve", response_model=RlSolveResponse)
def solve_rl(request: RlSolveRequest) -> RlSolveResponse:
    params = request.params or QParams()
    return solve_cvrp_qlearning(request.instance, params)


@app.post("/api/ga/solve", response_model=RlSolveResponse)
def solve_ga(request: GaSolveRequest) -> RlSolveResponse:
    """Endpoint pour l'algorithme génétique."""
    params = request.params or GAParams()
    return solve_cvrp_ga(request.instance, params)
