import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { DashboardMetrics } from '../../core/models';

interface MetricTile {
  label: string;
  icon: string;
  value: string;
  accent: string;
  helper?: string;
}

@Component({
  selector: 'app-metrics-cards',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  templateUrl: './metrics-cards.component.html',
  styleUrls: ['./metrics-cards.component.scss'],
})
export class MetricsCardsComponent {
  @Input() metrics: DashboardMetrics | null = null;

  get tiles(): MetricTile[] {
    if (!this.metrics) {
      return [
        { label: 'Total distance', icon: 'route', value: '--', accent: 'text-slate-400' },
        { label: 'Vehicles used', icon: 'local_shipping', value: '--', accent: 'text-slate-400' },
        { label: 'Capacity violations', icon: 'report_problem', value: '--', accent: 'text-slate-400' },
        { label: 'Runtime', icon: 'timer', value: '--', accent: 'text-slate-400' },
        { label: 'Optimality gap', icon: 'percent', value: '--', accent: 'text-slate-400' },
      ];
    }

    return [
      {
        label: 'Total distance',
        icon: 'route',
        value: `${this.metrics.totalDistance.toFixed(2)} km`,
        accent: 'text-blue-500',
      },
      {
        label: 'Vehicles used',
        icon: 'local_shipping',
        value: `${this.metrics.vehiclesUsed}`,
        accent: 'text-emerald-500',
        helper: 'out of fleet',
      },
      {
        label: 'Capacity violations',
        icon: 'report_problem',
        value: `${this.metrics.capacityViolations}`,
        accent: this.metrics.capacityViolations > 0 ? 'text-rose-500' : 'text-emerald-500',
      },
      {
        label: 'Runtime',
        icon: 'timer',
        value: `${(this.metrics.runtimeMs / 1000).toFixed(2)} s`,
        accent: 'text-amber-500',
      },
      {
        label: 'Optimality gap',
        icon: 'percent',
        value: `${this.metrics.optimalityGap.toFixed(2)} %`,
        accent: 'text-fuchsia-500',
      },
    ];
  }
}
