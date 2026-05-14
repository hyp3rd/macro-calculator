"use client";

import type { PersonalInfo } from "@/components/macro/types";
import {
  getProfile,
  listCustomFoods,
  listDailyLogs,
  listMealTemplates,
  listWeightEntries,
  type CustomFood,
  type DailyLog,
  type MealTemplate,
  type WeightEntry,
} from "@/lib/db";

/** Bumped whenever the export shape changes in a way an importer would
 * need to know about (added/removed stores, renamed fields, semantic
 * changes). The current shape is the v5 IDB schema, faithfully serialized. */
export const EXPORT_VERSION = 1;

export type ExportBundle = {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  user: { id: string; email: string | null } | null;
  data: {
    profile: PersonalInfo | null;
    dailyLogs: DailyLog[];
    weightHistory: WeightEntry[];
    customFoods: CustomFood[];
    mealTemplates: MealTemplate[];
  };
};

/** Reads everything in IndexedDB and returns a JSON-serializable bundle.
 * Pure: doesn't touch the network and doesn't trigger a download — the
 * caller decides what to do with the bundle. */
export async function buildExport(
  user: { id: string; email: string | null } | null,
): Promise<ExportBundle> {
  const [profile, dailyLogs, weightHistory, customFoods, mealTemplates] =
    await Promise.all([
      getProfile(),
      listDailyLogs(),
      listWeightEntries(),
      listCustomFoods(),
      listMealTemplates(),
    ]);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    user,
    data: { profile, dailyLogs, weightHistory, customFoods, mealTemplates },
  };
}

/** Triggers a browser download of the given bundle. Filename includes the
 * date so successive exports don't clobber each other in the user's
 * Downloads folder. */
export function downloadExport(bundle: ExportBundle): void {
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `macro-calculator-export-${bundle.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Free the object URL on the next tick so the click handler has time
  // to start the download in browsers that defer the navigation.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
