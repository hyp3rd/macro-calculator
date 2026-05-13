"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isSupabaseConfigured();

  async function send() {
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
    setSending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signInError) throw signInError;
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
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
            Enter your email and we&apos;ll send you a one-click link to sign
            in. No passwords, no accounts to remember.
          </p>
        </div>

        {!configured && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            Supabase isn&apos;t configured for this build. See README → Supabase
            setup to add the env vars.
          </div>
        )}

        {sent ? (
          <div
            role="status"
            className="space-y-3 rounded-md border border-border/60 bg-card px-4 py-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Mail className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-xs text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="font-medium text-foreground">{email}</span>. Open
              it on this device to finish signing in.
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
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
                disabled={sending || !configured}
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
              disabled={sending || !configured}
            >
              {sending ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>
        )}

        <p className="text-[11px] text-muted-foreground">
          You can keep using the app without signing in. Sign in to sync your
          data across devices.
        </p>
      </div>
    </div>
  );
}
