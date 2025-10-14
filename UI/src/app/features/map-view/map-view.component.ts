import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Customer, Depot, RoutePlan } from '../../core/models';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
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
    if (!this.highlightVehicle) {
      return false;
    }
    return route.vehicle !== this.highlightVehicle;
  }

  getNodeLabel(nodeId: number): string {
    if (nodeId === 0) {
      return 'Depot';
    }
    const customer = this.customers.find((item) => item.id === nodeId);
    return customer ? `Customer ${customer.id}` : `Node ${nodeId}`;
  }
}
