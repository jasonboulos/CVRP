import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-run-log-tab',
  templateUrl: './run-log-tab.component.html',
  styleUrls: [],
  host: {
    class: 'block'
  },
})
export class RunLogTabComponent {
  @Input() log: string[] | null | undefined = [];
}
