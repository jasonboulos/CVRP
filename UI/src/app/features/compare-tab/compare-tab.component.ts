import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { ConvergencePoint, RuntimeSlice } from '../../core/models';

@Component({
  selector: 'app-compare-tab',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  templateUrl: './compare-tab.component.html',
  styleUrls: ['./compare-tab.component.scss'],
})
export class CompareTabComponent {
  @Input() convergence: ConvergencePoint[] | null | undefined = null;
  @Input() runtimeBreakdown: RuntimeSlice[] | null | undefined = null;

  readonly width = 480;
  readonly height = 220;

  get linePath(): string {
    if (!this.convergence || this.convergence.length === 0) {
      return '';
    }
    const xScale = this.width / Math.max(...this.convergence.map((point) => point.iteration));
    const minDistance = Math.min(...this.convergence.map((point) => point.bestDistance));
    const maxDistance = Math.max(...this.convergence.map((point) => point.bestDistance));
    const range = maxDistance - minDistance || 1;

    return this.convergence
      .map((point, index) => {
        const x = index === 0 ? 0 : point.iteration * xScale;
        const normalized = (point.bestDistance - minDistance) / range;
        const y = this.height - normalized * this.height;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  }

  get bars(): { label: string; value: number; width: number }[] {
    if (!this.runtimeBreakdown || this.runtimeBreakdown.length === 0) {
      return [];
    }
    const total = this.runtimeBreakdown.reduce((sum, slice) => sum + slice.ms, 0) || 1;
    return this.runtimeBreakdown.map((slice) => ({
      label: slice.label,
      value: slice.ms,
      width: Math.round((slice.ms / total) * 100),
    }));
  }
}
