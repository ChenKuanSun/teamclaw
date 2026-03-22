import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CommandAction, CommandMenuComponent } from './command-menu.component';

describe('CommandMenuComponent', () => {
  let component: CommandMenuComponent;
  let fixture: ComponentFixture<CommandMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommandMenuComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CommandMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('exec()', () => {
    it('should emit new-session command', () => {
      let emitted: CommandAction | undefined;
      component.command.subscribe(cmd => (emitted = cmd));

      component.exec('new-session');

      expect(emitted).toEqual({
        id: 'new-session',
        method: 'sessions.reset',
        params: { reason: 'new' },
        label: 'New Conversation',
      });
    });

    it('should emit list-sessions command', () => {
      let emitted: CommandAction | undefined;
      component.command.subscribe(cmd => (emitted = cmd));

      component.exec('list-sessions');

      expect(emitted).toEqual({
        id: 'list-sessions',
        method: 'sessions.list',
        params: {},
        label: 'Conversations',
      });
    });

    it('should emit abort command', () => {
      let emitted: CommandAction | undefined;
      component.command.subscribe(cmd => (emitted = cmd));

      component.exec('abort');

      expect(emitted).toEqual({
        id: 'abort',
        method: 'chat.abort',
        params: {},
        label: 'Stop Generating',
      });
    });

    it('should emit restart command', () => {
      let emitted: CommandAction | undefined;
      component.command.subscribe(cmd => (emitted = cmd));

      component.exec('restart');

      expect(emitted).toEqual({
        id: 'restart',
        method: 'system-event',
        params: { event: 'restart' },
        label: 'Restart Gateway',
      });
    });

    it('should not emit for unknown command id', () => {
      let emitted = false;
      component.command.subscribe(() => (emitted = true));

      component.exec('unknown-command');

      expect(emitted).toBe(false);
    });
  });
});
