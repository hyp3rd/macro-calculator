"use client";

import { Button } from "@/components/ui/button";
import { dateKey } from "@/lib/db";
import { cn } from "@/lib/utils";
import { useId, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  /** Currently displayed date in `YYYY-MM-DD`. */
  date: string;
  /** Today's date (for disabling "next" beyond today and for the Today button). */
  today: string;
  onSelect: (date: string) => void;
};

/** Convert a `YYYY-MM-DD` to a local-time `Date` so DST shifts don't
 * push the day backward/forward when we add or subtract 24h. */
function parseLocal(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function shiftDays(d: string, delta: number): string {
  const dt = parseLocal(d);
  dt.setDate(dt.getDate() + delta);
  return dateKey(dt);
}

function formatLabel(d: string, today: string): string {
  if (d === today) return "Today";
  if (d === shiftDays(today, -1)) return "Yesterday";
  const dt = parseLocal(d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function DateNavigator({ date, today, onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const isToday = date === today;
  const canGoForward = date < today;

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={() => onSelect(shiftDays(date, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="relative">
        <label
          htmlFor={inputId}
          className={cn(
            "flex h-8 cursor-pointer items-center rounded-md px-3 text-sm font-medium tabular-nums transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            !isToday && "text-foreground",
          )}
        >
          <span>{formatLabel(date, today)}</span>
          {!isToday && (
            <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {date}
            </span>
          )}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="date"
          value={date}
          max={today}
          onChange={(e) => {
            if (e.target.value) onSelect(e.target.value);
          }}
          // Invisible but in-flow so the label click focuses + opens the picker.
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Jump to date"
        />
      </div>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={() => onSelect(shiftDays(date, 1))}
        disabled={!canGoForward}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!isToday && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-1 h-8"
          onClick={() => onSelect(today)}
        >
          Today
        </Button>
      )}
    </div>
  );
}
