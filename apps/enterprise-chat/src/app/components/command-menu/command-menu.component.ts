import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';

export interface CommandAction {
  id: string;
  method: string;
  params: any;
  label: string;
}

@Component({
  selector: 'tc-command-menu',
  standalone: true,
  imports: [CommonModule, MatMenuModule, MatIconModule, MatButtonModule, MatDividerModule],
  template: `
    <button mat-icon-button [matMenuTriggerFor]="commandMenu" class="menu-trigger">
      <mat-icon>add_circle_outline</mat-icon>
    </button>
    <mat-menu #commandMenu="matMenu" class="command-menu">
      <div class="menu-header">Commands</div>

      <button mat-menu-item (click)="exec('new-session')">
        <mat-icon>add_comment</mat-icon>
        <span>New Session</span>
      </button>

      <button mat-menu-item (click)="exec('list-sessions')">
        <mat-icon>forum</mat-icon>
        <span>Session List</span>
      </button>

      <mat-divider></mat-divider>

      <button mat-menu-item (click)="exec('list-models')">
        <mat-icon>psychology</mat-icon>
        <span>Change Model</span>
      </button>

      <button mat-menu-item (click)="exec('list-agents')">
        <mat-icon>smart_toy</mat-icon>
        <span>Agents</span>
      </button>

      <mat-divider></mat-divider>

      <button mat-menu-item (click)="exec('abort')">
        <mat-icon>stop_circle</mat-icon>
        <span>Stop Response</span>
      </button>

      <button mat-menu-item (click)="exec('usage')">
        <mat-icon>data_usage</mat-icon>
        <span>Token Usage</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    .menu-trigger {
      color: var(--text-muted);
    }
    .menu-header {
      padding: 8px 16px 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
  `],
})
export class CommandMenuComponent {
  @Output() command = new EventEmitter<CommandAction>();

  exec(id: string): void {
    const commands: Record<string, CommandAction> = {
      'new-session': { id: 'new-session', method: 'sessions.reset', params: { reason: 'new' }, label: 'New Session' },
      'list-sessions': { id: 'list-sessions', method: 'sessions.list', params: {}, label: 'Sessions' },
      'list-models': { id: 'list-models', method: 'models.list', params: {}, label: 'Models' },
      'list-agents': { id: 'list-agents', method: 'agents.list', params: {}, label: 'Agents' },
      'abort': { id: 'abort', method: 'chat.abort', params: {}, label: 'Stop' },
      'usage': { id: 'usage', method: 'sessions.list', params: {}, label: 'Usage' },
    };
    const cmd = commands[id];
    if (cmd) this.command.emit(cmd);
  }
}
