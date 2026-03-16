import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TeamClawWsService, ChatMessage } from '../../services/teamclaw-ws.service';
import { CommandMenuComponent, CommandAction } from '../../components/command-menu/command-menu.component';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'tc-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TextFieldModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
    CommandMenuComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageList!: ElementRef;
  private readonly route = inject(ActivatedRoute);
  messages: ChatMessage[] = [];
  typing = false;
  connected = false;
  inputText = '';
  isComposing = false;
  private subs: Subscription[] = [];

  constructor(
    private readonly ws: TeamClawWsService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    const token = this.auth.getIdToken();
    // Gateway URL: prefer query param from session, fallback to environment
    const gatewayUrl = this.route.snapshot.queryParamMap.get('gw') || environment.teamclawGatewayUrl;
    if (token && gatewayUrl) {
      this.ws.connect(gatewayUrl, token);
    }
    this.subs.push(
      this.ws.messages$.subscribe(msgs => this.messages = msgs),
      this.ws.typing$.subscribe(t => this.typing = t),
      this.ws.connected$.subscribe(c => this.connected = c),
    );
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  onEnter(event: Event): void {
    if (this.isComposing) return; // Don't submit during IME composition
    const ke = event as KeyboardEvent;
    if (ke.shiftKey) return; // allow Shift+Enter for newline
    event.preventDefault();
    this.send();
  }

  send(): void {
    if (!this.inputText.trim()) return;
    this.ws.sendMessage(this.inputText);
    this.inputText = '';
  }

  async onCommand(cmd: CommandAction): Promise<void> {
    if (cmd.id === 'new-session') {
      this.ws.resetSession();
      return;
    }
    if (cmd.id === 'abort') {
      try {
        await this.ws.executeCommand('chat.abort', { sessionKey: (this.ws as any).sessionKey });
      } catch { /* ignore */ }
      return;
    }
    // For info commands, show result as system message
    try {
      const result = await this.ws.executeCommand(cmd.method, cmd.params);
      const content = this.formatCommandResult(cmd, result);
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([...msgs, { role: 'system' as const, content, timestamp: new Date() }]);
    } catch (err: any) {
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([...msgs, { role: 'system' as const, content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
  }

  private formatCommandResult(cmd: CommandAction, result: any): string {
    if (cmd.id === 'list-models') {
      const models = result?.models || result?.entries || [];
      if (Array.isArray(models) && models.length > 0) {
        return 'Available models:\n' + models.map((m: any) => `\u2022 ${m.displayName || m.id || m.name}`).join('\n');
      }
      return 'No models available';
    }
    if (cmd.id === 'list-sessions') {
      const sessions = result?.sessions || [];
      if (Array.isArray(sessions) && sessions.length > 0) {
        return 'Sessions:\n' + sessions.map((s: any) =>
          `\u2022 ${s.key} (${s.model || 'default'}) - ${s.inputTokens || 0} in / ${s.outputTokens || 0} out`
        ).join('\n');
      }
      return 'No sessions found';
    }
    if (cmd.id === 'list-agents') {
      const agents = result?.agents || [];
      if (Array.isArray(agents) && agents.length > 0) {
        return 'Agents:\n' + agents.map((a: any) => `\u2022 ${a.name || a.agentId}`).join('\n');
      }
      return 'No agents found';
    }
    if (cmd.id === 'usage') {
      const sessions = result?.sessions || [];
      const total = sessions.reduce((sum: number, s: any) => sum + (s.totalTokens || 0), 0);
      return `Token usage: ${total.toLocaleString()} total tokens across ${sessions.length} session(s)`;
    }
    return JSON.stringify(result, null, 2);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.ws.disconnect();
  }

  private scrollToBottom(): void {
    try {
      this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight;
    } catch {
      /* noop */
    }
  }
}
