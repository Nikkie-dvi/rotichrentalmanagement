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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) move(1);
          else if (info.offset.x > 40) move(-1);
        }}
        className="pointer-events-auto flex max-w-[95vw] items-center gap-1 overflow-hidden rounded-full border border-border/50 bg-background/70 p-1 shadow-2xl ring-1 ring-inset ring-foreground/10 backdrop-blur-2xl backdrop-saturate-150"
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
              className={`relative shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-300 sm:text-sm ${
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="active-mode-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-full bg-primary shadow-lg"
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
