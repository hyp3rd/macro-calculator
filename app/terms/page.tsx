import { GITHUB_REPO_URL } from "@/lib/links";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — Maqro",
  description:
    "Terms and conditions for using Maqro, including health disclaimers, data handling, and third-party services.",
};

/** Plain server-rendered page — no client state, no interactivity. The
 *  content is intentionally readable: short paragraphs, declarative
 *  sentences, no fine print buried in a wall of text. The maintainer's
 *  draft, not legal advice (see the note up top). */
export default function TermsPage() {
  const lastUpdated = "2026-05-15";
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to app
      </Link>

      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Terms &amp; Conditions
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Last updated: <time dateTime={lastUpdated}>{lastUpdated}</time>
      </p>

      <aside className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        <p className="font-medium">This is the maintainer&apos;s draft.</p>
        <p className="mt-1 text-xs leading-relaxed">
          Written in good faith but <strong>not legal advice</strong> and not
          reviewed by counsel. If you operate a deployment of Maqro for users
          beyond yourself, have a lawyer in your jurisdiction review and adapt
          this document for your context. Source for this page is in the Git
          repository — issue a pull request if something needs fixing.
        </p>
      </aside>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          1. About this app
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Maqro (&ldquo;the app&rdquo;) is an open-source personal macro
          calculator, meal planner, and weight-tracking journal. It is provided
          free of charge and without warranty. The source code and complete
          history of changes are public at{" "}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {GITHUB_REPO_URL.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          2. Acceptance
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          By using the app you confirm that you have read these terms and agree
          to them. If you do not agree, do not use the app.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          3. Health, safety, and food disclaimer
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Maqro produces estimates and suggestions. It is{" "}
          <strong>not a medical device</strong>, not a substitute for
          professional advice, and not a replacement for consultation with a
          qualified physician, registered dietitian, mental health professional,
          or other healthcare provider.
        </p>
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong>Caloric and macronutrient estimates&nbsp;</strong> are
            derived from textbook formulas (Mifflin–St Jeor, activity
            multipliers) that are accurate on average but may diverge 10–20% for
            any individual. Calibrate against your own measured outcomes; do not
            rely on the app&apos;s targets as ground truth.
          </li>
          <li>
            <strong>Food data</strong> comes from a built-in catalog, your own
            custom entries, and the public Open Food Facts database. Open Food
            Facts is community-maintained — its entries can be incomplete,
            mis-labelled, or outdated. Verify nutrient values against the actual
            product label before consuming.
          </li>
          <li>
            <strong>Allergies and intolerances</strong> are filtered best-effort
            by name matching, which is inherently imperfect.
            <strong>
              {" "}
              Always read the ingredient list of the actual product
            </strong>{" "}
            before eating it. The app&apos;s allergy filter is a convenience,
            not a safety mechanism. Do not rely on it if a mistake could harm
            you.
          </li>
          <li>
            <strong>AI-generated meal plans and recipes</strong> are suggestions
            only. The model can produce combinations that are nutritionally fine
            but culturally odd, or vice versa, and may not account for specific
            medical conditions, medications (e.g. MAOIs and tyramine, warfarin
            and vitamin K), pregnancy, breastfeeding, religious dietary laws, or
            other constraints not captured in your profile. Review every
            generated plan against your actual situation.
          </li>
          <li>
            <strong>Weight goals</strong> are not appropriate for everyone. If
            you have or have had an eating disorder, disordered relationship
            with food, or are at elevated risk, do not use this app without
            guidance from a qualified professional. Aggressive caloric deficits
            can be harmful at any body composition.
          </li>
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The maintainer of Maqro <strong>is not responsible</strong> for health
          outcomes, allergic reactions, weight changes, eating patterns, or any
          other physical, mental, or emotional consequence of acting on
          information the app provides.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          4. No warranties
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The app is provided <strong>&ldquo;as is&rdquo;</strong>, without
          warranty of any kind, express or implied, including but not limited to
          fitness for a particular purpose, accuracy, merchantability, and
          non-infringement. The maintainer makes no guarantee that the app will
          be available, error-free, or continuously maintained.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          5. Limitation of liability
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          To the maximum extent permitted by applicable law, the maintainer of
          Maqro is not liable for any direct, indirect, incidental, special,
          consequential, or exemplary damages arising out of or in connection
          with your use of the app. This includes, without limitation, damages
          for personal injury, loss of profits, loss of data, or business
          interruption.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Some jurisdictions do not allow the exclusion of certain warranties or
          limitations of liability — in those jurisdictions, the above
          exclusions and limitations apply only to the extent permitted.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          6. Privacy and data handling
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Maqro is built around the principle that your data stays yours. We do
          not run analytics, advertising, or third-party tracking on the app.
        </p>
        <h3 className="mt-3 text-sm font-medium text-foreground">
          What we store
        </h3>
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong>Locally on your device (always):&nbsp;</strong> profile,
            daily meal logs, weight history, custom foods, meal templates, and
            recipes. Stored in IndexedDB by your browser. Clearing your
            browser&apos;s site data removes everything.
          </li>
          <li>
            <strong>In your Supabase project (only when signed in):</strong> the
            same data, mirrored row-for-row so you can sync across devices. Each
            table has row-level security, so only you can read your own rows.
            The deployment owner controls the Supabase project; the maintainer
            of the open-source code does not.
          </li>
          <li>
            <strong>Cloud exports (only when you click Save to cloud):</strong>{" "}
            JSON snapshots stored in a private per-user Supabase Storage bucket.
            You can list, download, and delete them at any time from Settings →
            Your data.
          </li>
        </ul>
        <h3 className="mt-3 text-sm font-medium text-foreground">
          What we do not collect
        </h3>
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
          <li>No analytics, telemetry, or usage tracking.</li>
          <li>
            No advertising identifiers, no third-party marketing pixels, no
            fingerprinting.
          </li>
          <li>No social media scripts.</li>
          <li>No cross-site cookies.</li>
        </ul>
        <h3 className="mt-3 text-sm font-medium text-foreground">Cookies</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Maqro uses only <strong>strictly necessary cookies</strong>: when you
          sign in, Supabase sets an HTTP-only session cookie so the server can
          recognize you on the next request. The cookie is deleted when you sign
          out or when the session expires. We do not set any other cookies, and
          we do not need a cookie banner because we do not use non-essential
          cookies.
        </p>
        <h3 className="mt-3 text-sm font-medium text-foreground">
          Account deletion
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Settings → Account includes a <strong>Delete account</strong> button
          that removes your Supabase user record. The cascade in the database
          wipes every synced row. The local IndexedDB data on the device is also
          cleared as part of the same action.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          7. Third-party services
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          When you use specific features, the app communicates with the
          following third parties. Each is governed by its own terms and privacy
          policy:
        </p>
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong>Supabase</strong> (auth + database + storage, when signed
            in) — receives your email address for sign-in OTPs and stores the
            rows above. See{" "}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              supabase.com/privacy
            </a>
            .
          </li>
          <li>
            <strong>Open Food Facts</strong> (food search) — receives your
            search queries while you type into the food picker. Search history
            is not associated with your account by us. See{" "}
            <a
              href="https://world.openfoodfacts.org/legal"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              openfoodfacts.org/legal
            </a>
            .
          </li>
          <li>
            <strong>Anthropic&nbsp;</strong> (Claude AI, only when AI features
            are enabled and only when you click Auto-fill or Generate recipe) —
            receives your diet preference, allergies, cuisine choices, custom
            foods, and the current request. The maintainer cannot guarantee how
            third parties handle this data; review the relevant provider&apos;s
            policy. See{" "}
            <a
              href="https://www.anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              anthropic.com/privacy
            </a>
            .
          </li>
        </ul>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          8. AI features
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          AI features (Auto-fill meal plan, Generate recipe) are{" "}
          <strong>opt-in</strong> per deployment. They produce suggestions, not
          prescriptions. The model may hallucinate, omit allergens despite being
          told to filter, suggest unrealistic portions, or pair foods in ways
          that aren&apos;t appropriate for you. Always sanity-check AI output
          before acting on it, and never rely on the AI to keep you safe from a
          known allergen — read the ingredient list yourself.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          9. Open source
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Maqro is licensed under Apache License 2.0. The full source and
          license terms are at{" "}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {GITHUB_REPO_URL.replace(/^https?:\/\//, "")}
          </a>
          . If you fork or redeploy the app, these terms describe the
          maintainer&apos;s position; your own deployment&apos;s terms may
          differ.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">
          10. Changes to these terms
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          These terms may be updated. Material changes will be accompanied by a
          bumped &ldquo;Last updated&rdquo; date at the top of this page.
          Continued use after a change constitutes acceptance of the updated
          terms. The full revision history is in the Git log of this repository.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-base font-semibold tracking-tight">11. Contact</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          For questions, security reports, or suggestions, open an issue at{" "}
          <a
            href={`${GITHUB_REPO_URL}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            {GITHUB_REPO_URL.replace(/^https?:\/\//, "")}/issues
          </a>
          . Please do not include sensitive personal data in public issues.
        </p>
      </section>
    </div>
  );
}
