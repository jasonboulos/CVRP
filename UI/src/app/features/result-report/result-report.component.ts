import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ResultTabData } from '../../core/models';

interface TrendPoint {
  label: string;
  value: number;
}

interface ComparisonRow {
  label: string;
  unit?: string;
  current: number;
  target: number;
  betterWhen: 'lower' | 'higher';
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
  @Input() result!: ResultTabData;
  @Input() runs: ResultTabData[] = [];

  compareTargetId: string | null = null;
  compareOptions: ResultTabData[] = [];
  sortedRuns: ResultTabData[] = [];

  distanceTrend: TrendPoint[] = [];
  runtimeTrend: TrendPoint[] = [];

  readonly chartWidth = 520;
  readonly chartHeight = 200;

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.result) {
      this.compareOptions = [];
      this.sortedRuns = [];
      this.distanceTrend = [];
      this.runtimeTrend = [];
      this.compareTargetId = null;
      return;
    }

    this.sortedRuns = [...this.runs].sort((a, b) => a.runNumber - b.runNumber);
    this.compareOptions = this.sortedRuns.filter((run) => run.id !== this.result.id);

    if (this.compareOptions.length === 0) {
      this.compareTargetId = null;
    } else if (!this.compareOptions.some((option) => option.id === this.compareTargetId)) {
      const previous = this.compareOptions
        .filter((run) => run.runNumber < this.result.runNumber)
        .sort((a, b) => b.runNumber - a.runNumber)[0];
      this.compareTargetId = (previous ?? this.compareOptions[this.compareOptions.length - 1])!.id;
    }

    this.distanceTrend = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.totalDistance,
    }));
    this.runtimeTrend = this.sortedRuns.map((run) => ({
      label: `#${run.runNumber}`,
      value: run.summary.runtimeMs / 1000,
    }));
  }

  get compareTarget(): ResultTabData | null {
    if (!this.compareTargetId) {
      return null;
    }
    return this.compareOptions.find((option) => option.id === this.compareTargetId) ?? null;
  }

  get comparisonRows(): ComparisonRow[] {
    const target = this.compareTarget;
    if (!target) {
      return [];
    }
    const currentSummary = this.result.summary;
    const targetSummary = target.summary;
    return [
      {
        label: 'Total distance',
        unit: 'km',
        current: currentSummary.totalDistance,
        target: targetSummary.totalDistance,
        betterWhen: 'lower',
      },
      {
        label: 'Runtime',
        unit: 's',
        current: currentSummary.runtimeMs / 1000,
        target: targetSummary.runtimeMs / 1000,
        betterWhen: 'lower',
      },
      {
        label: 'Capacity violations',
        current: currentSummary.capacityViolations,
        target: targetSummary.capacityViolations,
        betterWhen: 'lower',
      },
    ];
  }

  onCompareTargetChange(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    if (!select) {
      return;
    }
    this.compareTargetId = select.value;
  }

  getStops(route: ResultTabData['vehicles'][number]): number {
    return route.nodes.filter((node) => node !== 0).length;
  }

  formatDelta(row: ComparisonRow): { value: number; improved: boolean | null } {
    const delta = row.current - row.target;
    if (delta === 0) {
      return { value: 0, improved: null };
    }
    const improved = row.betterWhen === 'lower' ? delta < 0 : delta > 0;
    return { value: delta, improved };
  }

  formatNode(node: number): string {
    return node === 0 ? 'Depot' : `C${node}`;
  }

  trackVehicle(_: number, route: ResultTabData['vehicles'][number]): number {
    return route.vehicle;
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
    const range = max - min;

    return points
      .map((point, index) => {
        const x = (index / (points.length - 1)) * this.chartWidth;
        const normalized = range === 0 ? 0.5 : (point.value - min) / range;
        const y = this.chartHeight - normalized * this.chartHeight;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  get chartViewBox(): string {
    return `0 0 ${this.chartWidth} ${this.chartHeight}`;
  }
}
