import { Component, Input } from '@angular/core';
import { DashboardMetrics } from '../../core/models';

interface MetricTile {
  label: string;
  icon: string;
  value: string;
  unit?: string;
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
        value: this.metrics.totalDistance.toFixed(2),
        unit: 'km',
        accent: 'text-blue-500',
      },
      {
        label: 'Vehicles used',
        icon: '🚚',
        value: `${this.metrics.vehiclesUsed}`,
        unit: 'vehicles',
        accent: 'text-emerald-500',
        helper: 'out of fleet',
      },
      {
        label: 'Capacity violations',
        icon: '⚠️',
        value: `${this.metrics.capacityViolations}`,
        unit: 'violations',
        accent: this.metrics.capacityViolations > 0 ? 'text-rose-500' : 'text-emerald-500',
      },
      {
        label: 'Runtime',
        icon: '⏱️',
        value: (this.metrics.runtimeMs / 1000).toFixed(2),
        unit: 's',
        accent: 'text-amber-500',
      },
      {
        label: 'Optimality gap',
        icon: '📊',
        value: this.metrics.optimalityGap.toFixed(2),
        unit: '%',
        accent: 'text-fuchsia-500',
      },
    ];
  }
}
