import { Component, Input } from '@angular/core';
import { Customer, Depot, RoutePlan } from '../../core/models';
import { distanceBetweenNodes, formatDistanceLabel } from '../../core/utils/distance';

interface RouteSegment {
  id: string;
  midX: number;
  midY: number;
  angle: number;
  label: string;
}

@Component({
  selector: 'app-map-view',
  templateUrl: './map-view.component.html',
  styleUrls: ['./map-view.component.scss'],
})
export class MapViewComponent {
  @Input() depot: Depot | null = null;
  @Input() customers: Customer[] = [];
  @Input() routes: RoutePlan[] = [];
  @Input() highlightVehicle: number | null = null;
  @Input() highlightVehicles: number[] = [];
  @Input() utilization = 0;

  readonly width = 1000;
  readonly height = 600;

  private getBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const points: { x: number; y: number }[] = [];
    if (this.depot) {
      points.push({ x: this.depot.x, y: this.depot.y });
    }
    if (this.customers?.length) {
      points.push(...this.customers.map((customer) => ({ x: customer.x, y: customer.y })));
    }

    if (!points.length) {
      return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    }

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));

    const rangeX = Math.max(maxX - minX, 8);
    const rangeY = Math.max(maxY - minY, 8);
    const paddingX = Math.max(rangeX * 0.1, 4);
    const paddingY = Math.max(rangeY * 0.1, 4);

    return {
      minX: minX - paddingX,
      maxX: maxX + paddingX,
      minY: minY - paddingY,
      maxY: maxY + paddingY,
    };
  }

  trackByRoute(_: number, route: RoutePlan): number {
    return route.vehicle;
  }

  trackBySegment(_: number, segment: RouteSegment): string {
    return segment.id;
  }

  toPolyline(nodes: number[]): string {
    return nodes
      .map((nodeId) => {
        const point = this.getPoint(nodeId);
        return `${this.scaleX(point.x)},${this.scaleY(point.y)}`;
      })
      .join(' ');
  }

  getPoint(nodeId: number): { x: number; y: number } {
    if (!this.depot) {
      return { x: 0, y: 0 };
    }
    if (nodeId === 0) {
      return { x: this.depot.x, y: this.depot.y };
    }
    const customer = this.customers.find((item) => item.id === nodeId);
    if (!customer) {
      return { x: this.depot.x, y: this.depot.y };
    }
    return { x: customer.x, y: customer.y };
  }

  scaleX(value: number): number {
    const { minX, maxX } = this.getBounds();
    return Number((((value - minX) / (maxX - minX)) * this.width).toFixed(2));
  }

  scaleY(value: number): number {
    const { minY, maxY } = this.getBounds();
    return Number((((1 - (value - minY) / (maxY - minY)) * this.height)).toFixed(2));
  }

  isRouteDimmed(route: RoutePlan): boolean {
    const activeVehicles = this.getActiveVehicles();
    if (!activeVehicles) {
      return false;
    }
    return !activeVehicles.has(route.vehicle);
  }

  isRouteHighlighted(route: RoutePlan): boolean {
    const activeVehicles = this.getActiveVehicles();
    if (!activeVehicles) {
      return false;
    }
    return activeVehicles.has(route.vehicle);
  }

  getRouteStrokeOpacity(route: RoutePlan): number {
    const activeVehicles = this.getActiveVehicles();
    if (!activeVehicles) {
      return 0.45;
    }
    return activeVehicles.has(route.vehicle) ? 0.95 : 0.25;
  }

  getRouteStrokeWidth(route: RoutePlan): number {
    const activeVehicles = this.getActiveVehicles();
    if (activeVehicles && activeVehicles.has(route.vehicle)) {
      return 4;
    }
    return 2.75;
  }

  getRouteSegments(route: RoutePlan): RouteSegment[] {
    if (!this.depot || route.nodes.length < 2) {
      return [];
    }
    const activeVehicles = this.getActiveVehicles();
    if (activeVehicles && !activeVehicles.has(route.vehicle)) {
      return [];
    }

    const segments: RouteSegment[] = [];
    for (let index = 0; index < route.nodes.length - 1; index += 1) {
      const fromNode = route.nodes[index];
      const toNode = route.nodes[index + 1];
      const distance = distanceBetweenNodes(fromNode, toNode, this.depot, this.customers);
      if (!Number.isFinite(distance) || distance <= 0) {
        continue;
      }
      const fromPoint = this.getPoint(fromNode);
      const toPoint = this.getPoint(toNode);
      const x1 = this.scaleX(fromPoint.x);
      const y1 = this.scaleY(fromPoint.y);
      const x2 = this.scaleX(toPoint.x);
      const y2 = this.scaleY(toPoint.y);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const rawAngle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      let angle = rawAngle;
      if (angle > 90) {
        angle -= 180;
      } else if (angle < -90) {
        angle += 180;
      }
      segments.push({
        id: `${route.vehicle}-${index}-${fromNode}-${toNode}`,
        midX,
        midY,
        angle,
        label: formatDistanceLabel(distance),
      });
    }
    return segments;
  }

  getNodeLabel(nodeId: number): string {
    if (nodeId === 0) {
      return 'Depot';
    }
    const customer = this.customers.find((item) => item.id === nodeId);
    return customer ? `Customer ${customer.id}` : `Node ${nodeId}`;
  }

  private getActiveVehicles(): Set<number> | null {
    if (this.highlightVehicles?.length) {
      return new Set(this.highlightVehicles);
    }
    if (this.highlightVehicle !== null) {
      return new Set([this.highlightVehicle]);
    }
    return null;
  }
}
