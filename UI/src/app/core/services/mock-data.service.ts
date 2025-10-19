import { Injectable } from '@angular/core';
import { Customer, DatasetDefinition, Depot, ProblemInstance } from '../models';
import { DatasetsStoreService } from './datasets-store.service';
import { createSeededRng, SeededRng } from '../utils/random';

interface PresetData {
  depot: Depot;
  customers: Customer[];
  name: string;
}

@Injectable({ providedIn: 'root' })
export class MockDataService {
  constructor(private readonly datasetsStore: DatasetsStoreService) {}

  private readonly datasetDefinitions: DatasetDefinition[] = [
    {
      id: 'city-grid',
      name: 'City Grid (15 customers)',
      description: 'Customers distributed evenly around a central depot.',
      size: 15,
      kind: 'preset',
    },
    {
      id: 'clustered',
      name: 'Clustered Demand (18 customers)',
      description: 'Tight customer clusters to showcase routing trade-offs.',
      size: 18,
      kind: 'preset',
    },
    {
      id: 'random',
      name: 'Random Instance',
      description: 'Procedurally generated customers between 10 and 30.',
      size: 0,
      kind: 'random',
    },
  ];

  private readonly presetData: Record<string, PresetData> = {
    'city-grid': {
      name: 'City Grid',
      depot: { id: 0, x: 50, y: 50 },
      customers: [
        { id: 1, x: 20, y: 20, demand: 12 },
        { id: 2, x: 40, y: 20, demand: 7 },
        { id: 3, x: 60, y: 20, demand: 6 },
        { id: 4, x: 80, y: 20, demand: 8 },
        { id: 5, x: 20, y: 40, demand: 10 },
        { id: 6, x: 40, y: 40, demand: 9 },
        { id: 7, x: 60, y: 40, demand: 11 },
        { id: 8, x: 80, y: 40, demand: 5 },
        { id: 9, x: 20, y: 60, demand: 14 },
        { id: 10, x: 40, y: 60, demand: 13 },
        { id: 11, x: 60, y: 60, demand: 9 },
        { id: 12, x: 80, y: 60, demand: 12 },
        { id: 13, x: 20, y: 80, demand: 7 },
        { id: 14, x: 40, y: 80, demand: 6 },
        { id: 15, x: 60, y: 80, demand: 8 },
      ],
    },
    clustered: {
      name: 'Clustered Demand',
      depot: { id: 0, x: 50, y: 50 },
      customers: [
        { id: 1, x: 30, y: 30, demand: 6 },
        { id: 2, x: 31, y: 33, demand: 7 },
        { id: 3, x: 35, y: 28, demand: 8 },
        { id: 4, x: 70, y: 25, demand: 10 },
        { id: 5, x: 74, y: 22, demand: 9 },
        { id: 6, x: 77, y: 27, demand: 12 },
        { id: 7, x: 25, y: 75, demand: 11 },
        { id: 8, x: 28, y: 78, demand: 7 },
        { id: 9, x: 32, y: 72, demand: 13 },
        { id: 10, x: 65, y: 68, demand: 9 },
        { id: 11, x: 68, y: 72, demand: 10 },
        { id: 12, x: 72, y: 65, demand: 5 },
        { id: 13, x: 54, y: 82, demand: 8 },
        { id: 14, x: 58, y: 85, demand: 9 },
        { id: 15, x: 62, y: 88, demand: 6 },
        { id: 16, x: 85, y: 55, demand: 7 },
        { id: 17, x: 88, y: 58, demand: 8 },
        { id: 18, x: 90, y: 53, demand: 10 },
      ],
    },
  };

  getDatasets(): DatasetDefinition[] {
    const imported = this.datasetsStore.getImportedDatasets().map((dataset) => dataset.definition);
    const combined = [...this.datasetDefinitions];
    imported.forEach((definition) => {
      const index = combined.findIndex((item) => item.id === definition.id);
      if (index >= 0) {
        combined[index] = definition;
      } else {
        combined.push(definition);
      }
    });
    return combined;
  }

  createInstance(datasetId: string, seed: string): ProblemInstance {
    if (datasetId === 'random') {
      const rng = createSeededRng(`${datasetId}-${seed}`);
      const count = 10 + rng.nextInt(21);
      return {
        id: `${datasetId}-${seed}-${count}`,
        name: `Random ${count} customers`,
        depot: { id: 0, x: 50, y: 50 },
        customers: this.generateRandomCustomers(rng, count),
      };
    }

    const importedInstance = this.datasetsStore.createInstance(datasetId);
    if (importedInstance) {
      return importedInstance;
    }

    if (datasetId !== 'random') {
      const preset = this.presetData[datasetId];
      if (!preset) {
        throw new Error(`Unknown dataset id: ${datasetId}`);
      }
      return {
        id: datasetId,
        name: preset.name,
        depot: { ...preset.depot },
        customers: preset.customers.map((customer) => ({ ...customer })),
      };
    }
    throw new Error(`Unknown dataset id: ${datasetId}`);
  }

  private generateRandomCustomers(rng: SeededRng, count: number): Customer[] {
    const customers: Customer[] = [];
    for (let i = 1; i <= count; i += 1) {
      customers.push({
        id: i,
        x: Number(rng.nextRange(8, 92).toFixed(2)),
        y: Number(rng.nextRange(8, 92).toFixed(2)),
        demand: Math.max(4, Math.round(rng.nextRange(4, 18))),
      });
    }
    return customers;
  }
}
