"use client";

import {
  MiniLineChart,
  type LinePoint,
} from "@/components/shell/MiniLineChart";
import { NumberTicker } from "@/components/shell/NumberTicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listDailyLogs,
  listWeightEntries,
  saveWeightEntry,
  todayKey,
  type DailyLog,
  type WeightEntry,
} from "@/lib/db";
import { reportStorageError, reportStorageOk } from "@/lib/storage-status";
import { bumpPending } from "@/lib/sync-status";
import { useDataRev } from "@/lib/sync/data-bus";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Check, LineChart, TrendingDown, TrendingUp } from "lucide-react";

const WINDOW_DAYS = 60;

type Props = {
  /** Today's calorie target — drawn as a reference line on the calorie
   * chart. We use the *current* profile's target for all historical days;
   * the chart is honest about adherence relative to where you stand now,
   * not where you stood then. A target-history store is the proper fix
   * for cuts/bulks; flagged as a follow-up. */
  targetCalories: number;
};

function parseLocalDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function dayIndex(d: string): number {
  return Math.floor(parseLocalDate(d).getTime() / 86_400_000);
}

function shortLabel(d: string): string {
  return parseLocalDate(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ProgressView({ targetCalories }: Props) {
  const [weights, setWeights] = useState<WeightEntry[] | null>(null);
  const [logs, setLogs] = useState<DailyLog[] | null>(null);
  const [rev, setRev] = useState(0);
  // Refresh when a peer device writes a weight entry or a daily log
  // (both of which feed the charts here). Each bus has its own rev
  // counter; both feed into the same load effect.
  const weightRev = useDataRev("weightHistory");
  const dailyLogsRev = useDataRev("dailyLogs");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listWeightEntries(), listDailyLogs()])
      .then(([w, l]) => {
        if (cancelled) return;
        setWeights(w);
        setLogs(l);
      })
      .catch((err) => {
        if (cancelled) return;
        reportStorageError(err);
        setWeights([]);
        setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rev, weightRev, dailyLogsRev]);

  const refresh = () => setRev((r) => r + 1);

  return (
    <div className="space-y-6">
      <WeightSection
        entries={weights}
        targetWindow={WINDOW_DAYS}
      />
      <WeighInForm onSaved={refresh} />
      <CalorieSection
        logs={logs}
        targetCalories={targetCalories}
        targetWindow={WINDOW_DAYS}
      />
    </div>
  );
}

function WeightSection({
  entries,
  targetWindow,
}: {
  entries: WeightEntry[] | null;
  targetWindow: number;
}) {
  const loading = entries === null;
  const windowed = entries ? entries.slice(-targetWindow) : [];
  const hasData = windowed.length > 0;
  const first = hasData ? windowed[0] : null;
  const latest = hasData ? windowed[windowed.length - 1] : null;
  const delta = first && latest ? latest.kg - first.kg : 0;

  const points: LinePoint[] = windowed.map((e) => ({
    x: dayIndex(e.date),
    y: e.kg,
    label: shortLabel(e.date),
  }));

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <header className="border-b border-border/60 px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Weight</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Last {targetWindow} days. Auto-logs when you change your weight on
              the Calculator tab.
            </p>
          </div>
          {hasData && latest && first && (
            <div className="flex items-baseline gap-3">
              <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                <NumberTicker
                  value={latest.kg}
                  decimals={1}
                  suffix=" kg"
                />
              </p>
              {windowed.length > 1 && (
                <p
                  className={cn(
                    "flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground",
                  )}
                >
                  {delta < 0 ? (
                    <TrendingDown className="h-3 w-3" />
                  ) : delta > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : null}
                  {delta > 0 ? "+" : ""}
                  {delta.toFixed(1)} kg since {shortLabel(first.date)}
                </p>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="px-5 py-6">
        {loading ? (
          <Skeleton />
        ) : hasData ? (
          <MiniLineChart
            data={points}
            height={240}
            yUnit=" kg"
          />
        ) : (
          <EmptyState
            title="No weigh-ins yet"
            body="Update your weight on the Calculator tab — or use the form below to log a measurement directly."
          />
        )}
      </div>
    </section>
  );
}

function CalorieSection({
  logs,
  targetCalories,
  targetWindow,
}: {
  logs: DailyLog[] | null;
  targetCalories: number;
  targetWindow: number;
}) {
  const loading = logs === null;

  // Roll log totals up to a per-day calorie series, oldest first.
  const series = (logs ?? [])
    .map((l) => ({
      date: l.date,
      calories: l.meals.reduce(
        (s, m) => s + m.foods.reduce((ms, f) => ms + f.calories, 0),
        0,
      ),
    }))
    .filter((p) => p.calories > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-targetWindow);

  const hasData = series.length > 0;

  const points: LinePoint[] = series.map((p) => ({
    x: dayIndex(p.date),
    y: p.calories,
    label: shortLabel(p.date),
  }));

  // 7-day rolling average of calories — the comparison most fitness
  // practitioners care about, since day-to-day adherence is noisy.
  const last7 = series.slice(-7);
  const avg7 =
    last7.length > 0
      ? last7.reduce((s, p) => s + p.calories, 0) / last7.length
      : 0;
  const adherencePct =
    last7.length > 0 && targetCalories > 0
      ? Math.round((avg7 / targetCalories) * 100)
      : 0;

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <header className="border-b border-border/60 px-5 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Calorie adherence
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Logged calories per day vs your current target of{" "}
              {targetCalories.toLocaleString()} kcal.
            </p>
          </div>
          {hasData && (
            <div className="flex items-baseline gap-3">
              <p className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                <NumberTicker value={Math.round(avg7)} />
                <span className="ml-1 text-sm text-muted-foreground">
                  / 7d avg
                </span>
              </p>
              <p
                className={cn(
                  "font-mono text-xs tabular-nums",
                  adherencePct >= 90 && adherencePct <= 110
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {adherencePct}% of target
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="px-5 py-6">
        {loading ? (
          <Skeleton />
        ) : hasData ? (
          <MiniLineChart
            data={points}
            height={240}
            targetY={targetCalories}
            targetLabel={`${targetCalories} kcal target`}
          />
        ) : (
          <EmptyState
            title="No logs yet"
            body="Add foods on the Meal Plan tab — once you've logged a day or two, your adherence will show up here."
          />
        )}
      </div>
    </section>
  );
}

function WeighInForm({ onSaved }: { onSaved: () => void }) {
  const [date, setDate] = useState(todayKey());
  const [kg, setKg] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const value = Number.parseFloat(kg);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a positive weight in kg.");
      return;
    }
    setSaving(true);
    try {
      await saveWeightEntry(date, value);
      reportStorageOk();
      bumpPending();
      setKg("");
      setDate(todayKey());
      setJustSaved(true);
      onSaved();
      window.setTimeout(() => setJustSaved(false), 1500);
    } catch (e) {
      reportStorageError(e);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">Log weigh-in</h3>
        <p className="text-[11px] text-muted-foreground">
          Same-day entries overwrite.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label
            htmlFor="weigh-in-date"
            className="text-xs font-medium text-muted-foreground"
          >
            Date
          </Label>
          <Input
            id="weigh-in-date"
            type="date"
            max={todayKey()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label
            htmlFor="weigh-in-kg"
            className="text-xs font-medium text-muted-foreground"
          >
            Weight (kg)
          </Label>
          <Input
            id="weigh-in-kg"
            type="number"
            min="20"
            max="300"
            step="0.1"
            placeholder="e.g. 70.5"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            className="font-mono tabular-nums"
          />
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={saving || kg.trim() === ""}
          className="h-9 gap-1.5"
        >
          {justSaved ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Saved
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Save"
          )}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-2 text-xs text-red-600"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      <div className="h-2 w-24 animate-pulse rounded bg-muted" />
      <div className="h-[200px] animate-pulse rounded bg-muted/40" />
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        <LineChart
          className="h-5 w-5 text-muted-foreground"
          aria-hidden
        />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
