import { AsyncPipe, NgIf } from '@angular/common';
import { AfterViewInit, Component, OnDestroy, ViewChild, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { map, shareReplay, Subscription } from 'rxjs';
import {
  DashboardMetrics,
  DatasetDefinition,
  ProblemInstance,
  RoutePlan,
  SolveResponse,
  SolverRunConfig,
} from '../../core/models';
import { MockDataService } from '../../core/services/mock-data.service';
import { SolverAdapterService } from '../../core/services/solver-adapter.service';
import { MetricsService } from '../../core/services/metrics.service';
import { ExportService } from '../../core/services/export.service';
import { ControlsPanelComponent } from '../controls-panel/controls-panel.component';
import { MapViewComponent } from '../map-view/map-view.component';
import { MetricsCardsComponent } from '../metrics-cards/metrics-cards.component';
import { RoutesTabComponent } from '../routes-tab/routes-tab.component';
import { CompareTabComponent } from '../compare-tab/compare-tab.component';
import { RunLogTabComponent } from '../run-log-tab/run-log-tab.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    AsyncPipe,
    NgIf,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSidenavModule,
    MatSnackBarModule,
    MatTabsModule,
    MatToolbarModule,
    ControlsPanelComponent,
    MapViewComponent,
    MetricsCardsComponent,
    RoutesTabComponent,
    CompareTabComponent,
    RunLogTabComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements AfterViewInit, OnDestroy {
  private readonly mockDataService = inject(MockDataService);
  private readonly solverService = inject(SolverAdapterService);
  private readonly metricsService = inject(MetricsService);
  private readonly exportService = inject(ExportService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly breakpointObserver = inject(BreakpointObserver);

  @ViewChild(MatSidenav) drawer?: MatSidenav;

  readonly isHandset$ = this.breakpointObserver
    .observe([Breakpoints.XSmall, Breakpoints.Small])
    .pipe(
      map((state) => state.matches),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  datasets: DatasetDefinition[] = [];
  config: SolverRunConfig = this.createDefaultConfig();
  solution: SolveResponse | null = null;
  metrics: DashboardMetrics | null = null;
  instance: ProblemInstance | null = null;
  highlightVehicle: number | null = null;
  isSolving = false;

  private readonly subscriptions = new Subscription();
  private handset = false;

  get routes(): RoutePlan[] {
    return this.solution?.routes ?? [];
  }

  get algorithms() {
    return this.solverService.getAlgorithms();
  }

  ngAfterViewInit(): void {
    this.datasets = this.mockDataService.getDatasets();
    if (!this.config.datasetId && this.datasets.length > 0) {
      this.config.datasetId = this.datasets[0].id;
    }
    this.instance = this.mockDataService.createInstance(this.config.datasetId, this.config.seed);

    this.subscriptions.add(
      this.isHandset$.subscribe((isHandset) => {
        this.handset = isHandset;
        if (!isHandset) {
          this.drawer?.open();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onRun(config: SolverRunConfig): void {
    this.config = { ...config };
    this.executeRun();
    if (this.handset) {
      this.drawer?.close();
    }
  }

  onReset(): void {
    this.config = this.createDefaultConfig();
    this.instance = this.mockDataService.createInstance(this.config.datasetId, this.config.seed);
    this.solution = null;
    this.metrics = null;
    this.highlightVehicle = null;
  }

  onConfigChanged(config: SolverRunConfig): void {
    this.config = { ...config };
    this.instance = this.mockDataService.createInstance(config.datasetId, config.seed);
    this.solution = null;
    this.metrics = null;
  }

  async onExport(format: 'json' | 'png'): Promise<void> {
    if (!this.instance || !this.solution) {
      this.snackBar.open('Run the solver before exporting.', undefined, { duration: 2500 });
      return;
    }

    if (format === 'json') {
      this.exportService.exportJson('cvrp-solution.json', {
        config: this.config,
        instance: this.instance,
        solution: this.solution,
      });
      this.snackBar.open('Solution exported as JSON.', undefined, { duration: 2200 });
      return;
    }

    const svg = document.getElementById('cvrp-map') as SVGElement | null;
    if (!svg) {
      this.snackBar.open('Map is not available for export.', undefined, { duration: 2200 });
      return;
    }
    await this.exportService.exportSvgAsPng(svg, 'cvrp-map.png');
    this.snackBar.open('Map exported as PNG.', undefined, { duration: 2200 });
  }

  onHighlightChange(vehicle: number | null): void {
    this.highlightVehicle = vehicle;
  }

  get utilization(): number {
    if (!this.instance) {
      return 0;
    }
    return this.metricsService.getUtilization(this.instance, this.solution);
  }

  private async executeRun(): Promise<void> {
    try {
      this.isSolving = true;
      this.instance = this.mockDataService.createInstance(this.config.datasetId, this.config.seed);
      const solution = await this.solverService.solve(
        this.instance,
        this.config.vehicles,
        this.config.algorithm,
        this.config.parameters,
        this.config.seed,
      );
      this.solution = solution;
      this.metrics = this.metricsService.computeMetrics(solution);
      this.highlightVehicle = null;
    } catch (error) {
      console.error(error);
      this.snackBar.open('Failed to run mock solver.', undefined, { duration: 2500 });
    } finally {
      this.isSolving = false;
    }
  }

  private createDefaultConfig(): SolverRunConfig {
    const algorithms = this.solverService.getAlgorithms();
    const defaultAlgorithm = algorithms[0]?.id ?? 'tabu';
    const parameters: Record<string, number> = {};
    const definition = algorithms.find((item) => item.id === defaultAlgorithm);
    definition?.parameters.forEach((parameter) => {
      parameters[parameter.key] = parameter.defaultValue;
    });

    return {
      datasetId: 'city-grid',
      vehicles: { count: 4, capacity: 60 },
      algorithm: defaultAlgorithm,
      parameters,
      seed: '12345',
    };
  }

}
