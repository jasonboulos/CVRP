import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Subscription, fromEvent } from 'rxjs';
import {
  DashboardMetrics,
  DatasetDefinition,
  ProblemInstance,
  RoutePlan,
  SolveResponse,
  SolverRunConfig,
  AlgorithmSummary,
} from '../../core/models';
import { MockDataService } from '../../core/services/mock-data.service';
import { SolverAdapterService } from '../../core/services/solver-adapter.service';
import { MetricsService } from '../../core/services/metrics.service';
import { ExportService } from '../../core/services/export.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly mockDataService = inject(MockDataService);
  private readonly solverService = inject(SolverAdapterService);
  private readonly metricsService = inject(MetricsService);
  private readonly exportService = inject(ExportService);

  datasets: DatasetDefinition[] = [];
  config: SolverRunConfig = this.createDefaultConfig();
  solution: SolveResponse | null = null;
  metrics: DashboardMetrics | null = null;
  instance: ProblemInstance | null = null;
  highlightVehicle: number | null = null;
  isSolving = false;
  isHandset = false;
  sidebarOpen = true;
  activeTab: 'routes' | 'compare' | 'log' = 'routes';
  toastMessage: string | null = null;

  private readonly subscriptions = new Subscription();
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  get routes(): RoutePlan[] {
    return this.solution?.routes ?? [];
  }

  get algorithms(): AlgorithmSummary[] {
    return this.solverService.getAlgorithms();
  }

  ngOnInit(): void {
    this.datasets = this.mockDataService.getDatasets();
    if (!this.config.datasetId && this.datasets.length > 0) {
      this.config.datasetId = this.datasets[0].id;
    }
    this.instance = this.mockDataService.createInstance(this.config.datasetId, this.config.seed);
    this.updateBreakpoint(window.innerWidth);
    this.sidebarOpen = !this.isHandset;

    this.subscriptions.add(
      fromEvent<UIEvent>(window, 'resize').subscribe((event: UIEvent) => {
        const target = event.target;
        const width =
          typeof target === 'object' && target !== null && 'innerWidth' in target
            ? (target as Window).innerWidth
            : window.innerWidth;
        this.updateBreakpoint(width);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
  }

  toggleSidebar(): void {
    if (this.isHandset) {
      this.sidebarOpen = !this.sidebarOpen;
    }
  }

  selectTab(tab: 'routes' | 'compare' | 'log'): void {
    this.activeTab = tab;
  }

  onRun(config: SolverRunConfig): void {
    this.config = this.cloneConfig(config);
    this.executeRun();
    if (this.isHandset) {
      this.sidebarOpen = false;
    }
  }

  onReset(): void {
    this.config = this.cloneConfig(this.createDefaultConfig());
    this.instance = this.mockDataService.createInstance(this.config.datasetId, this.config.seed);
    this.solution = null;
    this.metrics = null;
    this.highlightVehicle = null;
  }

  onConfigChanged(config: SolverRunConfig): void {
    this.config = this.cloneConfig(config);
    this.instance = this.mockDataService.createInstance(config.datasetId, config.seed);
    this.solution = null;
    this.metrics = null;
  }

  async onExport(format: 'json' | 'png'): Promise<void> {
    if (!this.instance || !this.solution) {
      this.showToast('Run the solver before exporting.');
      return;
    }

    if (format === 'json') {
      this.exportService.exportJson('cvrp-solution.json', {
        config: this.config,
        instance: this.instance,
        solution: this.solution,
      });
      this.showToast('Solution exported as JSON.');
      return;
    }

    const svg = document.getElementById('cvrp-map') as SVGElement | null;
    if (!svg) {
      this.showToast('Map is not available for export.');
      return;
    }
    await this.exportService.exportSvgAsPng(svg, 'cvrp-map.png');
    this.showToast('Map exported as PNG.');
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
      this.solution = null;
      this.metrics = null;
      this.highlightVehicle = null;
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
      if (this.config.algorithm === 'rl') {
        this.showToast('RL solver request failed. Check that the backend is running.');
      } else {
        this.showToast('Failed to run mock solver.');
      }
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
      vehicles: {
        vehicles: Array.from({ length: 4 }, (_, index) => ({ id: index + 1, capacity: 60 })),
      },
      algorithm: defaultAlgorithm,
      parameters,
      seed: '12345',
    };
  }

  private updateBreakpoint(width: number): void {
    const handset = width < 768;
    if (handset !== this.isHandset) {
      this.isHandset = handset;
      if (!handset) {
        this.sidebarOpen = true;
      }
    }
  }

  private cloneConfig(config: SolverRunConfig): SolverRunConfig {
    return {
      datasetId: config.datasetId,
      vehicles: {
        vehicles: config.vehicles.vehicles.map((vehicle) => ({ ...vehicle })),
      },
      algorithm: config.algorithm,
      parameters: { ...config.parameters },
      seed: config.seed,
    };
  }

  private showToast(message: string): void {
    this.toastMessage = message;
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => {
      this.toastMessage = null;
      this.toastTimeout = null;
    }, 2200);
  }
}
