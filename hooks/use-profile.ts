"use client";

import type { PersonalInfo } from "@/components/macro/types";
import { getProfile, saveProfile } from "@/lib/db";
import { reportStorageError, reportStorageOk } from "@/lib/storage-status";
import { useCallback, useEffect, useState } from "react";

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

  // Load once.
  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) setProfileState(loaded);
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
  }, []);

  // Debounced write. Gated on `isHydrated` so we don't immediately write
  // the synthetic default over a freshly-loaded profile.
  useEffect(() => {
    if (!isHydrated) return;
    const t = window.setTimeout(() => {
      saveProfile(profile).then(reportStorageOk).catch(reportStorageError);
    }, WRITE_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [profile, isHydrated]);

  const patchProfile = useCallback(
    (name: keyof PersonalInfo, value: PersonalInfo[keyof PersonalInfo]) => {
      setProfileState((prev) => ({ ...prev, [name]: value }));
    },
    [],
  );

  return { profile, setProfile: setProfileState, patchProfile, isHydrated };
}
