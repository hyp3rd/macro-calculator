"use client";

import { NumberTicker } from "@/components/shell/NumberTicker";
import React from "react";
import {
  CalculatedValues,
  MacroBreakdown,
  TotalMacros,
} from "../../components/macro/types";

interface DailyTotalsProps {
  calculatedValues: CalculatedValues;
  totalMacros: TotalMacros;
  /** Optional per-day sub-macro totals — sugars / fiber / fat subtypes.
   *  Rendered as a collapsible breakdown below the main P/C/F/kcal
   *  tiles. Only rows whose value the aggregator populated render
   *  (others were never seen in today's foods, so showing "0g" would
   *  mislead). When the whole object is empty, the breakdown row is
   *  hidden entirely. */
  breakdown?: MacroBreakdown;
}

const SUB_MACRO_LABELS: Record<keyof MacroBreakdown, string> = {
  sugars: "Sugars",
  addedSugars: "Added sugars",
  fiber: "Fiber",
  saturatedFat: "Saturated fat",
  transFat: "Trans fat",
  monoFat: "Mono-unsat. fat",
  polyFat: "Poly-unsat. fat",
};

type Row = {
  key: keyof TotalMacros;
  label: string;
  target: number;
  unit: string;
  cssVar?: string;
};

const DailyTotals: React.FC<DailyTotalsProps> = ({
  calculatedValues,
  totalMacros,
  breakdown,
}) => {
  const pct = (current: number, target: number) =>
    target === 0 ? 0 : Math.min(Math.round((current / target) * 100), 100);

  const rows: Row[] = [
    {
      key: "protein",
      label: "Protein",
      target: calculatedValues.protein,
      unit: "g",
      cssVar: "--macro-protein",
    },
    {
      key: "carbs",
      label: "Carbs",
      target: calculatedValues.carbs,
      unit: "g",
      cssVar: "--macro-carbs",
    },
    {
      key: "fat",
      label: "Fat",
      target: calculatedValues.fat,
      unit: "g",
      cssVar: "--macro-fat",
    },
    {
      key: "calories",
      label: "kcal",
      target: calculatedValues.targetCalories,
      unit: "",
    },
  ];

  return (
    <div>
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Daily Totals
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 sm:gap-x-4">
        {rows.map((row) => {
          const current = totalMacros[row.key];
          const p = pct(current, row.target);
          return (
            <div
              key={row.key}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {row.cssVar && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: `hsl(var(${row.cssVar}))` }}
                      aria-hidden
                    />
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {row.label}
                  </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  / {row.target}
                  {row.unit}
                </span>
              </div>
              <p className="font-mono text-xl font-semibold tabular-nums text-foreground">
                <NumberTicker
                  value={current}
                  suffix={row.unit}
                />
              </p>
              <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{
                    width: `${p}%`,
                    background: row.cssVar
                      ? `hsl(var(${row.cssVar}))`
                      : "hsl(var(--foreground))",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {breakdown && Object.keys(breakdown).length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Breakdown ({Object.keys(breakdown).length} sub-macro
            {Object.keys(breakdown).length === 1 ? "" : "s"})
          </summary>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 font-mono tabular-nums sm:grid-cols-2">
            {(Object.keys(SUB_MACRO_LABELS) as Array<keyof MacroBreakdown>)
              .filter((k) => typeof breakdown[k] === "number")
              .map((k) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-2"
                >
                  <dt className="text-muted-foreground">
                    {SUB_MACRO_LABELS[k]}
                  </dt>
                  <dd className="text-foreground">{breakdown[k]} g</dd>
                </div>
              ))}
          </dl>
        </details>
      )}
    </div>
  );
};

export default DailyTotals;
