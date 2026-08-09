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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={busy ? undefined : onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? "confirm-dialog-description" : undefined}
        className="animate-modal-in relative flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-elevate"
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
