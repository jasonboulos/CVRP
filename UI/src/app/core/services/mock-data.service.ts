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
  {
        id: 'A-n32-k5',
        name: 'A-n32-k5 (CVRPLIB)',
        description: 'CVRPLIB instance: n=31, k=5, Q=100',
        size: 31,
        kind: 'preset',
      },
     {
          id: 'A-n55-k9',
          name: 'A-n55-k9 (CVRPLIB)',
          description: 'CVRPLIB instance: n=54, k=9, Q=100',
          size: 54,
          kind: 'preset',
        },

        {
          id: 'A-n80-k10',
          name: 'A-n80-k10 (CVRPLIB)',
          description: 'CVRPLIB instance: n=79, k=10, Q=100',
          size: 79,
          kind: 'preset',
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
  'A-n32-k5': {
        name: 'A-n32-k5 (CVRPLIB)',
        depot: { id: 0, x: 82, y: 76 },
        customers: [
          { id: 1,  x: 96, y: 44, demand: 19 },
          { id: 2,  x: 50, y: 5,  demand: 21 },
          { id: 3,  x: 49, y: 8,  demand: 6  },
          { id: 4,  x: 13, y: 7,  demand: 19 },
          { id: 5,  x: 29, y: 89, demand: 7  },
          { id: 6,  x: 58, y: 30, demand: 12 },
          { id: 7,  x: 84, y: 39, demand: 16 },
          { id: 8,  x: 14, y: 24, demand: 6  },
          { id: 9,  x: 2,  y: 39, demand: 16 },
          { id: 10, x: 3,  y: 82, demand: 8  },
          { id: 11, x: 5,  y: 10, demand: 14 },
          { id: 12, x: 98, y: 52, demand: 21 },
          { id: 13, x: 84, y: 25, demand: 16 },
          { id: 14, x: 61, y: 59, demand: 3  },
          { id: 15, x: 1,  y: 65, demand: 22 },
          { id: 16, x: 88, y: 51, demand: 18 },
          { id: 17, x: 91, y: 2,  demand: 19 },
          { id: 18, x: 19, y: 32, demand: 1  },
          { id: 19, x: 93, y: 3,  demand: 24 },
          { id: 20, x: 50, y: 93, demand: 8  },
          { id: 21, x: 98, y: 14, demand: 12 },
          { id: 22, x: 5,  y: 42, demand: 4  },
          { id: 23, x: 42, y: 9,  demand: 8  },
          { id: 24, x: 61, y: 62, demand: 24 },
          { id: 25, x: 9,  y: 97, demand: 24 },
          { id: 26, x: 80, y: 55, demand: 2  },
          { id: 27, x: 57, y: 69, demand: 20 },
          { id: 28, x: 23, y: 15, demand: 15 },
          { id: 29, x: 20, y: 70, demand: 2  },
          { id: 30, x: 85, y: 60, demand: 14 },
          { id: 31, x: 98, y: 5,  demand: 9  },
        ],
      },
    'A-n55-k9': {
          name: 'A-n55-k9 (CVRPLIB)',
          depot: { id: 0, x: 36, y: 64 },
          customers: [
            { id: 1,  x: 94, y: 47, demand: 3  },
            { id: 2,  x: 10, y: 23, demand: 12 },
            { id: 3,  x: 16, y: 46, demand: 25 },
            { id: 4,  x: 25, y: 79, demand: 4  },
            { id: 5,  x: 41, y: 30, demand: 11 },
            { id: 6,  x: 81, y: 45, demand: 20 },
            { id: 7,  x: 14, y: 79, demand: 21 },
            { id: 8,  x: 42, y: 56, demand: 10 },
            { id: 9,  x: 90, y: 17, demand: 20 },
            { id: 10, x: 41, y: 39, demand: 13 },
            { id: 11, x: 21, y: 14, demand: 14 },
            { id: 12, x: 41, y: 46, demand: 16 },
            { id: 13, x: 65, y: 96, demand: 17 },
            { id: 14, x: 13, y: 49, demand: 11 },
            { id: 15, x: 21, y: 14, demand: 36 },
            { id: 16, x: 57, y: 2,  demand: 6  },
            { id: 17, x: 14, y: 42, demand: 7  },
            { id: 18, x: 66, y: 62, demand: 21 },
            { id: 19, x: 58, y: 96, demand: 11 },
            { id: 20, x: 5,  y: 51, demand: 17 },
            { id: 21, x: 41, y: 50, demand: 22 },
            { id: 22, x: 50, y: 99, demand: 10 },
            { id: 23, x: 84, y: 85, demand: 19 },
            { id: 24, x: 97, y: 90, demand: 21 },
            { id: 25, x: 47, y: 76, demand: 23 },
            { id: 26, x: 11, y: 54, demand: 19 },
            { id: 27, x: 60, y: 97, demand: 15 },
            { id: 28, x: 60, y: 89, demand: 22 },
            { id: 29, x: 58, y: 68, demand: 7  },
            { id: 30, x: 30, y: 93, demand: 11 },
            { id: 31, x: 9,  y: 60, demand: 15 },
            { id: 32, x: 47, y: 44, demand: 22 },
            { id: 33, x: 19, y: 40, demand: 12 },
            { id: 34, x: 15, y: 40, demand: 24 },
            { id: 35, x: 88, y: 21, demand: 25 },
            { id: 36, x: 33, y: 58, demand: 2  },
            { id: 37, x: 21, y: 51, demand: 15 },
            { id: 38, x: 57, y: 7,  demand: 18 },
            { id: 39, x: 81, y: 6,  demand: 13 },
            { id: 40, x: 49, y: 6,  demand: 3  },
            { id: 41, x: 51, y: 78, demand: 20 },
            { id: 42, x: 9,  y: 62, demand: 14 },
            { id: 43, x: 84, y: 36, demand: 10 },
            { id: 44, x: 95, y: 76, demand: 10 },
            { id: 45, x: 89, y: 44, demand: 66 },
            { id: 46, x: 10, y: 49, demand: 10 },
            { id: 47, x: 69, y: 16, demand: 7  },
            { id: 48, x: 75, y: 66, demand: 12 },
            { id: 49, x: 97, y: 11, demand: 24 },
            { id: 50, x: 74, y: 69, demand: 5  },
            { id: 51, x: 1,  y: 14, demand: 18 },
            { id: 52, x: 96, y: 91, demand: 7  },
            { id: 53, x: 46, y: 22, demand: 11 },
            { id: 54, x: 74, y: 92, demand: 12 },
          ],
        },
      'A-n80-k10': {
            name: 'A-n80-k10 (CVRPLIB)',
            depot: { id: 0, x: 92, y: 92 },
            customers: [
              { id: 1,  x: 88, y: 58, demand: 24 },
              { id: 2,  x: 70, y: 6,  demand: 22 },
              { id: 3,  x: 57, y: 59, demand: 23 },
              { id: 4,  x: 0,  y: 98, demand: 5  },
              { id: 5,  x: 61, y: 38, demand: 11 },
              { id: 6,  x: 65, y: 22, demand: 23 },
              { id: 7,  x: 91, y: 52, demand: 26 },
              { id: 8,  x: 59, y: 2,  demand: 9  },
              { id: 9,  x: 3,  y: 54, demand: 23 },
              { id: 10, x: 95, y: 38, demand: 9  },
              { id: 11, x: 80, y: 28, demand: 14 },
              { id: 12, x: 66, y: 42, demand: 16 },
              { id: 13, x: 79, y: 74, demand: 12 },
              { id: 14, x: 99, y: 25, demand: 2  },
              { id: 15, x: 20, y: 43, demand: 2  },
              { id: 16, x: 40, y: 3,  demand: 6  },
              { id: 17, x: 50, y: 42, demand: 20 },
              { id: 18, x: 97, y: 0,  demand: 26 },
              { id: 19, x: 21, y: 19, demand: 12 },
              { id: 20, x: 36, y: 21, demand: 15 },
              { id: 21, x: 100,y: 61, demand: 13 },
              { id: 22, x: 11, y: 85, demand: 26 },
              { id: 23, x: 69, y: 35, demand: 17 },
              { id: 24, x: 69, y: 22, demand: 7  },
              { id: 25, x: 29, y: 35, demand: 12 },
              { id: 26, x: 14, y: 9,  demand: 4  },
              { id: 27, x: 50, y: 33, demand: 4  },
              { id: 28, x: 89, y: 17, demand: 20 },
              { id: 29, x: 57, y: 44, demand: 10 },
              { id: 30, x: 60, y: 25, demand: 9  },
              { id: 31, x: 48, y: 42, demand: 2  },
              { id: 32, x: 17, y: 93, demand: 9  },
              { id: 33, x: 21, y: 50, demand: 1  },
              { id: 34, x: 77, y: 18, demand: 2  },
              { id: 35, x: 2,  y: 4,  demand: 2  },
              { id: 36, x: 63, y: 83, demand: 12 },
              { id: 37, x: 68, y: 6,  demand: 14 },
              { id: 38, x: 41, y: 95, demand: 23 },
              { id: 39, x: 48, y: 54, demand: 21 },
              { id: 40, x: 98, y: 73, demand: 13 },
              { id: 41, x: 26, y: 38, demand: 13 },
              { id: 42, x: 69, y: 76, demand: 23 },
              { id: 43, x: 40, y: 1,  demand: 3  },
              { id: 44, x: 65, y: 41, demand: 6  },
              { id: 45, x: 14, y: 86, demand: 23 },
              { id: 46, x: 32, y: 39, demand: 11 },
              { id: 47, x: 14, y: 24, demand: 2  },
              { id: 48, x: 96, y: 5,  demand: 7  },
              { id: 49, x: 82, y: 98, demand: 13 },
              { id: 50, x: 23, y: 85, demand: 10 },
              { id: 51, x: 63, y: 69, demand: 3  },
              { id: 52, x: 87, y: 19, demand: 6  },
              { id: 53, x: 56, y: 75, demand: 13 },
              { id: 54, x: 15, y: 63, demand: 2  },
              { id: 55, x: 10, y: 45, demand: 14 },
              { id: 56, x: 7,  y: 30, demand: 7  },
              { id: 57, x: 31, y: 11, demand: 21 },
              { id: 58, x: 36, y: 93, demand: 7  },
              { id: 59, x: 50, y: 31, demand: 22 },
              { id: 60, x: 49, y: 52, demand: 13 },
              { id: 61, x: 39, y: 10, demand: 22 },
              { id: 62, x: 76, y: 40, demand: 18 },
              { id: 63, x: 83, y: 34, demand: 22 },
              { id: 64, x: 33, y: 51, demand: 6  },
              { id: 65, x: 0,  y: 15, demand: 2  },
              { id: 66, x: 52, y: 82, demand: 11 },
              { id: 67, x: 52, y: 82, demand: 5  },
              { id: 68, x: 46, y: 6,  demand: 9  },
              { id: 69, x: 3,  y: 26, demand: 9  },
              { id: 70, x: 46, y: 80, demand: 5  },
              { id: 71, x: 94, y: 30, demand: 12 },
              { id: 72, x: 26, y: 76, demand: 2  },
              { id: 73, x: 75, y: 92, demand: 12 },
              { id: 74, x: 57, y: 51, demand: 19 },
              { id: 75, x: 34, y: 21, demand: 6  },
              { id: 76, x: 28, y: 80, demand: 14 },
              { id: 77, x: 59, y: 66, demand: 2  },
              { id: 78, x: 51, y: 16, demand: 2  },
              { id: 79, x: 87, y: 11, demand: 24 },
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
