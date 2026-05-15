"use client";

import { Footer } from "@/components/shell/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";

type Stage = { kind: "request" } | { kind: "verify"; email: string };

export default function LoginPage() {
  const [stage, setStage] = useState<Stage>({ kind: "request" });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  async function sendCode() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase isn't configured. See README → Supabase setup.");
      return;
    }
    setBusy(true);
    try {
      // Same Supabase email contains both a magic link and a numeric OTP
      // (length is configurable in Supabase: Auth → Providers → Email →
      // OTP length; commonly 6 or 8). The code-paste path is cross-device-
      // safe (no PKCE verifier on this browser required) and avoids the
      // cookie-propagation failure modes of the link click.
      const { error: e } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          // Click-the-link fallback: Supabase's verify endpoint will
          // redirect here with `?code=…` after PKCE verification, and
          // /auth/callback exchanges the code for a session. Only works
          // when the user clicks the link on the same browser they
          // requested it from (PKCE verifier lives in cookies on this
          // origin). The numeric-code path below is the cross-device path.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (e) throw e;
      setCode("");
      setStage({ kind: "verify", email: trimmed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (stage.kind !== "verify") return;
    setError(null);
    const token = code.trim();
    // OTP length is configurable in Supabase (default 6, commonly 6 or 8).
    // Accept any digits-only string in a sensible range; let Supabase be
    // the authority on whether the value matches.
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
      const { error: e } = await supabase.auth.verifyOtp({
        email: stage.email,
        token,
        type: "email",
      });
      if (e) throw e;
      // Hard navigation so the proxy sees the new session cookie on the
      // very next request and rehydrates everywhere.
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify code.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to app
          </Link>

          <div className="space-y-1">
            <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              We&apos;ll email you a one-time code. No passwords.
            </p>
          </div>

          {!configured && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              Supabase isn&apos;t configured for this build. See README →
              Supabase setup to add the env vars.
            </div>
          )}

          {stage.kind === "request" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendCode();
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={busy || !configured}
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
              <Button
                type="submit"
                className="w-full"
                disabled={busy || !configured}
              >
                {busy ? "Sending…" : "Email me a code"}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                verifyCode();
              }}
              className="space-y-4"
            >
              <div
                role="status"
                className="space-y-3 rounded-md border border-border/60 bg-card px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Check your email</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  We sent a sign-in email to{" "}
                  <span className="font-medium text-foreground">
                    {stage.email}
                  </span>
                  . Paste the numeric code below, or click the link in the email
                  (works only on this browser). If you only see a link and no
                  code, the Supabase email template hasn&apos;t been customized
                  yet — see README → Supabase setup.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="code"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Code
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                  autoComplete="one-time-code"
                  maxLength={10}
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="••••••••"
                  className="font-mono tabular-nums text-center text-lg tracking-[0.3em]"
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

              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy || code.length < 4}
                >
                  {busy ? "Verifying…" : "Sign in"}
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  disabled={busy}
                  onClick={() => {
                    setStage({ kind: "request" });
                    setError(null);
                  }}
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}

          <p className="text-[11px] text-muted-foreground">
            You can keep using the app without signing in. Sign in to sync your
            data across devices.
          </p>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            By signing in, you confirm that you&apos;ve read and agree to the{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Terms &amp; Conditions
            </Link>
            , including the health and data-handling disclaimers.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
