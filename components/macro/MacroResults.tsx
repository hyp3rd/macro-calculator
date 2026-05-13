"use client";

import { NumberTicker } from "@/components/shell/NumberTicker";
import { cn } from "@/lib/utils";
import * as React from "react";
import { CalculatedValues, TotalMacros } from "../../components/macro/types";

interface MacroResultsProps {
  calculatedValues: CalculatedValues;
  totalMacros: TotalMacros;
}

type MacroKey = "protein" | "carbs" | "fat";

const MACRO_META: Record<
  MacroKey,
  { label: string; kcalPerGram: number; cssVar: string }
> = {
  protein: { label: "Protein", kcalPerGram: 4, cssVar: "--macro-protein" },
  carbs: { label: "Carbs", kcalPerGram: 4, cssVar: "--macro-carbs" },
  fat: { label: "Fat", kcalPerGram: 9, cssVar: "--macro-fat" },
};

const MacroResults: React.FC<MacroResultsProps> = ({
  calculatedValues,
  totalMacros,
}) => {
  const pct = (current: number, target: number) =>
    target === 0 ? 0 : Math.min(Math.round((current / target) * 100), 100);

  return (
    <div className="space-y-6">
      {/* Headline numbers */}
      <section className="rounded-lg border border-border/60 bg-card">
        <div className="border-b border-border/60 px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Daily Targets
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/60">
          {[
            { label: "BMR", value: calculatedValues.bmr },
            { label: "TDEE", value: calculatedValues.tdee },
            { label: "Target", value: calculatedValues.targetCalories },
          ].map((s) => (
            <div
              key={s.label}
              className="px-5 py-4"
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
                <NumberTicker
                  value={s.value}
                  suffix=""
                />
              </p>
              <p className="text-[11px] text-muted-foreground">kcal/day</p>
            </div>
          ))}
        </div>
        {calculatedValues.dailyDelta !== 0 && (
          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
            <span className="text-xs text-muted-foreground">
              {calculatedValues.dailyDelta < 0 ? "Deficit" : "Surplus"}
            </span>
            <span
              className={cn(
                "font-mono text-sm font-medium tabular-nums",
                calculatedValues.dailyDelta < 0
                  ? "text-foreground"
                  : "text-foreground",
              )}
            >
              <NumberTicker
                value={calculatedValues.dailyDelta}
                prefix={calculatedValues.dailyDelta > 0 ? "+" : ""}
                suffix=" kcal"
              />
              <span className="ml-2 text-muted-foreground">
                ≈{" "}
                {((Math.abs(calculatedValues.dailyDelta) * 7) / 7700).toFixed(
                  2,
                )}{" "}
                kg/wk
              </span>
            </span>
          </div>
        )}
        {calculatedValues.dailyDelta !== calculatedValues.requestedDelta && (
          <div className="border-t border-border/60 px-5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            Capped to safety floor (max(BMR, 1200 kcal)).
          </div>
        )}
      </section>

      {/* Macro breakdown */}
      <section className="rounded-lg border border-border/60 bg-card">
        <div className="border-b border-border/60 px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Macro Targets
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border/60">
          {(["protein", "carbs", "fat"] as MacroKey[]).map((k) => {
            const meta = MACRO_META[k];
            const grams = calculatedValues[k];
            return (
              <div
                key={k}
                className="px-5 py-4"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: `hsl(var(${meta.cssVar}))` }}
                    aria-hidden
                  />
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </p>
                </div>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
                  <NumberTicker
                    value={grams}
                    suffix="g"
                  />
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {grams * meta.kcalPerGram} kcal
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Progress */}
      <section className="rounded-lg border border-border/60 bg-card">
        <div className="border-b border-border/60 px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Today
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {(["protein", "carbs", "fat"] as MacroKey[]).map((k) => {
            const meta = MACRO_META[k];
            const current = totalMacros[k];
            const target = calculatedValues[k];
            const p = pct(current, target);
            return (
              <ProgressRow
                key={k}
                label={meta.label}
                cssVar={meta.cssVar}
                current={current}
                target={target}
                pct={p}
                unit="g"
              />
            );
          })}
          <ProgressRow
            label="Calories"
            cssVar=""
            current={totalMacros.calories}
            target={calculatedValues.targetCalories}
            pct={pct(totalMacros.calories, calculatedValues.targetCalories)}
            unit=""
          />
        </div>
      </section>

      {calculatedValues.dailyDelta !== 0 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Assumes ~7700 kcal/kg of bodyweight change. If your real-world rate
          diverges by more than ~20% after a few weeks, override TDEE in the
          form to recalibrate.
        </p>
      )}
    </div>
  );
};

function ProgressRow({
  label,
  cssVar,
  current,
  target,
  pct,
  unit,
}: {
  label: string;
  cssVar: string;
  current: number;
  target: number;
  pct: number;
  unit: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          {cssVar ? (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: `hsl(var(${cssVar}))` }}
              aria-hidden
            />
          ) : null}
          <span className="text-xs font-medium text-foreground">{label}</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {current}
          {unit} / {target}
          {unit}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: cssVar
              ? `hsl(var(${cssVar}))`
              : "hsl(var(--foreground))",
          }}
        />
      </div>
    </div>
  );
}

export default MacroResults;
