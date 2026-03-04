"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";
import styles from "./ToastProvider.module.css";

export type ToastVariant = "success" | "info" | "warning" | "error";

type ToastInput = {
    message: string;
    variant?: ToastVariant;
    durationMs?: number;
    persistent?: boolean;
    actionLabel?: string;
    onAction?: () => void;
};

type ToastEntry = {
    id: number;
    message: string;
    variant: ToastVariant;
    actionLabel?: string;
    onAction?: () => void;
};

type ToastContextValue = {
    showToast: (input: ToastInput) => void;
    dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 4;
const DEFAULT_DURATION_MS = 3200;

function getTitle(variant: ToastVariant): string {
    if (variant === "success") return "Success";
    if (variant === "warning") return "Warning";
    if (variant === "error") return "Error";
    return "Info";
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastEntry[]>([]);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback(
        ({
            message,
            variant = "info",
            durationMs = DEFAULT_DURATION_MS,
            persistent = false,
            actionLabel,
            onAction,
        }: ToastInput) => {
            const id = Date.now() + Math.floor(Math.random() * 1000);
            setToasts((prev) => {
                const deduped = prev.filter(
                    (toast) => !(toast.message === message && toast.variant === variant)
                );
                const next = [...deduped, { id, message, variant, actionLabel, onAction }];
                return next.slice(-MAX_TOASTS);
            });

            if (!persistent && durationMs > 0) {
                window.setTimeout(() => {
                    dismissToast(id);
                }, durationMs);
            }
        },
        [dismissToast]
    );

    const contextValue = useMemo(
        () => ({ showToast, dismissToast }),
        [showToast, dismissToast]
    );

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <div className={styles.viewport}>
                {toasts.map((toast) => (
                    <section
                        key={toast.id}
                        className={`${styles.toast} ${styles[toast.variant]}`}
                        role={toast.variant === "error" ? "alert" : "status"}
                        aria-live={toast.variant === "error" ? "assertive" : "polite"}
                    >
                        <div className={styles.header}>
                            <p className={styles.title}>{getTitle(toast.variant)}</p>
                            <div className={styles.actions}>
                                {toast.actionLabel && toast.onAction ? (
                                    <button
                                        type="button"
                                        className={styles.action}
                                        onClick={() => {
                                            toast.onAction?.();
                                            dismissToast(toast.id);
                                        }}
                                    >
                                        {toast.actionLabel}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    className={styles.dismiss}
                                    onClick={() => dismissToast(toast.id)}
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                        <p className={styles.message}>{toast.message}</p>
                    </section>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within ToastProvider");
    }
    return context;
}
