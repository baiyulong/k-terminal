import { useMemo } from "react";
import { create } from "zustand";

export type ToastTone = "success" | "error";

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: ToastItem[];
  pushToast: (toast: Omit<ToastItem, "id"> & { duration?: number }) => void;
  removeToast: (id: string) => void;
}

const DEFAULT_DURATION_MS = 2800;

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  pushToast: ({ message, tone, duration = DEFAULT_DURATION_MS }) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    set((state) => ({
      toasts: [...state.toasts, { id, message, tone }],
    }));

    window.setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, duration);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

export function useToast() {
  const pushToast = useToastStore((state) => state.pushToast);

  return useMemo(
    () => ({
      success: (message: string) => pushToast({ message, tone: "success" }),
      error: (message: string) => pushToast({ message, tone: "error" }),
    }),
    [pushToast],
  );
}

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={[
            "pointer-events-auto flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur",
            toast.tone === "success"
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/25 bg-red-500/10 text-red-200",
          ].join(" ")}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium">{toast.message}</p>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="rounded-md px-1 text-xs font-semibold uppercase tracking-[0.2em] text-current/80 transition hover:text-current"
          >
            Close
          </button>
        </div>
      ))}
    </div>
  );
}
