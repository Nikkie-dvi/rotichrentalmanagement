import { motion } from "framer-motion";

export type ModeKey = "details" | "pay" | "report";

export type ModeItem = {
  key: ModeKey;
  label: string;
  /** Optional badge: a number renders a counter, `true` renders a dot. */
  badge?: number | boolean;
};

/**
 * iOS Camera-style mode selector pinned to the bottom of the tenant portal.
 * A single sliding pill (shared layoutId) travels between the labels.
 */
export function TenantModeSwitcher({
  items,
  value,
  onChange,
}: {
  items: ModeItem[];
  value: ModeKey;
  onChange: (key: ModeKey) => void;
}) {
  const index = items.findIndex((i) => i.key === value);

  const move = (dir: 1 | -1) => {
    const next = items[Math.min(items.length - 1, Math.max(0, index + dir))];
    if (next && next.key !== value) onChange(next.key);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) move(1);
          else if (info.offset.x > 40) move(-1);
        }}
        className="pointer-events-auto mx-auto grid h-16 w-full max-w-3xl grid-cols-3 items-stretch px-2"
        role="tablist"
        aria-label="Tenant portal modes"
      >
        {items.map((item) => {
          const active = item.key === value;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(item.key)}
              className={`relative min-w-0 px-1 py-2 text-[11px] font-semibold transition-colors duration-200 sm:text-sm ${
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="active-mode-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-x-3 top-0 h-0.5 bg-primary"
                />
              )}
              <span className="relative whitespace-nowrap">{item.label}</span>
              {item.badge ? (
                typeof item.badge === "number" ? (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
                    {item.badge > 9 ? "9+" : item.badge}
                  </span>
                ) : (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background" />
                )
              ) : null}
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
