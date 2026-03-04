"use client";

import {
    type CSSProperties,
    type ReactNode,
    useId,
    useRef,
    useState,
} from "react";
import styles from "./Tooltip.module.css";

type TooltipPlacement = "top" | "bottom" | "left" | "right";

type TooltipProps = {
    content: ReactNode;
    children: ReactNode;
    placement?: TooltipPlacement;
    delay?: number;
    disabled?: boolean;
    maxWidth?: number | string;
};

export function Tooltip({
    content,
    children,
    placement = "top",
    delay = 180,
    disabled = false,
    maxWidth,
}: TooltipProps) {
    const id = useId();
    const [isOpen, setIsOpen] = useState(false);
    const openTimerRef = useRef<number | null>(null);
    const touchCloseTimerRef = useRef<number | null>(null);

    const clearTimers = () => {
        if (openTimerRef.current !== null) {
            window.clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
        if (touchCloseTimerRef.current !== null) {
            window.clearTimeout(touchCloseTimerRef.current);
            touchCloseTimerRef.current = null;
        }
    };

    const openWithDelay = () => {
        if (disabled) return;
        clearTimers();
        openTimerRef.current = window.setTimeout(() => {
            setIsOpen(true);
        }, delay);
    };

    const closeNow = () => {
        clearTimers();
        setIsOpen(false);
    };

    const toggleTouch = () => {
        if (disabled) return;
        clearTimers();
        setIsOpen((prev) => !prev);
        touchCloseTimerRef.current = window.setTimeout(() => {
            setIsOpen(false);
        }, 1800);
    };

    const tooltipStyle: CSSProperties | undefined =
        maxWidth === undefined ? undefined : { maxWidth };

    const handleKeyDown: React.KeyboardEventHandler<HTMLSpanElement> = (event) => {
        if (event.key === "Escape") {
            closeNow();
        }
    };

    return (
        <span
            className={styles.root}
            onMouseEnter={openWithDelay}
            onMouseLeave={closeNow}
            onFocus={openWithDelay}
            onBlur={closeNow}
            onTouchStart={toggleTouch}
            onKeyDown={handleKeyDown}
            aria-describedby={isOpen && !disabled ? id : undefined}
        >
            {children}
            {isOpen && !disabled ? (
                <span
                    id={id}
                    role="tooltip"
                    className={`${styles.tooltip} ${styles[placement]}`}
                    style={tooltipStyle}
                >
                    {content}
                </span>
            ) : null}
        </span>
    );
}
