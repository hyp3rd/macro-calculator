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
import { buildExport, downloadExport } from "@/lib/export";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { useState } from "react";
import {
  Download,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  UserCircle2,
} from "lucide-react";
import Link from "next/link";

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
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function signOut() {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function handleExport() {
    setExportError(null);
    setExportBusy(true);
    try {
      const bundle = await buildExport(
        user ? { id: user.id, email: user.email ?? null } : null,
      );
      downloadExport(bundle);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportBusy(false);
    }
  }

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
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/60 bg-card px-3 text-sm font-medium hover:bg-accent"
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
            Download a copy of everything stored in this browser.
          </p>
        </header>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Profile, daily logs, weight history, custom foods, and meal
              templates — exported as a single JSON file.
            </p>
            {exportError && (
              <p
                role="alert"
                className="text-red-600"
              >
                {exportError}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportBusy}
            className="h-8 shrink-0 gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            {exportBusy ? "Preparing…" : "Export JSON"}
          </Button>
        </div>
      </section>

      {user && (
        <DeleteAccountSection
          userEmail={user.email ?? null}
          configured={!isUnconfigured}
        />
      )}
    </div>
  );
}

function ChangeEmailSection({ currentEmail }: { currentEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setNext("");
    setError(null);
    setSent(false);
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
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
      // Supabase sends a confirmation link to *both* the old and new
      // addresses; the change only takes effect once the link in the new
      // inbox is clicked. The session here keeps the old email until then.
      const { error: e } = await supabase.auth.updateUser({ email: trimmed });
      if (e) throw e;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update email.");
    } finally {
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
        {sent ? (
          <div
            role="status"
            className="space-y-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 text-foreground">
              <Mail className="h-3.5 w-3.5" />
              <p className="font-medium">Confirmation sent</p>
            </div>
            <p className="text-muted-foreground">
              Click the link in the email sent to{" "}
              <span className="font-medium text-foreground">{next}</span> to
              finish the change. You&apos;ll keep using{" "}
              <span className="font-medium text-foreground">
                {currentEmail ?? "your current address"}
              </span>{" "}
              to sign in until then.
            </p>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={reset}
            >
              Done
            </button>
          </div>
        ) : !open ? (
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
              onClick={() => setOpen(true)}
              className="h-8 gap-1.5"
            >
              <Mail className="h-3.5 w-3.5" />
              Change
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submit}
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
                {busy ? "Sending…" : "Send confirmation"}
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
