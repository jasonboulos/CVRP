import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-run-log-tab',
  templateUrl: './run-log-tab.component.html',
  styleUrls: ['./run-log-tab.component.scss'],
})
export class RunLogTabComponent {
  @Input() log: string[] | null | undefined = [];
}
