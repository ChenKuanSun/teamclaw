import { Component, OnInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { MarkdownComponent } from 'ngx-markdown';
import { TeamClawWsService, ChatMessage, ChatOption } from '../../services/teamclaw-ws.service';
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
    MarkdownComponent,
    CommandMenuComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy {
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
      this.ws.messages$.subscribe(msgs => {
        this.messages = msgs;
        setTimeout(() => this.scrollToBottom());
      }),
      this.ws.typing$.subscribe(t => this.typing = t),
      this.ws.connected$.subscribe(c => this.connected = c),
    );
  }

  onCompositionEnd(): void {
    // Delay to prevent race with keydown.enter firing in the same event loop tick
    setTimeout(() => this.isComposing = false);
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
        await this.ws.executeCommand('chat.abort', { sessionKey: this.ws.getSessionKey() });
        const msgs = this.ws.messages$.value;
        this.ws.messages$.next([...msgs, { role: 'system' as const, content: 'Generation stopped.', timestamp: new Date() }]);
      } catch { /* ignore */ }
      return;
    }
    if (cmd.id === 'restart') {
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([...msgs, { role: 'system' as const, content: 'Restarting gateway...', timestamp: new Date() }]);
      this.ws.disconnect();
      setTimeout(() => {
        const token = this.auth.getIdToken();
        const gatewayUrl = this.route.snapshot.queryParamMap.get('gw') || environment.teamclawGatewayUrl;
        if (token && gatewayUrl) this.ws.connect(gatewayUrl, token);
      }, 2000);
      return;
    }
    // For info commands, show result as system message (with optional interactive options)
    try {
      const result = await this.ws.executeCommand(cmd.method, cmd.params);
      const { content, options } = this.formatCommandResult(cmd, result);
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([...msgs, { role: 'system' as const, content, timestamp: new Date(), options }]);
    } catch (err: any) {
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([...msgs, { role: 'system' as const, content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
  }

  async onOptionClick(option: ChatOption): Promise<void> {
    if (option.action === 'set-model') {
      try {
        await this.ws.executeCommand('sessions.patch', {
          key: this.ws.getSessionKey(),
          model: option.value,
        });
        const msgs = this.ws.messages$.value;
        this.ws.messages$.next([...msgs, {
          role: 'system' as const,
          content: `Model changed to ${option.label}`,
          timestamp: new Date(),
        }]);
      } catch (err: any) {
        const msgs = this.ws.messages$.value;
        this.ws.messages$.next([...msgs, {
          role: 'system' as const,
          content: `Failed to change model: ${err.message}`,
          timestamp: new Date(),
        }]);
      }
    } else if (option.action === 'switch-session') {
      this.ws.switchSession(option.value);
    }
  }

  private formatCommandResult(cmd: CommandAction, result: any): { content: string; options?: ChatOption[] } {
    if (cmd.id === 'list-sessions') {
      const sessions = result?.sessions || [];
      if (Array.isArray(sessions) && sessions.length > 0) {
        const options: ChatOption[] = sessions.map((s: any) => ({
          label: `${s.key} (${s.model || 'default'})`,
          value: s.key,
          icon: 'forum',
          action: 'switch-session',
        }));
        return { content: 'Switch to a session:', options };
      }
      return { content: 'No sessions found' };
    }
    if (cmd.id === 'usage') {
      const sessions = result?.sessions || [];
      const total = sessions.reduce((sum: number, s: any) => sum + (s.totalTokens || 0), 0);
      return { content: `Token usage: ${total.toLocaleString()} total tokens across ${sessions.length} session(s)` };
    }
    return { content: JSON.stringify(result, null, 2) };
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
