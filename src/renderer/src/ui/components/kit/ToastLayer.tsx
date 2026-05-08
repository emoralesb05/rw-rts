import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "../primitives/Toast";

type ToastTone = "info" | "success" | "danger";

type ToastEntry = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  notify: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const notify = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((items) => [
      ...items.slice(-3),
      {
        id,
        title: toast.title,
        description: toast.description,
        tone: toast.tone ?? "info",
      },
    ]);
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((items) => items.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      <ToastProvider swipeDirection="right" duration={2600}>
        {children}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            defaultOpen
            className={
              toast.tone === "success"
                ? "border-success/50"
                : toast.tone === "danger"
                  ? "border-danger/60"
                  : undefined
            }
            onOpenChange={(open) => {
              if (!open) remove(toast.id);
            }}
          >
            <div className="min-w-0">
              <ToastTitle>{toast.title}</ToastTitle>
              {toast.description && (
                <ToastDescription>{toast.description}</ToastDescription>
              )}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used inside AppToastProvider");
  }
  return value;
}
