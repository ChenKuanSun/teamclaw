import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  let component: ConfirmDialogComponent;
  let fixture: ComponentFixture<ConfirmDialogComponent>;
  let dialogRefSpy: jest.Mocked<Pick<MatDialogRef<any>, 'close'>>;

  const baseData: ConfirmDialogData = {
    title: 'Delete Item',
    message: 'Are you sure you want to delete this?',
    confirmText: 'Delete',
    confirmColor: 'warn',
    icon: 'delete',
  };

  function setup(data: ConfirmDialogData = baseData) {
    dialogRefSpy = { close: jest.fn() };

    TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('simple confirm (no confirmation input)', () => {
    beforeEach(() => setup());

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should inject dialog data', () => {
      expect(component.data.title).toBe('Delete Item');
      expect(component.data.message).toBe(
        'Are you sure you want to delete this?',
      );
    });

    it('canConfirm() should return true when no requireConfirmation', () => {
      expect(component.canConfirm()).toBe(true);
    });

    it('confirm() should close dialog with true', () => {
      component.confirm();
      expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
    });
  });

  describe('with confirmation input required', () => {
    beforeEach(() => {
      setup({
        ...baseData,
        requireConfirmation: 'DELETE',
        confirmationLabel: 'Type DELETE to confirm',
      });
    });

    it('canConfirm() should return false when input does not match', () => {
      expect(component.canConfirm()).toBe(false);
      component.confirmationInput.set('del');
      expect(component.canConfirm()).toBe(false);
    });

    it('canConfirm() should return true when input matches exactly', () => {
      component.confirmationInput.set('DELETE');
      expect(component.canConfirm()).toBe(true);
    });

    it('canConfirm() should be case-sensitive', () => {
      component.confirmationInput.set('delete');
      expect(component.canConfirm()).toBe(false);
    });
  });
});
