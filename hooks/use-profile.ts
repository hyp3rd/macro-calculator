"use client";

import type { PersonalInfo } from "@/components/macro/types";
import { getProfile, saveProfile, saveWeightEntry, todayKey } from "@/lib/db";
import { notifyProfileChanged } from "@/lib/profile-bus";
import { reportStorageError, reportStorageOk } from "@/lib/storage-status";
import { bumpPending } from "@/lib/sync-status";
import { useCallback, useEffect, useRef, useState } from "react";

const WRITE_DEBOUNCE_MS = 500;

export type ProfileState = {
  profile: PersonalInfo;
  setProfile: (next: PersonalInfo) => void;
  /** Patch a single field. Equivalent to `setProfile({ ...profile, [name]: value })`. */
  patchProfile: (
    name: keyof PersonalInfo,
    value: PersonalInfo[keyof PersonalInfo],
  ) => void;
  /** False on first render; true once IndexedDB has resolved. */
  isHydrated: boolean;
};

/** Persists the user's profile in IndexedDB. On mount, attempts to load
 * the saved profile; falls back to `defaultProfile` if none exists or
 * IndexedDB is unavailable (e.g. private mode, SSR). Writes are debounced
 * so a stream of input-change events doesn't hammer the store. */
export function useProfile(defaultProfile: PersonalInfo): ProfileState {
  const [profile, setProfileState] = useState<PersonalInfo>(defaultProfile);
  const [isHydrated, setIsHydrated] = useState(false);
  // Tracks the last weight we've persisted as a weigh-in. `null` until
  // hydration completes; thereafter, updates fire a weighHistory entry
  // for today only when the weight value itself changes (so editing other
  // profile fields doesn't create phantom data points).
  const lastWeighedKg = useRef<number | null>(null);

  // Load once.
  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((loaded) => {
        if (cancelled) return;
        // Merge defaults *behind* the loaded record so new fields added in
        // later schema versions (e.g. dietPreference) get a sane value when
        // an existing IDB / Supabase profile lacks them.
        if (loaded) setProfileState({ ...defaultProfile, ...loaded });
        setIsHydrated(true);
      })
      .catch((err) => {
        // IndexedDB unavailable — proceed with the in-memory default but
        // surface the failure so the user knows their changes won't stick.
        reportStorageError(err);
        if (!cancelled) setIsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [defaultProfile]);

  // Debounced write. Gated on `isHydrated` so we don't immediately write
  // the synthetic default over a freshly-loaded profile.
  useEffect(() => {
    if (!isHydrated) return;
    const t = window.setTimeout(() => {
      saveProfile(profile)
        .then(() => {
          reportStorageOk();
          // Tell other components (the sidebar UserMenu, primarily) that
          // the profile they may be reading independently from IDB has a
          // fresh value to pick up.
          notifyProfileChanged();
        })
        .catch(reportStorageError);
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [profile, isHydrated]);

  // Auto-capture weight changes into the weightHistory store. Seeds
  // `lastWeighedKg` from the freshly-loaded profile on first hydrate (no
  // write); subsequent changes fire a debounced weigh-in for today.
  useEffect(() => {
    if (!isHydrated) return;
    if (lastWeighedKg.current === null) {
      lastWeighedKg.current = profile.weight;
      return;
    }
    if (profile.weight === lastWeighedKg.current) return;
    const target = profile.weight;
    const t = window.setTimeout(() => {
      saveWeightEntry(todayKey(), target)
        .then(() => {
          lastWeighedKg.current = target;
          bumpPending();
        })
        .catch(reportStorageError);
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [profile.weight, isHydrated]);

  // Public setters — bump the sync-pending counter so the topbar pill
  // can signal "you have local changes." Internal hydration uses
  // setProfileState directly to avoid spurious pending signals.
  const setProfile = useCallback((next: PersonalInfo) => {
    bumpPending();
    setProfileState(next);
  }, []);

  const patchProfile = useCallback(
    (name: keyof PersonalInfo, value: PersonalInfo[keyof PersonalInfo]) => {
      bumpPending();
      setProfileState((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  return { profile, setProfile, patchProfile, isHydrated };
}
