import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { IconButton } from "./IconButton";

export type ToastVariant = "success" | "error";

type ToastItem = { id: number; message: string; variant: ToastVariant };

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const DISPLAY_MS = 4200;

/**
 * App-wide toast (shadcn-style primitive already used by the design system).
 * Mounted once at the app root so toasts survive client-side navigations.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => dismiss(id), DISPLAY_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => {
          const isError = toast.variant === "error";
          return (
            <div
              key={toast.id}
              role={isError ? "alert" : "status"}
              className={cn(
                "animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-2xl border px-4 py-3 shadow-elevate",
                isError
                  ? "border-accent/30 bg-accent-subtle text-text-primary"
                  : "border-border bg-surface text-text-primary",
              )}
            >
              {isError ? (
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-accent" />
              ) : (
                <CheckCircle2
                  size={18}
                  className="mt-0.5 shrink-0 text-success-text"
                />
              )}
              <p className="flex-1 text-sm font-medium">{toast.message}</p>
              <IconButton
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
                className="h-7 w-7"
              >
                <X size={14} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
