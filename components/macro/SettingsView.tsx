"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUser } from "@/hooks/use-user";
import { clearAllStores } from "@/lib/db";
import {
  buildExport,
  downloadExport,
  exportPhaseIndex,
  type ExportProgress,
} from "@/lib/export";
import { planFromFile, planImport, type ImportPlan } from "@/lib/import";
import {
  downloadExport as downloadCloudExport,
  uploadExport,
} from "@/lib/storage/exports";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useRef, useState } from "react";
import {
  Cloud,
  CloudUpload,
  Download,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  Upload,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";
import { CloudExportsList } from "./CloudExportsList";
import { ImportPreviewDialog } from "./ImportPreviewDialog";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SettingsView() {
  const { user, isLoaded, isUnconfigured } = useUser();

  // Export state: progress-aware, supports save-to-disk and save-to-cloud.
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const [cloudRefreshKey, setCloudRefreshKey] = useState(0);

  // Import state: preview-then-apply flow. The dialog renders the diff
  // and runs `importBundle` only after the user clicks Apply.
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [importRaw, setImportRaw] = useState<unknown>(null);
  const [importSource, setImportSource] = useState("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

  async function signOut() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  /** Build a fresh export bundle, emitting progress events as each store
   *  is read. Returns the bundle so the two save paths (disk, cloud) can
   *  share the build phase. */
  async function buildWithProgress() {
    setExportError(null);
    setExportBusy(true);
    setExportProgress(null);
    try {
      const bundle = await buildExport(
        user ? { id: user.id, email: user.email ?? null } : null,
        (e) => setExportProgress(e),
      );
      return bundle;
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
      throw e;
    }
  }

  async function handleExportToDisk() {
    try {
      const bundle = await buildWithProgress();
      downloadExport(bundle);
    } catch {
      // buildWithProgress already set the error.
    } finally {
      setExportBusy(false);
      setExportProgress(null);
    }
  }

  async function handleExportToCloud() {
    if (!user) {
      setExportError("Sign in to save to cloud.");
      return;
    }
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setExportError("Supabase isn't configured.");
      return;
    }
    try {
      const bundle = await buildWithProgress();
      await uploadExport(supabase, user.id, bundle);
      // Bumps the CloudExportsList refreshKey so it pulls the new entry.
      setCloudRefreshKey((k) => k + 1);
    } catch (e) {
      // buildWithProgress sets exportError on its failures; the upload
      // call can also fail with its own message.
      if (e instanceof Error) setExportError(e.message);
    } finally {
      setExportBusy(false);
      setExportProgress(null);
    }
  }

  /** File-picker → parse → plan → open preview dialog. The dialog runs
   *  the actual `importBundle` after the user confirms. */
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the input so picking the same file twice in a row re-fires onChange.
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const { raw, plan } = await planFromFile(file);
      setImportRaw(raw);
      setImportPlan(plan);
      setImportSource(`file ${file.name}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  /** Cloud-export-list click → fetch the blob → parse → plan → preview. */
  async function handleCloudPick(entry: { path: string; exportedAt: string }) {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setImportError("Supabase isn't configured.");
      return;
    }
    setImportError(null);
    setImportBusy(true);
    try {
      const blob = await downloadCloudExport(supabase, entry.path);
      const text = await blob.text();
      const raw: unknown = JSON.parse(text);
      const plan = await planImport(raw);
      setImportRaw(raw);
      setImportPlan(plan);
      setImportSource(
        `cloud export ${new Date(entry.exportedAt).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}`,
      );
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImportBusy(false);
    }
  }

  const exportStep = exportProgress
    ? exportPhaseIndex(exportProgress.phase)
    : null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <header className="border-b border-border/60 px-5 py-3">
          <h3 className="text-sm font-semibold tracking-tight">Account</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Identity, sync, and sign-out.
          </p>
        </header>
        <div className="px-5 py-4">
          {!isLoaded ? (
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
              <div className="h-2 w-48 animate-pulse rounded bg-muted/50" />
            </div>
          ) : isUnconfigured ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-foreground">
                Supabase isn&apos;t configured for this build.
              </p>
              <p className="text-xs leading-relaxed">
                Sign-in and multi-device sync are disabled. The app is running
                in <span className="font-medium">guest mode</span> — everything
                is stored in IndexedDB on this device. See README → Supabase
                setup to enable accounts.
              </p>
            </div>
          ) : user ? (
            <div className="space-y-4">
              <Row
                icon={<UserCircle2 className="h-4 w-4" />}
                label="Signed in as"
                value={user.email ?? "Anonymous"}
              />
              <Row
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Member since"
                value={formatDate(user.created_at)}
              />
              <div className="flex items-center justify-between border-t border-border/60 pt-4">
                <div className="text-xs text-muted-foreground">
                  Sign out clears the session on this device. Your data stays in
                  IndexedDB and re-syncs when you sign back in.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={signOut}
                  className="h-8 gap-1.5"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">Not signed in</p>
                <p className="text-xs text-muted-foreground">
                  Sign in to back up your data and sync across devices.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border/60 bg-card px-3 text-sm font-medium hover:bg-accent"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Link>
            </div>
          )}
        </div>
      </section>

      {user && <ChangeEmailSection currentEmail={user.email ?? null} />}

      <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
        <header className="border-b border-border/60 px-5 py-3">
          <h3 className="text-sm font-semibold tracking-tight">Your data</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Export a backup or merge an existing one back in. Save-to-cloud and
            cloud listings are signed-in only.
          </p>
        </header>
        <div className="space-y-4 px-5 py-4">
          {/* ─── Export controls ──────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
              <p>
                Profile, daily logs, weight history, custom foods, meal
                templates, and recipes — packaged as a single JSON bundle.
              </p>
              {exportError && (
                <p
                  role="alert"
                  className="text-red-600"
                >
                  {exportError}
                </p>
              )}
              {exportProgress && exportStep && (
                <p className="flex items-center gap-1.5 font-mono text-[11px] text-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Exporting{" "}
                  {exportProgress.phase === "done"
                    ? "…"
                    : `${exportProgress.phase} (${exportStep.step + 1}/${exportStep.total})`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportToDisk}
                disabled={exportBusy}
                className="h-8 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {exportBusy && !user ? "Preparing…" : "Save to disk"}
              </Button>
              {user && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExportToCloud}
                  disabled={exportBusy}
                  className="h-8 gap-1.5"
                  title="Upload to your private cloud bucket"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  Save to cloud
                </Button>
              )}
            </div>
          </div>

          {/* ─── Cloud exports list (signed-in only) ───────────────── */}
          {user && (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Cloud className="h-3 w-3" />
                <span>Cloud backups</span>
              </div>
              <CloudExportsList
                refreshKey={cloudRefreshKey}
                onPickForImport={(entry) => handleCloudPick(entry)}
              />
            </div>
          )}

          {/* ─── Import (always available) ─────────────────────────── */}
          <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
            <div className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">
              <p>
                Restore from a previous export. We show a diff first; nothing is
                applied until you confirm. Re-importing the same bundle is safe
                — rows merge by id.
              </p>
              {importError && (
                <p
                  role="alert"
                  className="text-red-600"
                >
                  {importError}
                </p>
              )}
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => importInputRef.current?.click()}
              disabled={importBusy}
              className="h-8 shrink-0 gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              {importBusy ? "Reading…" : "Import from file"}
            </Button>
          </div>
        </div>
      </section>

      <ImportPreviewDialog
        open={importPlan !== null}
        onOpenChange={(open) => {
          if (!open) {
            setImportPlan(null);
            setImportRaw(null);
          }
        }}
        plan={importPlan}
        raw={importRaw}
        source={importSource}
        onApplied={() => {
          // Force a reload so every hook re-hydrates from IDB.
          window.setTimeout(() => window.location.reload(), 600);
        }}
      />

      {user && (
        <DeleteAccountSection
          userEmail={user.email ?? null}
          configured={!isUnconfigured}
        />
      )}
    </div>
  );
}

/** Three-state form: closed → entering-email → verifying-code → closed.
 *  Matches the sign-in OTP UX (login/page.tsx) rather than relying on
 *  Supabase's magic-link, which is fragile cross-device (only works on
 *  the browser the request originated from). */
type ChangeEmailStage =
  | { kind: "closed" }
  | { kind: "request" }
  | { kind: "verify"; email: string };

function ChangeEmailSection({ currentEmail }: { currentEmail: string | null }) {
  const [stage, setStage] = useState<ChangeEmailStage>({ kind: "closed" });
  const [next, setNext] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setNext("");
    setCode("");
    setError(null);
    setStage({ kind: "closed" });
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = next.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (trimmed === currentEmail?.toLowerCase()) {
      setError("That's already your current email.");
      return;
    }
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase isn't configured.");
      return;
    }
    setBusy(true);
    try {
      // `updateUser({ email })` triggers Supabase to send a confirmation
      // email containing both a link and (when the template includes
      // `{{ .Token }}`) an OTP code. We use the code path.
      const { error: e } = await supabase.auth.updateUser({ email: trimmed });
      if (e) throw e;
      setStage({ kind: "verify", email: trimmed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send confirmation.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "verify") return;
    setError(null);
    const token = code.trim();
    if (!/^\d{4,10}$/.test(token)) {
      setError("Enter the numeric code from your email.");
      return;
    }
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase isn't configured.");
      return;
    }
    setBusy(true);
    try {
      // For an email-change confirmation, Supabase expects the *new*
      // email + the OTP from that inbox. On success the session's email
      // claim flips to the new address.
      const { error: e } = await supabase.auth.verifyOtp({
        email: stage.email,
        token,
        type: "email_change",
      });
      if (e) throw e;
      // Hard navigation so the proxy and every component see the new
      // session email on the very next request.
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify code.");
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <header className="border-b border-border/60 px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight">Email</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Change the address you sign in with.
        </p>
      </header>
      <div className="space-y-4 px-5 py-4">
        {stage.kind === "closed" && (
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="text-muted-foreground">Current:</span>{" "}
              <span className="font-medium text-foreground">
                {currentEmail ?? "—"}
              </span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStage({ kind: "request" })}
              className="h-8 gap-1.5"
            >
              <Mail className="h-3.5 w-3.5" />
              Change
            </Button>
          </div>
        )}

        {stage.kind === "request" && (
          <form
            onSubmit={requestCode}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="new-email"
                className="text-xs font-medium text-muted-foreground"
              >
                New email
              </Label>
              <Input
                id="new-email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="you@example.com"
                disabled={busy}
              />
            </div>
            {error && (
              <p
                role="alert"
                className="text-xs text-red-600"
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={busy || !next.trim()}
                className="h-8"
              >
                {busy ? "Sending…" : "Email me a code"}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                disabled={busy}
                onClick={reset}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {stage.kind === "verify" && (
          <form
            onSubmit={verifyCode}
            className="space-y-3"
          >
            <div
              role="status"
              className="space-y-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 text-foreground">
                <Mail className="h-3.5 w-3.5" />
                <p className="font-medium">Code sent</p>
              </div>
              <p className="text-muted-foreground">
                Enter the numeric code we emailed to{" "}
                <span className="font-medium text-foreground">
                  {stage.email}
                </span>
                . The change takes effect as soon as you verify.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="email-change-code"
                className="text-xs font-medium text-muted-foreground"
              >
                Code
              </Label>
              <Input
                id="email-change-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d*"
                autoFocus
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="123456"
                disabled={busy}
                className="font-mono tracking-widest"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="text-xs text-red-600"
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={busy || !code.trim()}
                className="h-8"
              >
                {busy ? "Verifying…" : "Verify & change"}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                disabled={busy}
                onClick={reset}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function DeleteAccountSection({
  userEmail,
  configured,
}: {
  userEmail: string | null;
  configured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = (userEmail ?? "").trim().toLowerCase();
  const matches = expected !== "" && typed.trim().toLowerCase() === expected;

  function onOpenChange(next: boolean) {
    if (busy) return; // don't let the dialog close mid-delete
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function confirm() {
    if (!matches) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/delete-account", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      // Wipe the local cache so a future sign-in on this device starts
      // empty rather than re-uploading the deleted user's data.
      await clearAllStores();
      const supabase = getSupabaseBrowser();
      if (supabase) await supabase.auth.signOut();
      // Hard navigation so the proxy sees the cleared cookies on the very
      // next request and the new page mounts with a fresh client.
      window.location.assign("/login");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete account.");
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-red-500/30 bg-card">
      <header className="border-b border-red-500/30 bg-red-500/5 px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight text-red-700 dark:text-red-400">
          Delete account
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Permanently removes your account and all synced data. Can&apos;t be
          undone.
        </p>
      </header>
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <p className="text-xs text-muted-foreground">
          We&apos;ll delete your profile, daily logs, weight history, custom
          foods, and meal templates from Supabase, plus everything saved on this
          device.
        </p>
        <AlertDialog
          open={open}
          onOpenChange={onOpenChange}
        >
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 border-red-500/40 text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this account?</AlertDialogTitle>
              <AlertDialogDescription>
                This is permanent. Your Supabase account and all synced data
                will be deleted; your local data on this device will also be
                wiped.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5 pt-2">
              <Label
                htmlFor="confirm-email"
                className="text-xs font-medium text-muted-foreground"
              >
                Type{" "}
                <span className="font-mono text-foreground">
                  {userEmail ?? "your email"}
                </span>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-email"
                type="email"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={busy}
                placeholder={userEmail ?? ""}
              />
              {!configured && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Supabase isn&apos;t configured on this build — deletion will
                  fail.
                </p>
              )}
              {error && (
                <p
                  role="alert"
                  className="text-xs text-red-600"
                >
                  {error}
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault(); // keep the dialog open until we navigate
                  confirm();
                }}
                disabled={!matches || busy}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {busy ? "Deleting…" : "Delete account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
