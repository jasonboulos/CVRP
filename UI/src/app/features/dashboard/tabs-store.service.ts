import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ResultTabData, RunAlgorithmInfo } from '../../core/models';

export interface MapTabState {
  readonly id: 'map';
  readonly title: string;
  readonly lastRun: ResultTabData | null;
}

export interface TabsState {
  readonly activeTabId: string;
  readonly map: MapTabState;
  readonly resultTabs: ResultTabData[];
}

interface CreateResultTabPayload {
  summary: ResultTabData['summary'];
  vehicles: ResultTabData['vehicles'];
  customers: ResultTabData['customers'];
  geometry: ResultTabData['geometry'];
  rawRequest: ResultTabData['rawRequest'];
  rawResponse: ResultTabData['rawResponse'];
  algorithm: RunAlgorithmInfo;
  title?: string;
  id?: string;
  createdAt?: number;
  runNumber?: number;
}

@Injectable({ providedIn: 'root' })
export class TabsStoreService {
  private readonly initialState: TabsState = {
    activeTabId: 'map',
    map: {
      id: 'map',
      title: 'Map',
      lastRun: null,
    },
    resultTabs: [],
  };

  private readonly stateSubject = new BehaviorSubject<TabsState>(this.initialState);

  private runCounter = 0;

  readonly state$ = this.stateSubject.asObservable();

  get snapshot(): TabsState {
    return this.stateSubject.value;
  }

  registerResult(payload: CreateResultTabPayload): ResultTabData {
    const createdAt = payload.createdAt ?? Date.now();
    const runNumber = payload.runNumber ?? this.runCounter + 1;
    const id = payload.id ?? `result-${createdAt}-${runNumber}`;
    const title =
      payload.title ?? this.buildResultTitle(runNumber, payload.algorithm.code, payload.summary.totalDistance);
    this.runCounter = Math.max(this.runCounter, runNumber);

    const result: ResultTabData = {
      id,
      title,
      runNumber,
      createdAt,
      algorithm: payload.algorithm,
      summary: payload.summary,
      vehicles: payload.vehicles,
      customers: payload.customers,
      geometry: payload.geometry,
      rawRequest: payload.rawRequest,
      rawResponse: payload.rawResponse,
    };

    const state = this.snapshot;
    const nextState: TabsState = {
      activeTabId: 'map',
      map: {
        ...state.map,
        lastRun: result,
      },
      resultTabs: [...state.resultTabs, result],
    };

    this.stateSubject.next(nextState);
    return result;
  }

  activateTab(tabId: string): void {
    const state = this.snapshot;
    if (tabId === state.activeTabId) {
      return;
    }
    if (tabId !== 'map' && !state.resultTabs.some((tab) => tab.id === tabId)) {
      return;
    }
    this.stateSubject.next({ ...state, activeTabId: tabId });
  }

  closeTab(tabId: string): void {
    if (tabId === 'map') {
      return;
    }
    const state = this.snapshot;
    const remaining = state.resultTabs.filter((tab) => tab.id !== tabId);
    if (remaining.length === state.resultTabs.length) {
      return;
    }
    const nextActive =
      state.activeTabId === tabId
        ? remaining.length > 0
          ? remaining[remaining.length - 1]!.id
          : 'map'
        : state.activeTabId;
    this.stateSubject.next({
      activeTabId: nextActive,
      map: state.map,
      resultTabs: remaining,
    });
  }

  openResult(resultId: string): void {
    const state = this.snapshot;
    const existing = state.resultTabs.find((tab) => tab.id === resultId);
    if (existing) {
      this.activateTab(existing.id);
      return;
    }
    if (state.map.lastRun && state.map.lastRun.id === resultId) {
      const restored = state.map.lastRun;
      this.stateSubject.next({
        activeTabId: restored.id,
        map: { ...state.map, lastRun: restored },
        resultTabs: [...state.resultTabs, restored],
      });
    }
  }

  openLastResult(): void {
    const state = this.snapshot;
    if (state.map.lastRun) {
      this.openResult(state.map.lastRun.id);
    }
  }

  reset(): void {
    this.runCounter = 0;
    this.stateSubject.next(this.initialState);
  }

  getOrderedTabIds(): string[] {
    const state = this.snapshot;
    return ['map', ...state.resultTabs.map((tab) => tab.id)];
}

  private buildResultTitle(runNumber: number, algorithmCode: string, distance: number): string {
    const base = `Result #${runNumber} — ${algorithmCode}`;
    if (Number.isFinite(distance)) {
      const rounded = Math.round(distance);
      return `${base} · ${rounded} km`;
    }
    return base;
  }
}
