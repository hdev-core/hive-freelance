import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";
import type { ButtonVariant } from "./button-variants";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  /** Disables both actions and suppresses backdrop/Escape dismissal while a request is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Centered, app-styled confirmation modal — the one dialog primitive in the
 * app, used wherever a destructive/irreversible action needs a confirm step
 * instead of the browser's native confirm(). Defaults focus to Cancel (not
 * Confirm) so a stray Enter keypress can't trigger the destructive action.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "destructive",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Focus management only — deliberately not re-run on `busy` so this
  // doesn't re-capture previouslyFocused or re-steal focus onto Cancel
  // every time a request starts/finishes.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, [open]);

  // A disabled button can't hold DOM focus — the instant `busy` flips true
  // and both buttons get `disabled`, the browser blurs whichever one had
  // focus back to <body>. Left alone, the next Tab would resume native tab
  // order from <body> and walk straight out of the modal into the page
  // behind it (the trap below has nothing to cycle between at that point —
  // zero enabled elements). Re-anchor focus on the dialog container itself
  // (tabIndex={-1}: programmatically focusable, not in normal tab order)
  // so focus has somewhere to legitimately live for the trap to pin.
  useEffect(() => {
    if (open && busy) {
      dialogRef.current?.focus();
    }
  }, [open, busy]);

  // Separate effect so the listener re-subscribes with the current `busy`
  // value instead of closing over whatever it was when the dialog opened —
  // otherwise a keypress after busy flips true/false still uses the stale
  // value from mount.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!busy) onCancel();
        return;
      }
      if (e.key !== "Tab") return;

      // While busy there are zero enabled elements to cycle between —
      // pin Tab outright instead of trying to find a first/last among
      // nothing, which is what silently let focus escape before.
      if (busy) {
        e.preventDefault();
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        className="animate-modal-in relative flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-elevate outline-none"
      >
        <div>
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-text-primary">
            {title}
          </h2>
          {description && (
            <p id="confirm-dialog-description" className="mt-1.5 text-sm text-text-secondary">
              {description}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button ref={cancelButtonRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
