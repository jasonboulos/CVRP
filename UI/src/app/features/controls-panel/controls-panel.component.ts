import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription } from 'rxjs';
import {
  AlgorithmId,
  AlgorithmSummary,
  DatasetDefinition,
  SolverRunConfig,
  VehiclesConfig,
} from '../../core/models';

@Component({
  selector: 'app-controls-panel',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatSliderModule,
    MatTooltipModule,
  ],
  templateUrl: './controls-panel.component.html',
  styleUrls: ['./controls-panel.component.scss'],
})
export class ControlsPanelComponent implements OnChanges, OnInit, OnDestroy {
  @Input({ required: true }) datasets: DatasetDefinition[] = [];
  @Input({ required: true }) algorithms: AlgorithmSummary[] = [];
  @Input({ required: true }) config!: SolverRunConfig;

  @Output() run = new EventEmitter<SolverRunConfig>();
  @Output() reset = new EventEmitter<void>();
  @Output() export = new EventEmitter<'json' | 'png'>();
  @Output() configChange = new EventEmitter<SolverRunConfig>();

  private readonly fb = inject(NonNullableFormBuilder);

  readonly form = this.fb.group({
    datasetId: this.fb.control('', { validators: [] }),
    vehicles: this.fb.group({
      count: this.fb.control(3),
      capacity: this.fb.control(40),
    }),
    algorithm: this.fb.control<AlgorithmId>('tabu'),
    seed: this.fb.control('12345'),
  });

  readonly parameterControls = signal<FormControl<number>[]>([]);
  readonly selectedAlgorithm = computed(() =>
    this.algorithms.find((algorithm) => algorithm.id === this.form.controls.algorithm.value),
  );

  private readonly subscription = new Subscription();
  private parameterSubscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.subscription.add(this.form.valueChanges.subscribe(() => this.emitConfigChange()));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config'] && this.config) {
      this.patchForm(this.config);
      this.setParameterControls(this.config.algorithm);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.parameterSubscriptions.forEach((sub) => sub.unsubscribe());
    this.parameterSubscriptions = [];
  }

  onRun(): void {
    if (!this.config) {
      return;
    }
    this.run.emit(this.buildConfig());
  }

  onReset(): void {
    this.reset.emit();
  }

  onExport(format: 'json' | 'png'): void {
    this.export.emit(format);
  }

  onAlgorithmChanged(algorithm: AlgorithmId): void {
    this.setParameterControls(algorithm);
    this.emitConfigChange();
  }

  onValueChanged(): void {
    this.emitConfigChange();
  }

  private setParameterControls(algorithm: AlgorithmId): void {
    this.parameterSubscriptions.forEach((sub) => sub.unsubscribe());
    this.parameterSubscriptions = [];
    const parameters = this.algorithms.find((item) => item.id === algorithm)?.parameters ?? [];
    const controls = parameters.map((parameter) => {
      const control = new FormControl<number>(
        this.config.parameters[parameter.key] ?? parameter.defaultValue,
        { nonNullable: true },
      );
      this.parameterSubscriptions.push(control.valueChanges.subscribe(() => this.emitConfigChange()));
      return control;
    });
    this.parameterControls.set(controls);
  }

  private patchForm(config: SolverRunConfig): void {
    this.form.patchValue({
      datasetId: config.datasetId,
      vehicles: { ...config.vehicles },
      algorithm: config.algorithm,
      seed: config.seed,
    });
  }

  private buildConfig(): SolverRunConfig {
    const formValue = this.form.getRawValue();
    const parameters = this.collectParameterValues();
    return {
      datasetId: formValue.datasetId,
      vehicles: formValue.vehicles as VehiclesConfig,
      algorithm: formValue.algorithm,
      parameters,
      seed: formValue.seed,
    };
  }

  private collectParameterValues(): Record<string, number> {
    const selected = this.selectedAlgorithm();
    if (!selected) {
      return {};
    }
    const result: Record<string, number> = {};
    selected.parameters.forEach((parameter, index) => {
      const control = this.parameterControls()[index];
      result[parameter.key] = control?.value ?? parameter.defaultValue;
    });
    return result;
  }

  private emitConfigChange(): void {
    this.configChange.emit(this.buildConfig());
  }
}
