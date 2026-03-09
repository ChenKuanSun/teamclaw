import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TeamClawWsService, ChatMessage } from '../../services/teamclaw-ws.service';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'tc-chat',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <div class="chat-container">
      <div class="chat-header">
        <h2>TeamClaw</h2>
        <span class="status" [class.connected]="connected">{{ connected ? 'Connected' : 'Disconnected' }}</span>
      </div>

      <div class="chat-messages" #messageList>
        @for (msg of messages; track msg.timestamp) {
          <div class="message" [class.user]="msg.role === 'user'" [class.assistant]="msg.role === 'assistant'">
            <div class="message-sender">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
            <div class="message-content">{{ msg.content }}</div>
            <div class="message-time">{{ msg.timestamp | date:'short' }}</div>
          </div>
        }
        @if (typing) {
          <div class="message assistant">
            <div class="message-sender">AI</div>
            <div class="message-content typing">...</div>
          </div>
        }
      </div>

      <div class="chat-input">
        <mat-form-field appearance="outline" class="input-field">
          <input matInput placeholder="Type a message..." [(ngModel)]="inputText" (keyup.enter)="send()" />
        </mat-form-field>
        <button mat-fab color="primary" (click)="send()" [disabled]="!inputText.trim()">
          <mat-icon>send</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .chat-container { display: flex; flex-direction: column; height: 100vh; background: #fafafa; }
    .chat-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: #1a237e; color: white; }
    .chat-header h2 { margin: 0; }
    .status { font-size: 12px; padding: 4px 8px; border-radius: 12px; background: #ef5350; }
    .status.connected { background: #66bb6a; }
    .chat-messages { flex: 1; overflow-y: auto; padding: 16px 24px; }
    .message { margin-bottom: 16px; max-width: 70%; }
    .message.user { margin-left: auto; text-align: right; }
    .message.assistant { margin-right: auto; }
    .message-sender { font-size: 12px; color: #666; margin-bottom: 4px; }
    .message-content { padding: 12px 16px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
    .message.user .message-content { background: #1a237e; color: white; border-bottom-right-radius: 4px; }
    .message.assistant .message-content { background: white; border: 1px solid #e0e0e0; border-bottom-left-radius: 4px; }
    .message-time { font-size: 10px; color: #999; margin-top: 4px; }
    .typing { opacity: 0.6; animation: blink 1s infinite; }
    @keyframes blink { 50% { opacity: 0.3; } }
    .chat-input { display: flex; align-items: center; padding: 8px 24px 16px; gap: 8px; }
    .input-field { flex: 1; }
  `],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageList!: ElementRef;
  messages: ChatMessage[] = [];
  typing = false;
  connected = false;
  inputText = '';
  private subs: Subscription[] = [];

  constructor(private ws: TeamClawWsService, private auth: AuthService) {}

  ngOnInit(): void {
    const token = this.auth.getIdToken();
    if (token) {
      this.ws.connect(environment.teamclawGatewayUrl, token);
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

  send(): void {
    if (!this.inputText.trim()) return;
    this.ws.sendMessage(this.inputText);
    this.inputText = '';
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.ws.disconnect();
  }

  private scrollToBottom(): void {
    try { this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight; } catch { /* noop */ }
  }
}
