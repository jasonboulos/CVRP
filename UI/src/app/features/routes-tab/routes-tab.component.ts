import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RoutePlan } from '../../core/models';

@Component({
  selector: 'app-routes-tab',
  templateUrl: './routes-tab.component.html',
  styleUrls: ['./routes-tab.component.scss'],
})
export class RoutesTabComponent {
  @Input() routes: RoutePlan[] = [];
  @Input() highlightVehicle: number | null = null;
  @Output() highlightChange = new EventEmitter<number | null>();

  getCustomersLabel(route: RoutePlan): string {
    return route.nodes.filter((node) => node !== 0).join(', ');
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
}
