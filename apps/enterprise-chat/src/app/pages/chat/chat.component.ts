import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TeamClawWsService, ChatMessage } from '../../services/teamclaw-ws.service';
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
