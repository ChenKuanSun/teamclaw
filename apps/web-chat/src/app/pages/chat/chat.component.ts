import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { MarkdownComponent } from 'ngx-markdown';
import {
  CommandAction,
  CommandMenuComponent,
} from '../../components/command-menu/command-menu.component';
import { AuthService } from '../../services/auth.service';
import { SessionService } from '../../services/session.service';
import {
  ChatMessage,
  ChatOption,
  TeamClawWsService,
} from '../../services/teamclaw-ws.service';

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);
  private readonly ws = inject(TeamClawWsService);
  private readonly auth = inject(AuthService);

  messages: ChatMessage[] = [];
  typing = false;
  connected = false;
  inputText = '';
  isComposing = false;

  ngOnInit(): void {
    this.ws.messages$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(msgs => {
        this.messages = msgs;
        setTimeout(() => this.scrollToBottom());
      });
    this.ws.typing$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(t => (this.typing = t));
    this.ws.connected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(c => (this.connected = c));
    this.ws.reconnectFailed$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(failed => {
        if (failed) {
          this.ws.disconnect();
          this.router.navigate(['/session']);
        }
      });

    // Always verify session status before connecting — ensures container is running
    this.sessionService.initSession().subscribe({
      next: res => {
        if (res.status === 'ready' && res.gatewayUrl) {
          const token = this.auth.getIdToken();
          if (token) this.ws.connect(res.gatewayUrl, token);
        } else {
          // Not ready yet — redirect to session init page to show progress
          this.router.navigate(['/session']);
        }
      },
      error: () => {
        this.router.navigate(['/session']);
      },
    });
  }

  onCompositionEnd(): void {
    // Delay to prevent race with keydown.enter firing in the same event loop tick
    setTimeout(() => (this.isComposing = false));
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
        await this.ws.executeCommand('chat.abort', {
          sessionKey: this.ws.getSessionKey(),
        });
        const msgs = this.ws.messages$.value;
        this.ws.messages$.next([
          ...msgs,
          {
            role: 'system' as const,
            content: 'Generation stopped.',
            timestamp: new Date(),
          },
        ]);
      } catch {
        /* ignore */
      }
      return;
    }
    if (cmd.id === 'restart') {
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([
        ...msgs,
        {
          role: 'system' as const,
          content: 'Restarting gateway...',
          timestamp: new Date(),
        },
      ]);
      this.ws.disconnect();
      // Re-check session to get fresh gateway URL
      setTimeout(() => {
        this.sessionService.initSession().subscribe({
          next: res => {
            if (res.status === 'ready' && res.gatewayUrl) {
              const token = this.auth.getIdToken();
              if (token) this.ws.connect(res.gatewayUrl, token);
            } else {
              this.router.navigate(['/session']);
            }
          },
          error: () => this.router.navigate(['/session']),
        });
      }, 2000);
      return;
    }
    // For info commands, show result as system message (with optional interactive options)
    try {
      const result = await this.ws.executeCommand(cmd.method, cmd.params);
      const { content, options } = this.formatCommandResult(cmd, result);
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([
        ...msgs,
        { role: 'system' as const, content, timestamp: new Date(), options },
      ]);
    } catch (err: any) {
      const msgs = this.ws.messages$.value;
      this.ws.messages$.next([
        ...msgs,
        {
          role: 'system' as const,
          content: `Error: ${err.message}`,
          timestamp: new Date(),
        },
      ]);
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
        this.ws.messages$.next([
          ...msgs,
          {
            role: 'system' as const,
            content: `Model changed to ${option.label}`,
            timestamp: new Date(),
          },
        ]);
      } catch (err: any) {
        const msgs = this.ws.messages$.value;
        this.ws.messages$.next([
          ...msgs,
          {
            role: 'system' as const,
            content: `Failed to change model: ${err.message}`,
            timestamp: new Date(),
          },
        ]);
      }
    } else if (option.action === 'switch-session') {
      this.ws.switchSession(option.value);
    }
  }

  private formatCommandResult(
    cmd: CommandAction,
    result: any,
  ): { content: string; options?: ChatOption[] } {
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
      const total = sessions.reduce(
        (sum: number, s: any) => sum + (s.totalTokens || 0),
        0,
      );
      return {
        content: `Token usage: ${total.toLocaleString()} total tokens across ${sessions.length} session(s)`,
      };
    }
    return { content: JSON.stringify(result, null, 2) };
  }

  ngOnDestroy(): void {
    this.ws.disconnect();
  }

  private scrollToBottom(): void {
    try {
      this.messageList.nativeElement.scrollTop =
        this.messageList.nativeElement.scrollHeight;
    } catch {
      /* noop */
    }
  }
}
