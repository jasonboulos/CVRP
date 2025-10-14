import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ControlsPanelComponent } from './features/controls-panel/controls-panel.component';
import { MapViewComponent } from './features/map-view/map-view.component';
import { MetricsCardsComponent } from './features/metrics-cards/metrics-cards.component';
import { RoutesTabComponent } from './features/routes-tab/routes-tab.component';
import { CompareTabComponent } from './features/compare-tab/compare-tab.component';
import { RunLogTabComponent } from './features/run-log-tab/run-log-tab.component';

@NgModule({
  declarations: [
    AppComponent,
    DashboardComponent,
    ControlsPanelComponent,
    MapViewComponent,
    MetricsCardsComponent,
    RoutesTabComponent,
    CompareTabComponent,
    RunLogTabComponent,
  ],
  imports: [
    BrowserModule,
    ReactiveFormsModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
