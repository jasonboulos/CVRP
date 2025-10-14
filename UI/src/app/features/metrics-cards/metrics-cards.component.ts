import { Component, Input } from '@angular/core';
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
  templateUrl: './metrics-cards.component.html',
  styleUrls: ['./metrics-cards.component.scss'],
})
export class MetricsCardsComponent {
  @Input() metrics: DashboardMetrics | null = null;

  get tiles(): MetricTile[] {
    if (!this.metrics) {
      return [
        { label: 'Total distance', icon: '🧭', value: '--', accent: 'text-slate-400' },
        { label: 'Vehicles used', icon: '🚚', value: '--', accent: 'text-slate-400' },
        { label: 'Capacity violations', icon: '⚠️', value: '--', accent: 'text-slate-400' },
        { label: 'Runtime', icon: '⏱️', value: '--', accent: 'text-slate-400' },
        { label: 'Optimality gap', icon: '📊', value: '--', accent: 'text-slate-400' },
      ];
    }

    return [
      {
        label: 'Total distance',
        icon: '🧭',
        value: `${this.metrics.totalDistance.toFixed(2)} km`,
        accent: 'text-blue-500',
      },
      {
        label: 'Vehicles used',
        icon: '🚚',
        value: `${this.metrics.vehiclesUsed}`,
        accent: 'text-emerald-500',
        helper: 'out of fleet',
      },
      {
        label: 'Capacity violations',
        icon: '⚠️',
        value: `${this.metrics.capacityViolations}`,
        accent: this.metrics.capacityViolations > 0 ? 'text-rose-500' : 'text-emerald-500',
      },
      {
        label: 'Runtime',
        icon: '⏱️',
        value: `${(this.metrics.runtimeMs / 1000).toFixed(2)} s`,
        accent: 'text-amber-500',
      },
      {
        label: 'Optimality gap',
        icon: '📊',
        value: `${this.metrics.optimalityGap.toFixed(2)} %`,
        accent: 'text-fuchsia-500',
      },
    ];
  }
}
