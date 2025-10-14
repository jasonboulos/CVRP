import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder } from '@angular/forms';
import { Subscription, distinctUntilChanged } from 'rxjs';
import {
  AlgorithmId,
  AlgorithmSummary,
  DatasetDefinition,
  SolverRunConfig,
  VehiclesConfig,
} from '../../core/models';

@Component({
  selector: 'app-controls-panel',
  templateUrl: './controls-panel.component.html',
  styleUrls: ['./controls-panel.component.scss'],
})
export class ControlsPanelComponent implements OnChanges, OnInit, OnDestroy {
  constructor(private readonly fb: NonNullableFormBuilder) {}

  @Input() datasets: DatasetDefinition[] = [];
  @Input() algorithms: AlgorithmSummary[] = [];
  @Input() config!: SolverRunConfig;

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
      capacity: FormControl<number>;
    }>;
    algorithm: FormControl<AlgorithmId>;
    seed: FormControl<string>;
  }> = this.fb.group({
    datasetId: this.fb.control(''),
    vehicles: this.fb.group({
      count: this.fb.control(3),
      capacity: this.fb.control(40),
    }),
    algorithm: this.fb.control<AlgorithmId>('tabu'),
    seed: this.fb.control('12345'),
  });

  parameterControls: FormControl<number>[] = [];
  selectedAlgorithm: AlgorithmSummary | null = null;
  exportMenuOpen = false;

  get datasetDescription(): string | null {
    const datasetId = this.form.controls.datasetId.value;
    if (!datasetId) {
      return null;
    }
    const dataset = this.datasets.find((datasetItem) => datasetItem.id === datasetId);
    return dataset ? dataset.description : null;
  }

  get vehicleCount(): number {
    return this.form.controls.vehicles.controls.count.value;
  }

  get vehicleCapacity(): number {
    return this.form.controls.vehicles.controls.capacity.value;
  }

  ngOnInit(): void {
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

    const vehiclesGroup = this.form.controls.vehicles.controls;
    this.subscription.add(
      vehiclesGroup.count.valueChanges
        .pipe(distinctUntilChanged())
        .subscribe(() => this.emitConfigChange()),
    );
    this.subscription.add(
      vehiclesGroup.capacity.valueChanges
        .pipe(distinctUntilChanged())
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
    this.form.patchValue(
      {
        datasetId: config.datasetId,
        vehicles: { ...config.vehicles },
        algorithm: config.algorithm,
        seed: config.seed,
      },
      { emitEvent: false },
    );
  }

  private buildConfig(): SolverRunConfig {
    const formValue = this.form.getRawValue();
    const parameters = this.collectParameterValues();
    const vehicles: VehiclesConfig = {
      count: formValue.vehicles.count,
      capacity: formValue.vehicles.capacity,
    };
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
}
