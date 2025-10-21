import { Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { Subscription, fromEvent } from 'rxjs';
import {
  DashboardMetrics,
  DatasetDefinition,
  ProblemInstance,
  RoutePlan,
  SolveResponse,
  SolverRunConfig,
  AlgorithmSummary,
  AlgorithmId,
  ResultTabData,
  RunResultSummary,
  RunAlgorithmInfo,
} from '../../core/models';
import { MockDataService } from '../../core/services/mock-data.service';
import { SolverAdapterService } from '../../core/services/solver-adapter.service';
import { MetricsService } from '../../core/services/metrics.service';
import { ExportService } from '../../core/services/export.service';
import { TabsStoreService, TabsState } from './tabs-store.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [],
  host: {
    class: 'block h-full'
  },
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly mockDataService = inject(MockDataService);
  private readonly solverService = inject(SolverAdapterService);
  private readonly metricsService = inject(MetricsService);
  private readonly exportService = inject(ExportService);
  private readonly tabsStore = inject(TabsStoreService);

  @ViewChildren('tabButton') tabButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  datasets: DatasetDefinition[] = [];
  config: SolverRunConfig = this.createDefaultConfig();
  solution: SolveResponse | null = null;
  metrics: DashboardMetrics | null = null;
  instance: ProblemInstance | null = null;
  hoverVehicle: number | null = null;
  selectedVehicle: number | null = null;
  isSolving = false;
  isHandset = false;
  isInfoRailDrawer = false;
  infoRailOpen = true;
  sidebarOpen = true;
  toast: { message: string; actionLabel?: string; actionResultId?: string } | null = null;

  readonly tabsState$ = this.tabsStore.state$;

  private readonly subscriptions = new Subscription();
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private algorithmLookup = new Map<AlgorithmId, AlgorithmSummary>();

  private readonly vehicleColorPalette = [
    '#1f77b4',
    '#ff7f0e',
    '#2ca02c',
    '#d62728',
    '#9467bd',
    '#8c564b',
    '#e377c2',
    '#7f7f7f',
    '#bcbd22',
    '#17becf',
  ];

  get highlightVehicle(): number | null {
    return this.hoverVehicle ?? this.selectedVehicle;
  }

  get routes(): RoutePlan[] {
    return this.solution?.routes ?? [];
  }

  get algorithms(): AlgorithmSummary[] {
    return Array.from(this.algorithmLookup.values());
  }

  ngOnInit(): void {
    this.datasets = this.mockDataService.getDatasets();
    if (!this.config.datasetId && this.datasets.length > 0) {
      this.config.datasetId = this.datasets[0].id;
    }
    this.refreshAlgorithmLookup();
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

  onRun(config: SolverRunConfig): void {
    this.config = this.cloneConfig(config);
    this.tabsStore.activateTab('map');
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
    this.hoverVehicle = null;
    this.selectedVehicle = null;
    if (this.isInfoRailDrawer) {
      this.infoRailOpen = false;
    }
    this.tabsStore.reset();
  }

  onConfigChanged(config: SolverRunConfig): void {
    this.config = this.cloneConfig(config);
    this.instance = this.mockDataService.createInstance(config.datasetId, config.seed);
    this.solution = null;
    this.metrics = null;
    this.hoverVehicle = null;
    this.selectedVehicle = null;
    if (this.isInfoRailDrawer) {
      this.infoRailOpen = false;
    }
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

  setHoverVehicle(vehicle: number | null): void {
    this.hoverVehicle = vehicle;
  }

  toggleVehicleSelection(vehicle: number): void {
    this.selectedVehicle = this.selectedVehicle === vehicle ? null : vehicle;
  }

  isVehicleSelected(vehicle: number): boolean {
    return this.selectedVehicle === vehicle;
  }

  toggleInfoRail(): void {
    if (!this.isInfoRailDrawer) {
      return;
    }
    this.infoRailOpen = !this.infoRailOpen;
  }

  closeInfoRail(): void {
    if (this.isInfoRailDrawer) {
      this.infoRailOpen = false;
    }
  }

  getVehicleColor(vehicle: number): string {
    const paletteIndex = Math.max(0, vehicle - 1) % this.vehicleColorPalette.length;
    return this.vehicleColorPalette[paletteIndex];
  }

  getVehicleCapacity(run: ResultTabData, vehicleId: number): number {
    const capacity = run.rawRequest.config.vehicles.vehicles.find((item) => item.id === vehicleId)?.capacity;
    return capacity ?? 0;
  }

  getVehicleLoadPct(run: ResultTabData, route: RoutePlan): number {
    const capacity = this.getVehicleCapacity(run, route.vehicle);
    if (capacity <= 0) {
      return 0;
    }
    const pct = (route.load / capacity) * 100;
    return Number(Math.min(Math.max(pct, 0), 150).toFixed(1));
  }

  getVehicleStops(route: RoutePlan): number {
    if (!route.nodes || route.nodes.length <= 2) {
      return 0;
    }
    return Math.max(route.nodes.length - 2, 0);
  }

  getVehicleLoadWidthPct(run: ResultTabData, route: RoutePlan): number {
    return Math.min(this.getVehicleLoadPct(run, route), 100);
  }

  isVehicleOverCapacity(run: ResultTabData, route: RoutePlan): boolean {
    return this.getVehicleLoadPct(run, route) > 100;
  }

  get utilization(): number {
    if (!this.instance) {
      return 0;
    }
    return this.metricsService.getUtilization(this.instance, this.solution);
  }

  openLastResult(): void {
    this.tabsStore.openLastResult();
    this.dismissToast();
  }

  getCustomerCountLabel(): string {
    const count = this.instance?.customers?.length ?? 0;
    const suffix = count === 1 ? 'customer' : 'customers';
    return `${count} ${suffix}`;
  }

  formatCapacityStatus(violations: number): string {
    if (!Number.isFinite(violations)) {
      return 'Capacity status unavailable';
    }
    return violations === 0
      ? '0 capacity violations'
      : `${violations} capacity violation${violations === 1 ? '' : 's'}`;
  }

  activateTab(tabId: string): void {
    this.tabsStore.activateTab(tabId);
  }

  closeTab(tabId: string, event?: Event): void {
    event?.stopPropagation();
    this.tabsStore.closeTab(tabId);
  }

  handleTabKeydown(event: KeyboardEvent, tabId: string, closable: boolean): void {
    const key = event.key;
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      event.preventDefault();
      const ordered = this.tabsStore.getOrderedTabIds();
      const currentIndex = ordered.indexOf(tabId);
      if (currentIndex === -1) {
        return;
      }
      const offset = key === 'ArrowRight' ? 1 : -1;
      let nextIndex = currentIndex + offset;
      if (nextIndex < 0) {
        nextIndex = ordered.length - 1;
      } else if (nextIndex >= ordered.length) {
        nextIndex = 0;
      }
      const nextTabId = ordered[nextIndex];
      this.tabsStore.activateTab(nextTabId);
      queueMicrotask(() => {
        const button = this.getTabButtonElement(nextTabId);
        button?.focus();
      });
      return;
    }

    if ((key === 'Delete' || key === 'Backspace') && closable) {
      event.preventDefault();
      this.tabsStore.closeTab(tabId);
      queueMicrotask(() => {
        const state = this.tabsStore.snapshot;
        const button = this.getTabButtonElement(state.activeTabId);
        button?.focus();
      });
    }
  }

  trackResultTab(_: number, tab: ResultTabData): string {
    return tab.id;
  }

  trackVehicle(_: number, route: RoutePlan): number {
    return route.vehicle;
  }

  getActiveResult(state: TabsState): ResultTabData | null {
    return state.resultTabs.find((tab) => tab.id === state.activeTabId) ?? null;
  }

  getLastRun(state: TabsState): ResultTabData | null {
    return state.map.lastRun;
  }

  private async executeRun(): Promise<void> {
    try {
      this.isSolving = true;
      this.instance = this.mockDataService.createInstance(this.config.datasetId, this.config.seed);
      this.solution = null;
      this.metrics = null;
      this.hoverVehicle = null;
      this.selectedVehicle = null;
      const solution = await this.solverService.solve(
        this.instance,
        this.config.vehicles,
        this.config.algorithm,
        this.config.parameters,
        this.config.seed,
      );
      const coloredSolution = this.withRouteColors(solution);
      this.solution = coloredSolution;
      this.metrics = this.metricsService.computeMetrics(coloredSolution);
      this.hoverVehicle = null;
      this.selectedVehicle = null;
      this.persistResult(coloredSolution);
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
    const drawer = width < 1024;
    if (drawer !== this.isInfoRailDrawer) {
      this.isInfoRailDrawer = drawer;
      this.infoRailOpen = drawer ? false : true;
    }
    if (!drawer) {
      this.infoRailOpen = true;
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

  private cloneInstance(instance: ProblemInstance): ProblemInstance {
    return {
      id: instance.id,
      name: instance.name,
      depot: { ...instance.depot },
      customers: instance.customers.map((customer) => ({ ...customer })),
    };
  }

  private showToast(message: string, options?: { actionLabel?: string; actionResultId?: string }): void {
    this.toast = {
      message,
      actionLabel: options?.actionLabel,
      actionResultId: options?.actionResultId,
    };
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => {
      this.dismissToast();
    }, 2600);
  }

  private refreshAlgorithmLookup(): void {
    this.algorithmLookup.clear();
    const summaries = this.solverService.getAlgorithms();
    summaries.forEach((algorithm) => {
      this.algorithmLookup.set(algorithm.id, algorithm);
    });
  }

  private buildAlgorithmInfo(algorithmId: AlgorithmId): RunAlgorithmInfo {
    const summary = this.algorithmLookup.get(algorithmId);
    const name = summary?.name ?? algorithmId.toUpperCase();
    const code = algorithmId.toUpperCase();
    return { id: algorithmId, name, code };
  }

  onToastAction(event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const targetId = this.toast?.actionResultId;
    if (targetId) {
      this.tabsStore.activateTab(targetId);
    }
    this.dismissToast();
  }

  private dismissToast(): void {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
    this.toast = null;
  }

  private withRouteColors(solution: SolveResponse): SolveResponse {
    const routes = solution.routes.map((route) => ({
      ...route,
      color: route.color ?? this.getVehicleColor(route.vehicle),
    }));
    return { ...solution, routes };
  }

  private persistResult(solution: SolveResponse): void {
    if (!this.instance) {
      return;
    }
    const summary = this.buildRunSummary(this.instance, this.config, solution);
    const instanceSnapshot = this.cloneInstance(this.instance);
    const configSnapshot = this.cloneConfig(this.config);
    const algorithm = this.buildAlgorithmInfo(this.config.algorithm);

    const result = this.tabsStore.registerResult({
      summary,
      vehicles: solution.routes,
      customers: instanceSnapshot.customers,
      geometry: {
        depot: instanceSnapshot.depot,
        routes: solution.routes,
      },
      rawRequest: {
        config: configSnapshot,
        instance: instanceSnapshot,
      },
      rawResponse: solution,
      algorithm,
    });
    if (this.isInfoRailDrawer) {
      this.infoRailOpen = true;
    }
    this.showToast(`Run #${result.runNumber} — ${result.algorithm.code} ready`, {
      actionLabel: 'Open',
      actionResultId: result.id,
    });
  }

  private buildRunSummary(
    instance: ProblemInstance,
    config: SolverRunConfig,
    solution: SolveResponse,
  ): RunResultSummary {
    const totalDemand = instance.customers.reduce((sum, customer) => sum + customer.demand, 0);
    const fleetCapacity = config.vehicles.vehicles.reduce((sum, vehicle) => sum + vehicle.capacity, 0);
    const rawUtilization = fleetCapacity > 0 ? (totalDemand / fleetCapacity) * 100 : 0;
    const utilizationPct = Number(rawUtilization.toFixed(1));

    return {
      totalDistance: Number(solution.distance.toFixed(2)),
      vehiclesUsed: solution.vehiclesUsed,
      runtimeMs: solution.runtimeMs,
      feasible: typeof solution.feasible === 'boolean' ? solution.feasible : null,
      capacityViolations: solution.violations?.capacity ?? 0,
      totalDemand: Number(totalDemand.toFixed(2)),
      fleetCapacity: Number(fleetCapacity.toFixed(2)),
      utilizationPct,
    };
  }

  private getTabButtonElement(tabId: string): HTMLButtonElement | null {
    const buttons = this.tabButtons?.toArray() ?? [];
    for (const item of buttons) {
      if (item.nativeElement.dataset['tabId'] === tabId) {
        return item.nativeElement;
      }
    }
    return null;
  }
}
