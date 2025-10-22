import { Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { AlgorithmId, AlgorithmParameterDefinition, ResultTabData } from '../../core/models';
import { SolverAdapterService } from '../../core/services/solver-adapter.service';

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
  keyParams: string;
  values: ComparisonMetricValue[];
}

interface ParameterEntry {
  key: string;
  label: string;
  displayValue: string;
  rawValue: number;
}

type ChartType = 'distance' | 'runtime';

interface TrendPoint {
  label: string;
  value: number;
  run: ResultTabData;
}

interface ChartTick {
  value: number;
  label: string;
  y: number;
}

interface ChartXAxisTick {
  label: string;
  x: number;
}

interface ChartPoint extends TrendPoint {
  x: number;
  y: number;
  displayValue: string;
  keyParams: string;
}

interface ChartData {
  unit: string;
  yLabel: string;
  viewBox: string;
  path: string;
  yTicks: ChartTick[];
  xTicks: ChartXAxisTick[];
  points: ChartPoint[];
  hasData: boolean;
  axis: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  yLabelPosition: {
    x: number;
    y: number;
  };
}

interface ChartTooltip {
  chart: ChartType;
  x: number;
  y: number;
  lines: string[];
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

  distanceChart: ChartData | null = null;
  runtimeChart: ChartData | null = null;
  activeTooltip: ChartTooltip | null = null;

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
      unit: 'ms',
      betterWhen: 'lower',
      accessor: (run) => run.summary.runtimeMs,
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
    this.activeTooltip = null;
    this.datasetId = this.result.rawRequest.config.datasetId;
    this.datasetName = this.result.rawRequest.instance.name || this.datasetId;
    this.parameterEntries = this.buildParameterEntries(this.result);

    const trendPoints = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.totalDistance,
      run,
    }));
    const runtimePoints = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.runtimeMs,
      run,
    }));

    this.distanceChart = this.buildChartData('Distance (km)', 'km', trendPoints);
    this.runtimeChart = this.buildChartData('Runtime (ms)', 'ms', runtimePoints);

    this.updateCompareWindowOptions();
    this.rebuildComparisonTable();
  }

  get comparisonRunCount(): number {
    if (!this.sortedRuns.length) {
      return 0;
    }
    return Math.min(this.compareWindow, this.sortedRuns.length);
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

  showTooltip(chart: ChartType, point: ChartPoint): void {
    const offsetX = 12;
    const offsetY = 36;
    const left = Math.min(this.chartWidth - 140, Math.max(0, point.x + offsetX));
    const top = Math.max(0, point.y - offsetY);
    const lines = [
      `Run #${point.run.runNumber} — ${point.run.algorithm.code}`,
      `${point.displayValue} ${chart === 'distance' ? 'km' : 'ms'}`,
    ];
    if (point.keyParams) {
      lines.push(point.keyParams);
    }
    this.activeTooltip = { chart, x: left, y: top, lines };
  }

  clearTooltip(): void {
    this.activeTooltip = null;
  }

  private buildChartData(
    yLabel: string,
    unit: string,
    points: TrendPoint[],
  ): ChartData {
    const hasData = points.length > 0;
    const axis = {
      left: this.chartMargin.left,
      right: this.chartWidth - this.chartMargin.right,
      top: this.chartMargin.top,
      bottom: this.chartHeight - this.chartMargin.bottom,
    };
    const yLabelPosition = {
      x: Math.max(0, this.chartMargin.left - 44),
      y: (axis.top + axis.bottom) / 2,
    };
    if (!hasData) {
      return {
        unit,
        yLabel,
        viewBox: `0 0 ${this.chartWidth} ${this.chartHeight}`,
        path: '',
        yTicks: [],
        xTicks: [],
        points: [],
        hasData: false,
        axis,
        yLabelPosition,
      };
    }

    const values = points.map((point) => point.value);
    const ticks = this.computeTicks(values);
    const yMin = ticks[0] ?? 0;
    const yMax = ticks[ticks.length - 1] ?? yMin + 1;
    const range = yMax - yMin || 1;

    const pathPoints: ChartPoint[] = points.map((point, index) => {
      const x =
        this.chartMargin.left +
        (points.length === 1
          ? this.plotWidth / 2
          : (index / (points.length - 1)) * this.plotWidth);
      const normalized = (point.value - yMin) / range;
      const y = this.chartMargin.top + (1 - normalized) * this.plotHeight;
      return {
        ...point,
        x,
        y,
        displayValue: this.formatChartValue(point.value, unit),
        keyParams: this.formatKeyParams(point.run),
      };
    });

    const path = pathPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(' ');

    const yTicks = ticks.map((tick) => {
      const normalized = (tick - yMin) / range;
      const y = this.chartMargin.top + (1 - normalized) * this.plotHeight;
      return {
        value: tick,
        label: this.formatTickLabel(tick, unit),
        y,
      };
    });

    const xTicks = pathPoints.map((point) => ({
      label: point.label,
      x: point.x,
    }));

    return {
      unit,
      yLabel,
      viewBox: `0 0 ${this.chartWidth} ${this.chartHeight}`,
      path,
      yTicks,
      xTicks,
      points: pathPoints,
      hasData: true,
      axis,
      yLabelPosition,
    };
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
  private readonly chartMargin = { top: 16, right: 24, bottom: 40, left: 64 };

  private get plotWidth(): number {
    return this.chartWidth - this.chartMargin.left - this.chartMargin.right;
  }

  private get plotHeight(): number {
    return this.chartHeight - this.chartMargin.top - this.chartMargin.bottom;
  }

  private resetView(): void {
    this.sortedRuns = [];
    this.distanceChart = null;
    this.runtimeChart = null;
    this.activeTooltip = null;
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
        keyParams: this.formatKeyParams(run),
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
    if (metric.unit === 'km') {
      const formatter = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return formatter.format(value);
    }
    if (metric.unit === 'ms') {
      const formatter = new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 0,
      });
      return formatter.format(value);
    }
    const formatter = new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    });
    return formatter.format(value);
  }

  private computeTicks(values: number[]): number[] {
    if (!values.length) {
      return [0, 1];
    }
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 1];
    }
    if (min === max) {
      const padding = Math.abs(min) * 0.1 || 1;
      min -= padding;
      max += padding;
    }
    const span = max - min;
    const step = this.niceStep(span / 4);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let value = niceMin; value <= niceMax + step / 2; value += step) {
      const rounded = Number.parseFloat(value.toFixed(6));
      ticks.push(rounded);
    }
    if (ticks.length < 2) {
      ticks.push(Number.parseFloat((niceMax + step).toFixed(6)));
    }
    return ticks;
  }

  private niceStep(value: number): number {
    const safeValue = value <= 0 ? 1 : value;
    const exponent = Math.floor(Math.log10(safeValue));
    const fraction = safeValue / Math.pow(10, exponent);
    let niceFraction: number;
    if (fraction <= 1) {
      niceFraction = 1;
    } else if (fraction <= 2) {
      niceFraction = 2;
    } else if (fraction <= 5) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }
    return niceFraction * Math.pow(10, exponent);
  }

  private formatTickLabel(value: number, unit: string): string {
    if (!Number.isFinite(value)) {
      return '—';
    }
    if (unit === 'km') {
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 1,
      }).format(value);
    }
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatChartValue(value: number, unit: string): string {
    if (!Number.isFinite(value)) {
      return '—';
    }
    if (unit === 'km') {
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value);
    }
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatKeyParams(run: ResultTabData): string {
    const parameters = run.rawRequest.config.parameters ?? {};
    const definitions = this.solverService.getAlgorithmParameters(run.algorithm.id) ?? [];
    const preferredKeys = this.getKeyParameterKeys(run.algorithm.id);
    const entries: string[] = [];

    const appendEntry = (key: string) => {
      if (!Object.prototype.hasOwnProperty.call(parameters, key)) {
        return;
      }
      const definition = definitions.find((item) => item.key === key) ?? null;
      const value = parameters[key]!;
      const label = definition?.label ?? this.fallbackParameterLabel(key);
      entries.push(`${label}: ${this.formatParameterValue(definition, value)}`);
    };

    preferredKeys.forEach(appendEntry);

    if (!entries.length) {
      definitions.slice(0, 2).forEach((definition) => appendEntry(definition.key));
    }

    if (!entries.length) {
      Object.keys(parameters)
        .slice(0, 2)
        .forEach(appendEntry);
    }

    return entries.join(' · ');
  }

  private getKeyParameterKeys(algorithm: AlgorithmId): string[] {
    switch (algorithm) {
      case 'rl':
        return ['episodes', 'gamma'];
      case 'ga':
        return ['population', 'mutation', 'elitism'];
      case 'tabu':
        return ['iterations', 'tabuTenure', 'aspiration'];
      default:
        return [];
    }
  }
}
