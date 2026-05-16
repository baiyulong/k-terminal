import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void | Promise<void>;
  icon?: ReactNode;
  divider?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition | null;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      onClose();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("contextmenu", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("contextmenu", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, position]);

  if (!position || items.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[70] min-w-[12rem] rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-1 shadow-2xl"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item) => (
        <div
          key={`${item.label}-${item.divider ? "divider" : "item"}`}
          className={item.divider ? "mt-1 border-t border-[hsl(var(--border))] pt-1" : undefined}
        >
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) {
                return;
              }

              onClose();
              void item.onClick();
            }}
            className={[
              "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
              item.destructive
                ? "text-red-500 hover:bg-red-500/10"
                : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]",
              item.disabled ? "cursor-not-allowed opacity-50" : undefined,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
            <span className="truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );
}
