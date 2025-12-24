
# CVRP – Résolution de tournées de véhicules (Angular + Python)




## 1. Objectifs du projet

- Modéliser le **problème de tournées de véhicules avec contraintes de capacité (CVRP)**.
- Proposer plusieurs **métaheuristiques** pour construire et améliorer des tournées :
  - Tabu Search
  - Recuit simulé (Simulated Annealing)
  - Colonie de fourmis (Ant Colony Optimization)
  - Algorithme génétique (Genetic Algorithm)
  - Renforcement (Q-learning)
- Fournir :
  - une **interface web** pour visualiser les tournées sur une carte,
  - un **backend Python** qui calcule les solutions,
  - un **script de benchmark** pour comparer les algorithmes sur des instances de référence (CVRPLIB).

---

## 2. Architecture du dépôt

À la racine du projet :

- `UI/` : application **Angular** (front-end)
  - sélection / génération d’instances
  - choix de l’algorithme
  - affichage des tournées et métriques
- `py-backend/` : **backend Python** (FastAPI)
  - expose des endpoints REST `/api/.../solve`
  - contient les implémentations des algorithmes + l’évaluation des solutions
  - contient un script `benchmark.py` pour comparer les algorithmes


---

## 3. Stack technologique

### Front-end (UI)

- **Angular** (TypeScript)
- **RxJS**, **HttpClient** pour communiquer avec le backend
- Affichage des points (dépôt + clients) et des tournées sur un plan 2D

### Back-end Python

- **Python 3.10+**
- **FastAPI** : framework web pour construire l’API REST
- **Uvicorn** : serveur ASGI pour lancer l’API
- **Pydantic v2** : modèles pour valider / sérialiser les données (instances, paramètres, réponses)
- Standard library : `math`, `random`, `time`, etc.

Pourquoi **FastAPI** ?

- Très simple à connecter avec Angular (API JSON, CORS, etc.).
- Typage fort + Pydantic → mêmes structures que côté TypeScript.
- Performance correcte pour des algorithmes CPU-bound de taille moyenne.
- Documentation automatique (Swagger UI) sur `/docs`.

---

## 4. Lancer le projet

### 4.1. Prérequis

- Node.js + npm
- Python 3.10+
- Git

---

### 4.2. Récupérer le code

```bash
git clone <URL_DU_REPO>
cd CVRP
```

---

### 4.3. Back-end Python (FastAPI)

Dans le dossier `py-backend` :

```bash
cd py-backend
python -m venv .venv
```

Activer l’environnement virtuel :

- **Windows (PowerShell)**

  ```bash
  .venv\Scripts\Activate
  ```

- **Linux / macOS**

  ```bash
  source .venv/bin/activate
  ```

Lancer l’API :

```bash
uvicorn main:app --reload --port 8080
```

Assurer que dans `UI/src/environments/environment.ts` on ait :

```ts
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8000',
};
```

---

### 4.4. Front-end Angular (UI)

Dans le dossier `UI` :

```bash
cd ../UI
npm install
```

Puis démarrer l’UI :

```bash
npm start
# ou, selon la configuration du projet :
# npx ng serve --open
```

Par défaut, l’application est accessible sur :

```text
http://localhost:4200
```

---

## 5. Fonctionnement global

1. L’utilisateur sélectionne un **dataset** (instance) dans l’UI :
   - `City Grid` (petit exemple synthétique)
   - `Clustered Demand`
   - `A-n32-k5 (CVRPLIB)` – petite instance réelle
   - éventuellement d’autres instances ajoutées dans le code (ex : A-n55-k9, A-n80-k10)
2. L’utilisateur choisit un **algorithme** :
   - Tabu Search
   - Genetic Algorithm (GA)
   - Simulated Annealing (SA)
   - Ant Colony Optimization (ACO)
   - Reinforcement Learning (RL – Q-learning)
3. Côté Angular, `SolverAdapterService` :
   - construit un objet **Instance** : dépôt, clients, véhicules (capacités),
   - construit un objet **params** pour l’algorithme,
   - appelle l’API Python via `HttpClient.post(...)`.
4. Côté FastAPI :
   - l’endpoint `/api/<algo>/solve` reçoit une `...SolveRequest`,
   - la fonction Python correspondante lance l’algorithme,
   - la solution est évaluée (distance totale, respect des capacités, etc.),
   - l’API renvoie un `RlSolveResponse`.
5. L’UI affiche :
   - les routes sur la carte,
   - la **distance totale**, le **nombre de véhicules**, le **statut de faisabilité**,
   - des logs / courbes de convergence (selon l’algorithme).

---

## 6. Modèle de données (Python)

Dans `py-backend/models.py` :

- **Instance**
  - `id: str`
  - `depot: Depot` (id, x, y)
  - `customers: List[Customer]` (id, x, y, demand)
  - `vehicles: VehiclesConfig` (liste de véhicules avec `capacity`)

- **RoutePlan**
  - `vehicle: int`
  - `nodes: List[int]` (0 = dépôt, sinon id client)
  - `load: int` (charge totale)
  - `distance: float` (distance de la route)

- **RlSolveResponse**
  - `distance: float` (distance totale)
  - `feasible: bool` (respect de la capacité)
  - `vehiclesUsed: int`
  - `routes: List[RoutePlan]`
  - `violations.capacity: int` (dépassement total de capacité)
  - `runtimeMs: int` (temps d’exécution)
  - `log: List[str]` (journal d’optimisation)

- Pour chaque algorithme, un bloc de paramètres :
  - `QParams` pour RL (episodes, alpha, gamma, epsilon, etc.)
  - `GAParams` pour GA
  - `TabuParams` pour Tabu
  - `SaParams` pour SA
  - `AcoParams` pour ACO

---

## 7. Algorithmes implémentés (backend Python)

Les cinq algorithmes partagent la même **fonction d’évaluation strict** (`cvrp_eval.py`) :

- Calcul de la **distance totale** des routes.
- Vérification des **capacités véhicules**.
- Pénalités en cas de dépassement (utilisées dans Tabu, SA, GA, ACO).
- Renvoi d’un score et des informations de faisabilité.

### 7.1 Tabu Search (`tabu_solver.py`)

- **Solution initiale** : construction gloutonne faisable.
- **Voisinage** :
  - mouvements de type *relocate* (déplacer un client d’une route à une autre),
  - ou *swap* (échanger deux clients).
- À chaque itération :
  - génération d’un ensemble de voisins,
  - choix du meilleur voisin **non tabou** (ou tabou mais améliorant la meilleure solution globale – critère d’aspiration),
  - mise à jour de la **liste tabou** pendant `tabuTenure` itérations.
- Critère d’arrêt : `iterations`.
- Retourne la **meilleure solution globale** rencontrée.

### 7.2 Simulated Annealing (`sa_solver.py`)

- Reprend le **même voisinage** que Tabu (relocate / swap).
- Paramètres :
  - `startTemp` : température initiale,
  - `cooling` : facteur de refroidissement (T ← T × cooling),
  - `iterations` : nombre d’itérations.
- À chaque itération :
  - si le voisin est meilleur → accepté,
  - sinon il peut être accepté avec probabilité `exp(-Δ / T)`.
- Garde en mémoire la **meilleure solution globale** (best-so-far).

### 7.3 Ant Colony Optimization (`aco_solver.py`)

- Représentation sous forme de **graphe** (dépôt + clients).
- Chaque fourmi construit un ensemble de routes en se déplaçant selon :
  - la **phéromone** entre les arcs (τ(i, j)),
  - une heuristique (souvent `1 / distance(i, j)`).
- À chaque itération :
  - **évaporation** globale des phéromones (paramètre `evaporation`),
  - **renforcement** sur les arcs utilisés dans les meilleures solutions.
- Usage d’une pénalité capacité dans la fonction de coût pour garantir la faisabilité.

### 7.4 Genetic Algorithm (`ga_solver.py`)

- **Codage** : un chromosome est une permutation des identifiants clients.
- **Décodage** :
  - on “lit” la permutation et remplit les véhicules (capacités connues),
  - on construit les routes dans l’ordre du chromosome.
- **Évaluation** :
  - appel à `evaluate_solution_strict` pour distance + pénalités capacité.
- **Sélection** : tournoi (k candidats, on garde le meilleur).
- **Croisement** : type PMX / ordre (segment du parent 1 + préservation de l’ordre du parent 2).
- **Mutation** :
  - swap,
  - relocate,
  - petite permutation aléatoire.
- **Local search** : amélioration via `two_opt` sur chaque route.
- Garde la meilleure solution globale sur `generations`.

### 7.5 Reinforcement Learning – Q-learning (`rl_solver.py`)

- Algorithme inspiré de **Q-learning tabulaire** :
  - les états résument la position, la charge, et un “bucket” de clients.
  - les actions correspondent au choix du prochain client (ou retour dépôt).
- Mise à jour de la Q-table :
  - `Q(s, a) ← Q(s, a) + α * (r + γ * max_a' Q(s', a') - Q(s, a))`
- Politique ε-greedy :
  - avec probabilité ε : choix aléatoire,
  - sinon : meilleure action selon Q.
- Récompense négative proportionnelle à la **distance** et aux **violations de capacité**.

---

## 8. Benchmarks avec CVRPLIB

Dans `py-backend/benchmark.py` :

- Charge toutes les instances JSON présentes dans `py-backend/benchmarks/` :
  - ex : `A-n32-k5.json`, `A-n55-k9.json`, `A-n80-k10.json`, etc.
- Pour chaque instance :
  - lance les 5 algorithmes,
  - récupère distance, temps, faisabilité, nombre de véhicules.
- Écrit un fichier CSV :

```text
py-backend/benchmarks/benchmark_results.csv
```

- Affiche aussi des **tables Markdown** prêtes à être copiées dans le rapport.

Exécution :

```bash
cd py-backend
source .venv/bin/activate  # ou .venv\Scripts\Activate.ps1 sur Windows
python benchmark.py
```

---

## 9. Utiliser les datasets CVRPLIB dans l’UI

Deux façons de faire :

1. **Via l’UI** : bouton `Import` (panneau de gauche)
   - Exporter / convertir une instance CVRPLIB en JSON au format attendu,
   - Importer le JSON → l’instance apparaît dans la liste des datasets.
2. **Via le code Angular** :
   - ajouter une entrée dans `datasetDefinitions` (id, name, description, size, kind),
   - ajouter les coordonnées et demandes dans `presetData` (clients + dépôt).

Exemple de dataset (A-n32-k5) côté Angular :

- `id: 'A-n32-k5'`
- `size: 31`
- `kind: 'preset'`
- `depot` et `customers` identiques au fichier JSON utilisé par le backend.

Ainsi, **les 5 algorithmes** peuvent être testés :

- soit via l’UI (visualisation des tournées),
- soit via `benchmark.py` (comparaison chiffrée et plus systématique).

---

## 10. Résumé pour la présentation

En quelques phrases :

- Le projet implémente un **solveur CVRP complet** avec :
  - une **interface Angular** pour l’édition et la visualisation des scénarios,
  - un **backend Python / FastAPI** qui centralise la logique d’optimisation.
- Cinq algorithmes sont développés et appliqués sur les **mêmes instances** :
  - Tabu Search, Simulated Annealing, Ant Colony, Genetic Algorithm, Q-learning.
- Un **module de benchmark** permet de comparer les performances sur des instances de la littérature (CVRPLIB) :
  - on mesure distance, temps d’exécution, faisabilité,
  - on peut comparer nos résultats aux valeurs réputées optimales ou best-known.
- L’architecture choisie (Angular + FastAPI) permet de **séparer clairement** :
  - l’aspect **visualisation / interaction**,
  - l’aspect **algorithmes / optimisation**.
