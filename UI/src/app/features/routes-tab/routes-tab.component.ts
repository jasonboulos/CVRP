import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { RoutePlan } from '../../core/models';

type SortOption = 'vehicle' | 'distance' | 'load' | 'stops';

@Component({
  selector: 'app-routes-tab',
  templateUrl: './routes-tab.component.html',
  styleUrls: ['./routes-tab.component.scss'],
})
export class RoutesTabComponent implements OnChanges {
  @Input() routes: RoutePlan[] = [];
  @Input() highlightVehicle: number | null = null;
  @Output() highlightChange = new EventEmitter<number | null>();

  sortOption: SortOption = 'vehicle';
  filterTerm = '';
  showOnlyHighlighted = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['highlightVehicle'] && this.highlightVehicle === null) {
      this.showOnlyHighlighted = false;
    }
  }

  get processedRoutes(): RoutePlan[] {
    const normalizedFilter = this.filterTerm.trim().toLowerCase();
    const shouldFilterToHighlight = this.showOnlyHighlighted && this.highlightVehicle !== null;

    const filtered = this.routes.filter((route) => {
      if (shouldFilterToHighlight && route.vehicle !== this.highlightVehicle) {
        return false;
      }
      if (!normalizedFilter) {
        return true;
      }
      const customers = this.getCustomersLabel(route).toLowerCase();
      return (
        route.vehicle.toString().includes(normalizedFilter) || customers.includes(normalizedFilter)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (this.sortOption) {
        case 'distance':
          return b.distance - a.distance;
        case 'load':
          return b.load - a.load;
        case 'stops':
          return this.getStopsCount(b) - this.getStopsCount(a);
        default:
          return a.vehicle - b.vehicle;
      }
    });

    return sorted;
  }

  getCustomersLabel(route: RoutePlan): string {
    return route.nodes.filter((node) => node !== 0).join(', ');
  }

  getStopsCount(route: RoutePlan): number {
    return Math.max(0, route.nodes.length - 2);
  }

  getLoadPercentage(route: RoutePlan): number {
    const maxLoad = this.routes.reduce((max, current) => Math.max(max, current.load ?? 0), 0);
    if (maxLoad <= 0) {
      return 0;
    }
    const percentage = (route.load / maxLoad) * 100;
    return Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  }

  getLoadBarClass(route: RoutePlan): string {
    const percentage = this.getLoadPercentage(route);
    if (percentage >= 85) {
      return 'bg-emerald-500';
    }
    if (percentage >= 60) {
      return 'bg-emerald-400';
    }
    return 'bg-emerald-300';
  }

  isActive(route: RoutePlan): boolean {
    if (this.highlightVehicle === null) {
      return true;
    }
    return route.vehicle === this.highlightVehicle;
  }

  handleHover(vehicle: number | null): void {
    this.highlightChange.emit(vehicle);
  }

  selectVehicle(route: RoutePlan): void {
    const nextHighlight = this.highlightVehicle === route.vehicle ? null : route.vehicle;
    this.highlightChange.emit(nextHighlight);
  }

  trackByVehicle(_: number, route: RoutePlan): number {
    return route.vehicle;
  }
}
