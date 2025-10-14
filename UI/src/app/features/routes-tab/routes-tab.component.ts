import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RoutePlan } from '../../core/models';

@Component({
  selector: 'app-routes-tab',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatTableModule],
  templateUrl: './routes-tab.component.html',
  styleUrls: ['./routes-tab.component.scss'],
})
export class RoutesTabComponent {
  @Input() routes: RoutePlan[] = [];
  @Input() highlightVehicle: number | null = null;
  @Output() highlightChange = new EventEmitter<number | null>();

  displayedColumns = ['vehicle', 'distance', 'load', 'customers'];

  getCustomersLabel(route: RoutePlan): string {
    return route.nodes.filter((node) => node !== 0).join(', ');
  }

  isActive(route: RoutePlan): boolean {
    if (!this.highlightVehicle) {
      return true;
    }
    return route.vehicle === this.highlightVehicle;
  }

  handleHover(vehicle: number | null): void {
    this.highlightChange.emit(vehicle);
  }
}
