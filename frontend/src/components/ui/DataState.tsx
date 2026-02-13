"use client";

import type { ReactNode } from "react";
import styles from "./DataState.module.css";

type DataStateVariant = "loading" | "empty" | "error";

type DataStateProps = {
    variant: DataStateVariant;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    icon?: ReactNode;
};

function getDefaultIcon(variant: DataStateVariant): string {
    if (variant === "loading") return "◌";
    if (variant === "error") return "⚠";
    return "○";
}

export function DataState({
    variant,
    title,
    description,
    actionLabel,
    onAction,
    icon,
}: DataStateProps) {
    return (
        <section
            className={`${styles.state} ${styles[variant]}`}
            role={variant === "error" ? "alert" : "status"}
            aria-live={variant === "error" ? "assertive" : "polite"}
        >
            <div className={styles.headerRow}>
                <span className={styles.icon} aria-hidden="true">
                    {icon ?? getDefaultIcon(variant)}
                </span>
                <p className={styles.title}>{title}</p>
            </div>
            <p className={styles.description}>{description}</p>
            {actionLabel && onAction ? (
                <button type="button" className={styles.action} onClick={onAction}>
                    {actionLabel}
                </button>
            ) : null}
        </section>
    );
}
