import { Injectable } from '@angular/core';
import { Customer, DatasetDefinition, Depot, ProblemInstance } from '../models';

export interface StoredDataset {
  definition: DatasetDefinition;
  depot: Depot;
  customers: Customer[];
}

@Injectable({ providedIn: 'root' })
export class DatasetsStoreService {
  private readonly storageKey = 'cvrp-imported-datasets';

  getImportedDatasets(): StoredDataset[] {
    if (!this.canUseStorage()) {
      return [];
    }
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .map((item) => this.normalizeRecord(item))
        .filter((item): item is StoredDataset => item !== null)
        .map((item) => this.cloneRecord(item));
    } catch {
      return [];
    }
  }

  saveDataset(dataset: StoredDataset): void {
    if (!this.canUseStorage()) {
      return;
    }
    const datasets = this.getImportedDatasets().filter((item) => item.definition.id !== dataset.definition.id);
    datasets.push(this.cloneRecord(dataset));
    localStorage.setItem(this.storageKey, JSON.stringify(datasets));
  }

  getDataset(id: string): StoredDataset | undefined {
    return this.getImportedDatasets().find((item) => item.definition.id === id);
  }

  createInstance(id: string): ProblemInstance | null {
    const dataset = this.getDataset(id);
    if (!dataset) {
      return null;
    }
    return {
      id: dataset.definition.id,
      name: dataset.definition.name,
      depot: { ...dataset.depot },
      customers: dataset.customers.map((customer, index) => ({
        id: Math.max(1, Math.round(Number.isFinite(customer.id) ? customer.id : index + 1)),
        x: customer.x,
        y: customer.y,
        demand: customer.demand,
      })),
    };
  }

  private canUseStorage(): boolean {
    return typeof window !== 'undefined' && !!window.localStorage;
  }

  private normalizeRecord(value: unknown): StoredDataset | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const record = value as Partial<StoredDataset> & { [key: string]: unknown };
    const definition = record.definition;
    const depot = record.depot as Depot | undefined;
    const customers = record.customers;
    if (!definition || typeof definition !== 'object') {
      return null;
    }
    const id = this.extractString((definition as DatasetDefinition).id);
    const name = this.extractString((definition as DatasetDefinition).name);
    const description = this.extractString((definition as DatasetDefinition).description);
    const kind = (definition as DatasetDefinition).kind;
    if (!id || !name || !description || (kind !== 'preset' && kind !== 'random')) {
      return null;
    }
    if (!depot || typeof depot !== 'object') {
      return null;
    }
    const depotX = Number((depot as Depot).x);
    const depotY = Number((depot as Depot).y);
    if (!Number.isFinite(depotX) || !Number.isFinite(depotY)) {
      return null;
    }
    if (!Array.isArray(customers) || customers.length === 0) {
      return null;
    }
    const normalizedCustomers: Customer[] = [];
    for (const customer of customers) {
      if (!customer || typeof customer !== 'object') {
        return null;
      }
      const customerX = Number((customer as Customer).x);
      const customerY = Number((customer as Customer).y);
      const demand = Number((customer as Customer).demand);
      const idValue = Number((customer as Customer).id);
      if (!Number.isFinite(customerX) || !Number.isFinite(customerY) || !Number.isFinite(demand)) {
        return null;
      }
      normalizedCustomers.push({
        id: Number.isFinite(idValue) ? Math.max(1, Math.round(idValue)) : normalizedCustomers.length + 1,
        x: customerX,
        y: customerY,
        demand,
      });
    }
    return {
      definition: {
        id,
        name,
        description,
        size: normalizedCustomers.length,
        kind,
      },
      depot: {
        id: 0,
        x: depotX,
        y: depotY,
      },
      customers: normalizedCustomers,
    };
  }

  private cloneRecord(dataset: StoredDataset): StoredDataset {
    return {
      definition: { ...dataset.definition },
      depot: { ...dataset.depot },
      customers: dataset.customers.map((customer) => ({ ...customer })),
    };
  }

  private extractString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
