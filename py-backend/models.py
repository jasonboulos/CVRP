from typing import List, Optional
from pydantic import BaseModel

class Depot(BaseModel):
    id: int
    x: float
    y: float

class Customer(BaseModel):
    id: int
    x: float
    y: float
    demand: int

class Vehicle(BaseModel):
    id: int
    capacity: int

class VehiclesConfig(BaseModel):
    vehicles: List[Vehicle]

class Instance(BaseModel):
    id: str
    depot: Depot
    customers: List[Customer]
    vehicles: VehiclesConfig



class QParams(BaseModel):
    episodes: int = 200
    alpha: float = 0.3
    gamma: float = 0.9
    epsilon: float = 0.1
    bucketSize: int = 5
    maxSteps: int = 5000
    seed: str = "12345"


class RlSolveRequest(BaseModel):
    instance: Instance
    params: Optional[QParams] = None


class RoutePlan(BaseModel):
    vehicle: int
    nodes: List[int]   # 0 = dépôt, ids des clients sinon
    load: int
    distance: float

class ViolationsDto(BaseModel):
    capacity: int = 0

class RlSolveResponse(BaseModel):
    distance: float
    feasible: bool
    vehiclesUsed: int
    routes: List[RoutePlan]
    violations: ViolationsDto
    log: List[str]
    runtimeMs: int
    
class GAParams(BaseModel):
    populationSize: int = 60    # taille de la population
    generations: int = 200      # nombre de générations (itérations GA)
    mutationRate: float = 0.1   # probabilité de mutation (0–1)
    seed: str = "12345"         # graine aléatoire

class GaSolveRequest(BaseModel):
    instance: Instance
    params: Optional[GAParams] = None

class TabuParams(BaseModel):
    iterations: int = 200
    tabuTenure: int = 15
    seed: str = "12345"

class TabuSolveRequest(BaseModel):
    instance: Instance
    params: Optional[TabuParams] = None


class SaParams(BaseModel):
    iterations: int = 2000
    startTemp: float = 100.0
    cooling: float = 0.92
    seed: str = "12345"

class SaSolveRequest(BaseModel):
    instance: Instance
    params: Optional[SaParams] = None


class AcoParams(BaseModel):
    ants: int = 20
    iterations: int = 100
    evaporation: float = 0.45
    seed: str = "12345"

class AcoSolveRequest(BaseModel):
    instance: Instance
    params: Optional[AcoParams] = None

