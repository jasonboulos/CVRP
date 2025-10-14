import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-run-log-tab',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './run-log-tab.component.html',
  styleUrls: ['./run-log-tab.component.scss'],
})
export class RunLogTabComponent {
  @Input() log: string[] | null | undefined = [];
}
