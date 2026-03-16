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
    <mat-menu #commandMenu="matMenu" yPosition="above">
      <button mat-menu-item (click)="exec('new-session')">
        <mat-icon>add_comment</mat-icon>
        <span>New Conversation</span>
      </button>

      <button mat-menu-item (click)="exec('list-sessions')">
        <mat-icon>forum</mat-icon>
        <span>Conversations</span>
      </button>

      <mat-divider></mat-divider>

      <button mat-menu-item (click)="exec('abort')">
        <mat-icon>stop_circle</mat-icon>
        <span>Stop Generating</span>
      </button>

      <button mat-menu-item (click)="exec('restart')">
        <mat-icon>restart_alt</mat-icon>
        <span>Restart Gateway</span>
      </button>

      <mat-divider></mat-divider>

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
  `],
})
export class CommandMenuComponent {
  @Output() command = new EventEmitter<CommandAction>();

  exec(id: string): void {
    const commands: Record<string, CommandAction> = {
      'new-session': { id: 'new-session', method: 'sessions.reset', params: { reason: 'new' }, label: 'New Conversation' },
      'list-sessions': { id: 'list-sessions', method: 'sessions.list', params: {}, label: 'Conversations' },
      'abort': { id: 'abort', method: 'chat.abort', params: {}, label: 'Stop Generating' },
      'restart': { id: 'restart', method: 'system-event', params: { event: 'restart' }, label: 'Restart Gateway' },
      'usage': { id: 'usage', method: 'sessions.list', params: {}, label: 'Usage' },
    };
    const cmd = commands[id];
    if (cmd) this.command.emit(cmd);
  }
}
