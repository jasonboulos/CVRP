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
  @Input() utilization = 0;

  readonly width = 1000;
  readonly height = 600;

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
    return Number(((value / 100) * this.width).toFixed(2));
  }

  scaleY(value: number): number {
    return Number(((1 - value / 100) * this.height).toFixed(2));
  }

  isRouteDimmed(route: RoutePlan): boolean {
    if (this.highlightVehicle === null) {
      return false;
    }
    return route.vehicle !== this.highlightVehicle;
  }

  isRouteHighlighted(route: RoutePlan): boolean {
    if (this.highlightVehicle === null) {
      return false;
    }
    return route.vehicle === this.highlightVehicle;
  }

  getRouteStrokeOpacity(route: RoutePlan): number {
    if (this.highlightVehicle === null) {
      return 0.45;
    }
    return route.vehicle === this.highlightVehicle ? 0.95 : 0.15;
  }

  getRouteStrokeWidth(route: RoutePlan): number {
    if (this.highlightVehicle !== null && route.vehicle === this.highlightVehicle) {
      return 5;
    }
    return 3.5;
  }

  getRouteSegments(route: RoutePlan): RouteSegment[] {
    if (!this.depot || route.nodes.length < 2) {
      return [];
    }
    if (this.highlightVehicle !== null && route.vehicle !== this.highlightVehicle) {
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
}
