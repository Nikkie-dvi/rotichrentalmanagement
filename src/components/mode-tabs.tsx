import { motion } from "framer-motion";

export type ModeTab = { key: string; label: string };

/**
 * iPhone-camera style segmented switcher driven by local state (not routing).
 * A single sliding pill travels between the labels, and a horizontal drag
 * moves one step in either direction — the same feel as the tenant portal.
 */
export function ModeTabs({
  items,
  value,
  onChange,
  layoutId = "mode-tabs-pill",
  className = "",
}: {
  items: ModeTab[];
  value: string;
  onChange: (key: string) => void;
  layoutId?: string;
  className?: string;
}) {
  const index = items.findIndex((i) => i.key === value);

  const move = (dir: 1 | -1) => {
    if (index < 0) return;
    const next = items[Math.min(items.length - 1, Math.max(0, index + dir))];
    if (next && next.key !== value) onChange(next.key);
  };

  return (
    <div className={`-mx-1 overflow-x-auto pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40) move(1);
          else if (info.offset.x > 40) move(-1);
        }}
        role="tablist"
        className="mx-auto inline-flex min-w-full items-center justify-center gap-1 overflow-hidden rounded-full border border-border/50 bg-background/70 p-1 shadow-2xl ring-1 ring-inset ring-foreground/10 backdrop-blur-2xl backdrop-saturate-150 sm:min-w-0"
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
              className={`relative flex-1 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider transition-colors duration-300 sm:text-sm ${
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-full bg-primary shadow-lg"
                />
              )}
              <span className="relative whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
