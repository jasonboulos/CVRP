import { Component, Input } from '@angular/core';
import { DashboardMetrics } from '../../core/models';

interface MetricTile {
  label: string;
  icon: string;
  value: string;
  unit?: string;
  accent: string;
  helper?: string;
  cardClass?: string;
  valueClass?: string;
  title?: string;
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
        { label: 'Feasibility', icon: 'ℹ️', value: '--', accent: 'text-slate-400' },
      ];
    }

    const feasibilityTile: MetricTile = (() => {
      if (this.metrics?.feasible === true) {
        return {
          label: 'Feasibility',
          icon: '✅',
          value: 'Feasible ✅',
          accent: 'text-green-600',
          valueClass: 'text-green-600',
          cardClass: 'bg-green-50',
          title: 'All customers served and constraints respected.',
        } satisfies MetricTile;
      }

      if (this.metrics?.feasible === false) {
        return {
          label: 'Feasibility',
          icon: '❌',
          value: 'Not Feasible ❌',
          accent: 'text-rose-600',
          valueClass: 'text-rose-600',
          cardClass: 'bg-rose-50',
          title: 'Some customers cannot be served under current constraints.',
        } satisfies MetricTile;
      }

      return {
        label: 'Feasibility',
        icon: 'ℹ️',
        value: '--',
        accent: 'text-slate-400',
      } satisfies MetricTile;
    })();

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
        helper: '',
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
      feasibilityTile,
    ];
  }
}
