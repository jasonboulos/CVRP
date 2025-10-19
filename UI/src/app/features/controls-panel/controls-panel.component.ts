import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import { Subscription, distinctUntilChanged } from 'rxjs';
import {
  AlgorithmId,
  AlgorithmSummary,
  DatasetDefinition,
  SolverRunConfig,
  VehiclesConfig,
} from '../../core/models';
import { DatasetsStoreService, StoredDataset } from './datasets-store.service';

@Component({
  selector: 'app-controls-panel',
  templateUrl: './controls-panel.component.html',
  styleUrls: ['./controls-panel.component.scss'],
})
export class ControlsPanelComponent implements OnChanges, OnInit, OnDestroy {
  constructor(
    private readonly fb: NonNullableFormBuilder,
    private readonly datasetsStore: DatasetsStoreService,
  ) {}

  @ViewChild('datasetFileInput') datasetFileInput?: ElementRef<HTMLInputElement>;

  @Input() datasets: DatasetDefinition[] = [];
  @Input() algorithms: AlgorithmSummary[] = [];
  @Input() config!: SolverRunConfig;
  @Input() solving = false;

  @Output() run = new EventEmitter<SolverRunConfig>();
  @Output() reset = new EventEmitter<void>();
  @Output() export = new EventEmitter<'json' | 'png'>();
  @Output() configChange = new EventEmitter<SolverRunConfig>();

  private readonly subscription = new Subscription();
  private parameterSubscriptions: Subscription[] = [];

  readonly form: FormGroup<{
    datasetId: FormControl<string>;
    vehicles: FormGroup<{
      count: FormControl<number>;
      capacities: FormArray<FormControl<number>>;
      sameCapacity: FormControl<boolean>;
      sameCapacityValue: FormControl<number>;
    }>;
    algorithm: FormControl<AlgorithmId>;
    seed: FormControl<string>;
  }> = this.fb.group({
    datasetId: this.fb.control(''),
    vehicles: this.fb.group({
      count: this.fb.control(3),
      capacities: this.fb.array<FormControl<number>>([]),
      sameCapacity: this.fb.control(true),
      sameCapacityValue: this.fb.control(60),
    }),
    algorithm: this.fb.control<AlgorithmId>('tabu'),
    seed: this.fb.control('12345'),
  });

  parameterControls: FormControl<number>[] = [];
  selectedAlgorithm: AlgorithmSummary | null = null;
  exportMenuOpen = false;
  availableDatasets: DatasetDefinition[] = [];

  get datasetDescription(): string | null {
    const datasetId = this.form.controls.datasetId.value;
    if (!datasetId) {
      return null;
    }
    const dataset = this.availableDatasets.find((datasetItem) => datasetItem.id === datasetId);
    return dataset ? dataset.description : null;
  }

  get vehicleCount(): number {
    return this.capacitiesArray.length;
  }

  get vehicleCapacityControls(): FormControl<number>[] {
    return this.capacitiesArray.controls;
  }

  get capacitiesArray(): FormArray<FormControl<number>> {
    return this.vehiclesGroup.controls.capacities;
  }

  get vehiclesGroup(): FormGroup<{
    count: FormControl<number>;
    capacities: FormArray<FormControl<number>>;
    sameCapacity: FormControl<boolean>;
    sameCapacityValue: FormControl<number>;
  }> {
    return this.form.controls.vehicles;
  }

  ngOnInit(): void {
    this.refreshDatasets();
    this.subscription.add(
      this.form.controls.datasetId.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe(() => this.emitConfigChange()),
    );

    this.subscription.add(
      this.form.controls.seed.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe(() => this.emitConfigChange()),
    );

    const vehiclesGroup = this.vehiclesGroup.controls;
    this.ensureCapacityControls(vehiclesGroup.count.value, undefined, false);
    this.subscription.add(
      vehiclesGroup.count.valueChanges.pipe(distinctUntilChanged()).subscribe((count) => {
        this.ensureCapacityControls(count, undefined, false);
      }),
    );
    this.subscription.add(
      vehiclesGroup.sameCapacity.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((sameCapacity) => {
          if (sameCapacity) {
            this.applySameCapacityToAll(vehiclesGroup.sameCapacityValue.value, false);
          }
          this.emitConfigChange();
        }),
    );
    this.subscription.add(
      vehiclesGroup.sameCapacityValue.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((value) => {
          if (vehiclesGroup.sameCapacity.value) {
            this.applySameCapacityToAll(value, false);
            this.emitConfigChange();
          }
        }),
    );
    this.subscription.add(
      this.capacitiesArray.valueChanges
        .pipe(
          distinctUntilChanged((previous, current) =>
            previous.length === current.length && previous.every((value, index) => value === current[index]),
          ),
        )
        .subscribe(() => this.emitConfigChange()),
    );

    this.subscription.add(
      this.form.controls.algorithm.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe((algorithm) => {
          if (algorithm) {
            this.setParameterControls(algorithm);
          }
        }),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datasets']) {
      this.refreshDatasets();
    }
    if (changes['config'] && this.config) {
      this.patchForm(this.config);
      this.setParameterControls(this.config.algorithm, this.config);
    } else if (changes['algorithms'] && this.config) {
      this.setParameterControls(this.config.algorithm, this.config);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.parameterSubscriptions.forEach((sub) => sub.unsubscribe());
    this.parameterSubscriptions = [];
  }

  onRun(): void {
    this.run.emit(this.buildConfig());
  }

  handleReset(): void {
    this.reset.emit();
  }

  handleExport(format: 'json' | 'png'): void {
    this.exportMenuOpen = false;
    this.export.emit(format);
  }

  openDatasetImport(): void {
    const input = this.datasetFileInput?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  async onDatasetFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    if (!input || !input.files || input.files.length === 0) {
      return;
    }
    const file = input.files[0];
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const dataset = this.createImportedDataset(raw);
      if (!dataset) {
        throw new Error('Invalid dataset');
      }
      this.datasetsStore.saveDataset(dataset);
      this.refreshDatasets();
      this.form.controls.datasetId.setValue(dataset.definition.id);
    } catch {
      alert('Invalid dataset file');
    } finally {
      input.value = '';
    }
  }

  toggleExportMenu(): void {
    this.exportMenuOpen = !this.exportMenuOpen;
  }

  randomizeSeed(): void {
    this.form.controls.seed.setValue(Date.now().toString());
  }

  getParameterValue(index: number): number {
    const control = this.parameterControls[index];
    if (control) {
      return control.value;
    }
    const parameter = this.selectedAlgorithm?.parameters[index];
    return parameter ? parameter.defaultValue : 0;
  }

  private setParameterControls(algorithm: AlgorithmId, sourceConfig?: SolverRunConfig): void {
    this.parameterSubscriptions.forEach((sub) => sub.unsubscribe());
    this.parameterSubscriptions = [];
    this.selectedAlgorithm = this.algorithms.find((item) => item.id === algorithm) ?? null;
    const parameters = this.selectedAlgorithm?.parameters ?? [];
    const parameterValues = sourceConfig?.parameters ?? {};

    this.parameterControls = parameters.map((parameter) => {
      const control = new FormControl<number>(
        parameterValues[parameter.key] ?? parameter.defaultValue,
        { nonNullable: true },
      );
      this.parameterSubscriptions.push(
        control.valueChanges
          .pipe(distinctUntilChanged())
          .subscribe(() => this.emitConfigChange()),
      );
      return control;
    });

    if (!sourceConfig) {
      this.emitConfigChange();
    }
  }

  private patchForm(config: SolverRunConfig): void {
    this.refreshDatasets();
    const vehicleCapacities = config.vehicles.vehicles.map((vehicle) => vehicle.capacity);
    this.form.patchValue(
      {
        datasetId: config.datasetId,
        vehicles: { count: config.vehicles.vehicles.length },
        algorithm: config.algorithm,
        seed: config.seed,
      },
      { emitEvent: false },
    );
    const vehiclesGroup = this.vehiclesGroup.controls;
    const allEqual = vehicleCapacities.every((capacity) => capacity === vehicleCapacities[0]);
    const firstCapacity = vehicleCapacities[0] ?? vehiclesGroup.sameCapacityValue.value;
    const sharedValue = Math.max(1, Math.round(firstCapacity || 0));
    vehiclesGroup.sameCapacityValue.setValue(sharedValue, { emitEvent: false });
    if (allEqual) {
      vehiclesGroup.sameCapacity.setValue(true, { emitEvent: false });
      this.ensureCapacityControls(config.vehicles.vehicles.length, undefined, false);
      this.applySameCapacityToAll(sharedValue, false);
    } else {
      vehiclesGroup.sameCapacity.setValue(false, { emitEvent: false });
      this.ensureCapacityControls(config.vehicles.vehicles.length, vehicleCapacities, false);
    }
  }

  private buildConfig(): SolverRunConfig {
    const formValue = this.form.getRawValue();
    const parameters = this.collectParameterValues();
    const vehicles: VehiclesConfig = {
      vehicles: this.vehicleCapacityControls.map((control, index) => ({
        id: index + 1,
        capacity: Math.max(1, Math.round(control.value)),
      })),
    };
    if (formValue.vehicles.count !== vehicles.vehicles.length) {
      this.form.controls.vehicles.controls.count.setValue(vehicles.vehicles.length, { emitEvent: false });
    }
    return {
      datasetId: formValue.datasetId,
      vehicles,
      algorithm: formValue.algorithm,
      parameters,
      seed: formValue.seed,
    };
  }

  private collectParameterValues(): Record<string, number> {
    if (!this.selectedAlgorithm) {
      return {};
    }
    const result: Record<string, number> = {};
    this.selectedAlgorithm.parameters.forEach((parameter, index) => {
      const control = this.parameterControls[index];
      result[parameter.key] = control?.value ?? parameter.defaultValue;
    });
    return result;
  }

  private emitConfigChange(): void {
    this.configChange.emit(this.buildConfig());
  }

  private ensureCapacityControls(count: number, existing?: number[], emit = true): void {
    const array = this.capacitiesArray;
    const vehiclesGroup = this.vehiclesGroup.controls;
    const sameCapacity = vehiclesGroup.sameCapacity.value;
    const sharedValue = Math.max(1, Math.round(vehiclesGroup.sameCapacityValue.value || 0));
    const safeCount = Math.max(1, Math.min(8, Math.round(count) || 0));
    let mutated = false;
    while (array.length < safeCount) {
      const previousValue = array.length > 0 ? array.at(array.length - 1).value : sameCapacity ? sharedValue : 60;
      const nextValue = sameCapacity
        ? sharedValue
        : Math.max(1, Math.round(existing?.[array.length] ?? previousValue));
      array.push(this.fb.control(Math.max(1, Math.round(nextValue))));
      mutated = true;
    }
    while (array.length > safeCount) {
      array.removeAt(array.length - 1);
      mutated = true;
    }
    if (sameCapacity) {
      this.applySameCapacityToAll(sharedValue, false);
    } else if (existing) {
      existing.slice(0, array.length).forEach((value, index) => {
        array.at(index).setValue(Math.max(1, Math.round(value)), { emitEvent: false });
      });
    }
    const countControl = this.form.controls.vehicles.controls.count;
    const countChanged = countControl.value !== safeCount;
    if (countChanged) {
      countControl.setValue(safeCount, { emitEvent: false });
    }
    if (emit || (!emit && !mutated && countChanged)) {
      this.emitConfigChange();
    }
  }

  private applySameCapacityToAll(value: number, emit = true): void {
    const vehiclesGroup = this.vehiclesGroup.controls;
    const safeValue = Math.max(1, Math.round(value || 0));
    if (vehiclesGroup.sameCapacityValue.value !== safeValue) {
      vehiclesGroup.sameCapacityValue.setValue(safeValue, { emitEvent: false });
    }
    this.capacitiesArray.controls.forEach((control) => {
      if (control.value !== safeValue) {
        control.setValue(safeValue, { emitEvent: false });
      }
    });
    if (emit) {
      this.emitConfigChange();
    }
  }

  private refreshDatasets(): void {
    const importedDatasets = this.datasetsStore.getImportedDatasets();
    const combined: DatasetDefinition[] = [...(this.datasets ?? [])];
    importedDatasets.forEach((dataset) => {
      const existingIndex = combined.findIndex((item) => item.id === dataset.definition.id);
      if (existingIndex >= 0) {
        combined[existingIndex] = dataset.definition;
      } else {
        combined.push(dataset.definition);
      }
    });
    this.availableDatasets = combined;
  }

  private createImportedDataset(raw: unknown): StoredDataset | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const data = raw as { [key: string]: unknown };
    const nameValue = typeof data['name'] === 'string' ? data['name'].trim() : '';
    if (!nameValue) {
      return null;
    }
    const depotRaw = data['depot'];
    if (!depotRaw || typeof depotRaw !== 'object') {
      return null;
    }
    const depot = depotRaw as { [key: string]: unknown };
    const depotX = Number(depot['x']);
    const depotY = Number(depot['y']);
    if (!Number.isFinite(depotX) || !Number.isFinite(depotY)) {
      return null;
    }
    const customersRaw = data['customers'];
    if (!Array.isArray(customersRaw) || customersRaw.length === 0) {
      return null;
    }
    const customers: StoredDataset['customers'] = [];
    for (let index = 0; index < customersRaw.length; index += 1) {
      const customer = customersRaw[index];
      if (!customer || typeof customer !== 'object') {
        return null;
      }
      const customerObject = customer as { [key: string]: unknown };
      const x = Number(customerObject['x']);
      const y = Number(customerObject['y']);
      const demand = Number(customerObject['demand']);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(demand)) {
        return null;
      }
      customers.push({
        id: index + 1,
        x,
        y,
        demand,
      });
    }
    const descriptionSource = typeof data['description'] === 'string' ? data['description'].trim() : '';
    const definition: DatasetDefinition = {
      id: this.generateDatasetId(),
      name: nameValue,
      description: descriptionSource || `Imported dataset (${customers.length} customers).`,
      size: customers.length,
      kind: 'preset',
    };
    return {
      definition,
      depot: {
        id: 0,
        x: depotX,
        y: depotY,
      },
      customers,
    };
  }

  private generateDatasetId(): string {
    const existingImported = this.datasetsStore
      .getImportedDatasets()
      .map((dataset) => dataset.definition.id);
    const existingIds = new Set<string>([
      ...this.datasets.map((dataset) => dataset.id),
      ...this.availableDatasets.map((dataset) => dataset.id),
      ...existingImported,
    ]);
    let id: string;
    do {
      id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    } while (existingIds.has(id));
    return id;
  }
}
