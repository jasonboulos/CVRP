import { Customer, Depot, RoutePlan } from '../models';

export function euclideanDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function distanceBetweenNodes(
  aId: number,
  bId: number,
  depot: Depot,
  customers: Customer[],
): number {
  if (aId === 0) {
    const b = customers.find((customer) => customer.id === bId);
    return b ? euclideanDistance(depot.x, depot.y, b.x, b.y) : 0;
  }

  if (bId === 0) {
    const a = customers.find((customer) => customer.id === aId);
    return a ? euclideanDistance(a.x, a.y, depot.x, depot.y) : 0;
  }

  const a = customers.find((customer) => customer.id === aId);
  const b = customers.find((customer) => customer.id === bId);
  if (!a || !b) {
    return 0;
  }
  return euclideanDistance(a.x, a.y, b.x, b.y);
}

export function computeRouteDistance(route: RoutePlan, depot: Depot, customers: Customer[]): number {
  let distance = 0;
  const nodes = route.nodes;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    distance += distanceBetweenNodes(nodes[i], nodes[i + 1], depot, customers);
  }
  return Number(distance.toFixed(2));
}
