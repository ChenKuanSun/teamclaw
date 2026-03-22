import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

export interface CommandAction {
  id: string;
  method: string;
  params: any;
  label: string;
}

@Component({
  selector: 'tc-command-menu',
  standalone: true,
  imports: [
    CommonModule,
    MatMenuModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
  ],
  templateUrl: './command-menu.component.html',
  styleUrl: './command-menu.component.scss',
})
export class CommandMenuComponent {
  @Output() command = new EventEmitter<CommandAction>();

  exec(id: string): void {
    const commands: Record<string, CommandAction> = {
      'new-session': {
        id: 'new-session',
        method: 'sessions.reset',
        params: { reason: 'new' },
        label: 'New Conversation',
      },
      'list-sessions': {
        id: 'list-sessions',
        method: 'sessions.list',
        params: {},
        label: 'Conversations',
      },
      abort: {
        id: 'abort',
        method: 'chat.abort',
        params: {},
        label: 'Stop Generating',
      },
      restart: {
        id: 'restart',
        method: 'system-event',
        params: { event: 'restart' },
        label: 'Restart Gateway',
      },
    };
    const cmd = commands[id];
    if (cmd) this.command.emit(cmd);
  }
}
