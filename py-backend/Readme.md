# CVRP Explorer – Backend Python & Frontend Angular

Ce projet permet de visualiser et résoudre un **problème de tournées de véhicules capacitaires (CVRP)** via :

- un **backend Python** (FastAPI)  
- un **frontend Angular**

Les algorithmes réellement implémentés côté backend sont :

- **Reinforcement Learning (Q-Learning tabulaire)**
- **Genetic Algorithm (Algorithme génétique)**

---

## 1. Outils utilisés

### Backend (Python)

- Python 3.x  
- [FastAPI](https://fastapi.tiangolo.com/) : création d’API REST  
- Uvicorn : serveur ASGI pour exécuter FastAPI  
- Pydantic : modèles de données et validation JSON  

### Frontend (Angular)

- Node.js + npm  
- Angular CLI  
- TypeScript  

---

## 2. Backend Python (`py-backend/`)

### 2.1. Structure

```text
py-backend/
  main.py        # API FastAPI (routes /api/rl/solve et /api/ga/solve)
  models.py      # Modèles de données (Instance, paramètres, réponse)
  rl_solver.py   # Solveur RL (Q-Learning)
  ga_solver.py   # Solveur GA (Algorithme génétique)

##  2.2. Installation des librairies
Option A – Avec environnement virtuel (recommandé)
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

pip install fastapi uvicorn

Option B – Sans environnement virtuel
pip install fastapi uvicorn

2.3. Lancer le backend
uvicorn main:app --reload --port 8080
