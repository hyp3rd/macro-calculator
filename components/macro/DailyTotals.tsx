"use client";

import { NumberTicker } from "@/components/shell/NumberTicker";
import React from "react";
import { CalculatedValues, TotalMacros } from "../../components/macro/types";

interface DailyTotalsProps {
  calculatedValues: CalculatedValues;
  totalMacros: TotalMacros;
}

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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
    </div>
  );
};

export default DailyTotals;
