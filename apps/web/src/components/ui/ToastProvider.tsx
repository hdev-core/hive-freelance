import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";
import { IconButton } from "./IconButton";

type ToastItem = { id: number; message: string };

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const DISPLAY_MS = 3200;

/**
 * Mounted once at the app root (outside <Routes>) so a toast triggered
 * right before a client-side navigate() — e.g. "signed in, redirecting to
 * dashboard" — stays visible across the route change instead of unmounting
 * with the page that triggered it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message }]);
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
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-elevate"
          >
            <CheckCircle2 size={18} className="shrink-0 text-success-text" />
            <p className="flex-1 text-sm font-medium text-text-primary">{toast.message}</p>
            <IconButton
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="h-7 w-7"
            >
              <X size={14} />
            </IconButton>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
