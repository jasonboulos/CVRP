import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { AlgorithmParameterDefinition, ResultTabData } from '../../core/models';
import { SolverAdapterService } from '../../core/services/solver-adapter.service';

interface TrendPoint {
  label: string;
  value: number;
}

interface ComparisonMetric {
  key: string;
  label: string;
  unit?: string;
  betterWhen: 'lower' | 'higher';
  accessor: (run: ResultTabData) => number;
}

interface ComparisonMetricValue {
  metric: ComparisonMetric;
  value: number;
  display: string;
  rank: number;
  isBest: boolean;
}

interface ComparisonRowData {
  run: ResultTabData;
  values: ComparisonMetricValue[];
}

interface ParameterEntry {
  key: string;
  label: string;
  displayValue: string;
  rawValue: number;
}

@Component({
  selector: 'app-result-report',
  templateUrl: './result-report.component.html',
  styleUrls: [],
  host: {
    class: 'block h-full'
  }
})
export class ResultReportComponent implements OnChanges {
  private readonly solverService = inject(SolverAdapterService);

  @Input() result!: ResultTabData;
  @Input() runs: ResultTabData[] = [];

  sortedRuns: ResultTabData[] = [];

  distanceTrend: TrendPoint[] = [];
  runtimeTrend: TrendPoint[] = [];
  utilizationTrend: TrendPoint[] = [];

  readonly comparisonMetrics: ComparisonMetric[] = [
    {
      key: 'totalDistance',
      label: 'Total distance',
      unit: 'km',
      betterWhen: 'lower',
      accessor: (run) => run.summary.totalDistance,
    },
    {
      key: 'runtimeMs',
      label: 'Runtime',
      unit: 's',
      betterWhen: 'lower',
      accessor: (run) => run.summary.runtimeMs / 1000,
    },
    {
      key: 'capacityViolations',
      label: 'Capacity violations',
      betterWhen: 'lower',
      accessor: (run) => run.summary.capacityViolations,
    },
    {
      key: 'vehiclesUsed',
      label: 'Vehicles used',
      betterWhen: 'lower',
      accessor: (run) => run.summary.vehiclesUsed,
    },
  ];

  comparisonTable: ComparisonRowData[] = [];
  readonly compareWindowBaseOptions = [3, 5, 10];
  compareWindowOptions: number[] = [];
  compareWindow = 5;

  datasetName = '';
  datasetId = '';
  parameterEntries: ParameterEntry[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.result) {
      this.resetView();
      return;
    }

    this.sortedRuns = [...this.runs].sort((a, b) => a.runNumber - b.runNumber);
    this.datasetId = this.result.rawRequest.config.datasetId;
    this.datasetName = this.result.rawRequest.instance.name || this.datasetId;
    this.parameterEntries = this.buildParameterEntries(this.result);

    this.distanceTrend = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.totalDistance,
    }));
    this.runtimeTrend = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.runtimeMs / 1000,
    }));
    this.utilizationTrend = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.utilizationPct,
    }));

    this.updateCompareWindowOptions();
    this.rebuildComparisonTable();
  }

  get comparisonRunCount(): number {
    if (!this.sortedRuns.length) {
      return 0;
    }
    return Math.min(this.compareWindow, this.sortedRuns.length);
  }

  get chartViewBox(): string {
    return `0 0 ${this.chartWidth} ${this.chartHeight}`;
  }

  onCompareWindowChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    const nextValue = Number.parseInt(select.value, 10);
    if (Number.isFinite(nextValue) && nextValue > 0) {
      this.compareWindow = nextValue;
      this.rebuildComparisonTable();
    }
  }

  getFeasibilityClasses(): Record<string, boolean> {
    const feasible = this.result?.summary.feasible;
    return {
      'bg-emerald-100 text-emerald-700': feasible === true,
      'bg-rose-100 text-rose-700': feasible === false,
      'bg-slate-200 text-slate-600': feasible === null,
    };
  }

  formatCapacityStatus(violations: number): string {
    if (!Number.isFinite(violations)) {
      return 'Capacity status unavailable';
    }
    return violations === 0
      ? '0 capacity violations'
      : `${violations} capacity violation${violations === 1 ? '' : 's'}`;
  }

  buildLinePath(points: TrendPoint[]): string {
    if (!points.length) {
      return '';
    }
    if (points.length === 1) {
      const midY = this.chartHeight / 2;
      return `M 0 ${midY} L ${this.chartWidth} ${midY}`;
    }
    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * this.chartWidth;
        const normalized = (point.value - min) / range;
        const y = this.chartHeight - normalized * this.chartHeight;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  formatNode(node: number): string {
    return node === 0 ? 'Depot' : `C${node}`;
  }

  formatRoutePath(route: ResultTabData['vehicles'][number]): string {
    return route.nodes.map((node) => this.formatNode(node)).join(' → ');
  }

  getVehicleCapacity(run: ResultTabData, vehicleId: number): number {
    return (
      run.rawRequest.config.vehicles.vehicles.find((vehicle) => vehicle.id === vehicleId)?.capacity ?? 0
    );
  }

  getVehicleColor(route: ResultTabData['vehicles'][number]): string {
    return route.color ?? '#475569';
  }

  getStops(route: ResultTabData['vehicles'][number]): number {
    return route.nodes.filter((node) => node !== 0).length;
  }

  trackVehicle(_: number, route: ResultTabData['vehicles'][number]): number {
    return route.vehicle;
  }

  private readonly chartWidth = 520;
  private readonly chartHeight = 200;

  private resetView(): void {
    this.sortedRuns = [];
    this.distanceTrend = [];
    this.runtimeTrend = [];
    this.utilizationTrend = [];
    this.parameterEntries = [];
    this.comparisonTable = [];
    this.compareWindowOptions = [];
  }

  private rebuildComparisonTable(): void {
    if (!this.sortedRuns.length) {
      this.comparisonTable = [];
      return;
    }
    const windowSize = Math.max(1, Math.min(this.compareWindow, this.sortedRuns.length));
    const recent = this.sortedRuns.slice(this.sortedRuns.length - windowSize);

    const bestValues = new Map<string, number>();
    const rankMaps = new Map<string, Map<string, number>>();

    for (const metric of this.comparisonMetrics) {
      const values = recent.map((run) => metric.accessor(run));
      if (!values.length) {
        continue;
      }
      const unique = Array.from(new Set(values)).sort((a, b) =>
        metric.betterWhen === 'lower' ? a - b : b - a,
      );
      bestValues.set(metric.key, unique[0]!);
      const ranks = new Map<string, number>();
      recent.forEach((run) => {
        const value = metric.accessor(run);
        const rank = unique.indexOf(value) + 1;
        ranks.set(run.id, rank);
      });
      rankMaps.set(metric.key, ranks);
    }

    this.comparisonTable = recent
      .slice()
      .reverse()
      .map((run) => ({
        run,
        values: this.comparisonMetrics.map((metric) => {
          const value = metric.accessor(run);
          const ranks = rankMaps.get(metric.key);
          const rank = ranks?.get(run.id) ?? 0;
          const isBest = bestValues.get(metric.key) === value;
          return {
            metric,
            value,
            display: this.formatComparisonValue(metric, value),
            rank,
            isBest,
          };
        }),
      }));
  }

  private updateCompareWindowOptions(): void {
    const totalRuns = this.sortedRuns.length;
    const capped = this.compareWindowBaseOptions.filter((option) => option <= totalRuns && option >= 2);
    if (totalRuns >= 2 && !capped.includes(totalRuns)) {
      capped.push(totalRuns);
    }
    this.compareWindowOptions = capped.sort((a, b) => a - b);

    if (totalRuns < 2) {
      this.compareWindow = Math.min(this.compareWindow, totalRuns);
      return;
    }

    const maxOption = this.compareWindowOptions.length
      ? this.compareWindowOptions[this.compareWindowOptions.length - 1]!
      : totalRuns;
    if (this.compareWindow < 2) {
      this.compareWindow = Math.min(2, maxOption);
    } else if (this.compareWindow > maxOption) {
      this.compareWindow = maxOption;
    }
  }

  private buildParameterEntries(result: ResultTabData): ParameterEntry[] {
    const definitions = this.solverService.getAlgorithmParameters(result.algorithm.id) ?? [];
    const parameters = result.rawRequest.config.parameters ?? {};
    const usedKeys = new Set<string>();
    const entries: ParameterEntry[] = [];

    definitions.forEach((definition) => {
      if (Object.prototype.hasOwnProperty.call(parameters, definition.key)) {
        const value = parameters[definition.key]!;
        entries.push({
          key: definition.key,
          label: definition.label,
          rawValue: value,
          displayValue: this.formatParameterValue(definition, value),
        });
        usedKeys.add(definition.key);
      }
    });

    Object.entries(parameters)
      .filter(([key]) => !usedKeys.has(key))
      .forEach(([key, value]) => {
        const numericValue = Number(value);
        entries.push({
          key,
          label: this.fallbackParameterLabel(key),
          rawValue: numericValue,
          displayValue: this.formatParameterValue(null, numericValue),
        });
      });

    return entries;
  }

  private formatParameterValue(definition: AlgorithmParameterDefinition | null, value: number): string {
    if (!Number.isFinite(value)) {
      return '—';
    }
    const label = definition?.label.toLowerCase() ?? '';
    const key = definition?.key.toLowerCase() ?? '';
    const isPercent = label.includes('%') || key.includes('percent') || key.includes('mutation');
    if (isPercent) {
      const percentFormatter = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      });
      return `${percentFormatter.format(value)}%`;
    }
    if (Number.isInteger(value)) {
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
    }
    const absValue = Math.abs(value);
    if (absValue < 10) {
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    }
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  private fallbackParameterLabel(key: string): string {
    const spaced = key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .trim();
    return spaced
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  private formatComparisonValue(metric: ComparisonMetric, value: number): string {
    if (!Number.isFinite(value)) {
      return '—';
    }
    if (metric.unit === 'km' || metric.unit === 's') {
      const formatter = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return formatter.format(value);
    }
    const formatter = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    });
    return formatter.format(value);
  }
}
