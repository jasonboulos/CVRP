import { Component, Input } from '@angular/core';
import { DashboardMetrics } from '../../core/models';

interface MetricTile {
  label: string;
  icon: string;
  iconWrapperClass: string;
  value: string;
  unit?: string;
  valueClass?: string;
  helper?: string;
  ariaLabel: string;
}

@Component({
  selector: 'app-metrics-cards',
  templateUrl: './metrics-cards.component.html',
  styleUrls: ['./metrics-cards.component.scss'],
})
export class MetricsCardsComponent {
  @Input() metrics: DashboardMetrics | null = null;
  @Input() algorithmName = '—';
  @Input() isSolving = false;

  get tiles(): MetricTile[] {
    const hasMetrics = !!this.metrics;
    const distanceValue = hasMetrics ? this.metrics!.totalDistance.toFixed(2) : '—';
    const vehiclesValue = hasMetrics ? `${this.metrics!.vehiclesUsed}` : '—';
    const violations = hasMetrics ? this.metrics!.capacityViolations : null;
    const runtimeSeconds = hasMetrics ? (this.metrics!.runtimeMs / 1000).toFixed(2) : '—';

    const feasibilityTile = this.getFeasibilityTile();

    const tiles: MetricTile[] = [
      {
        label: 'Total distance',
        icon: '🧭',
        iconWrapperClass: 'bg-sky-100 text-sky-600',
        value: distanceValue,
        unit: hasMetrics ? 'km' : undefined,
        helper: hasMetrics ? 'Aggregate kilometres travelled across all routes.' : 'Run the solver to calculate route distance.',
        ariaLabel: `Total distance ${distanceValue}${hasMetrics ? ' km' : ''}`,
      },
      {
        label: 'Vehicles used',
        icon: '🚚',
        iconWrapperClass: 'bg-emerald-100 text-emerald-600',
        value: vehiclesValue,
        unit: hasMetrics ? 'vehicles' : undefined,
        helper: hasMetrics ? 'Vehicles dispatched in the current solution.' : 'Configure the scenario to estimate fleet usage.',
        ariaLabel: `Vehicles used ${vehiclesValue}${hasMetrics ? ' vehicles' : ''}`,
      },
      {
        label: 'Capacity violations',
        icon: '⚠️',
        iconWrapperClass: violations && violations > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600',
        value: hasMetrics ? `${violations}` : '—',
        unit: hasMetrics ? 'alerts' : undefined,
        valueClass: violations && violations > 0 ? 'text-rose-600' : 'text-emerald-600',
        helper: hasMetrics
          ? violations && violations > 0
            ? 'Capacity exceeded on one or more routes.'
            : 'All vehicle capacity constraints satisfied.'
          : 'Violations will appear after running the solver.',
        ariaLabel: hasMetrics ? `Capacity violations ${violations}` : 'Capacity violations pending',
      },
      {
        label: 'Runtime',
        icon: '⏱️',
        iconWrapperClass: 'bg-amber-100 text-amber-600',
        value: runtimeSeconds,
        unit: hasMetrics ? 's' : undefined,
        helper: hasMetrics
          ? `Solver completed in ${(this.metrics!.runtimeMs).toLocaleString()} ms.`
          : 'Runtime statistics populate after running the scenario.',
        ariaLabel: hasMetrics ? `Runtime ${runtimeSeconds} seconds` : 'Runtime pending',
      },
      feasibilityTile,
      {
        label: 'Algorithm',
        icon: '🧠',
        iconWrapperClass: 'bg-slate-100 text-slate-600',
        value: this.algorithmName || '—',
        helper: this.isSolving ? 'Optimising with the selected strategy…' : 'Solver strategy currently selected.',
        ariaLabel: `Algorithm ${this.algorithmName || 'not selected'}`,
      },
    ];

    return tiles;
  }

  private getFeasibilityTile(): MetricTile {
    if (this.metrics?.feasible === true) {
      return {
        label: 'Feasibility',
        icon: '✅',
        iconWrapperClass: 'bg-emerald-50 text-emerald-600',
        value: 'Feasible',
        valueClass: 'text-emerald-600',
        helper: 'All constraints satisfied and every customer served.',
        ariaLabel: 'Feasibility feasible',
      };
    }

    if (this.metrics?.feasible === false) {
      return {
        label: 'Feasibility',
        icon: '⛔',
        iconWrapperClass: 'bg-rose-100 text-rose-600',
        value: 'Not feasible',
        valueClass: 'text-rose-600',
        helper: 'Adjust fleet capacity or parameters to resolve violations.',
        ariaLabel: 'Feasibility not feasible',
      };
    }

    return {
      label: 'Feasibility',
      icon: 'ℹ️',
      iconWrapperClass: 'bg-slate-100 text-slate-500',
      value: this.isSolving ? 'Running…' : 'Pending',
      helper: this.isSolving
        ? 'Solver is computing a solution.'
        : 'Run the solver to evaluate feasibility.',
      ariaLabel: 'Feasibility pending',
    };
  }
}
