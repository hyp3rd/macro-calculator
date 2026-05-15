/** Centralized external links — keeps the GitHub URL in one place
 *  rather than scattered across the footer, bug-report form, and the
 *  OFF User-Agent string. Update here when the canonical URL changes. */
export const GITHUB_REPO_URL = "https://github.com/hyp3rd/macro-calculator";

/** Build a pre-filled GitHub "new issue" URL. Title and body are URL-
 *  encoded; labels are comma-separated. Length is capped (~7 KB) because
 *  some browsers truncate very long query strings — most issues fit
 *  comfortably under that ceiling. */
export function buildIssueUrl(opts: {
  title: string;
  body: string;
  labels?: string[];
}): string {
  const params = new URLSearchParams();
  // Trim title to keep the URL well under ~8 KB even with a verbose body.
  params.set("title", opts.title.slice(0, 200));
  params.set("body", opts.body.slice(0, 7_000));
  if (opts.labels && opts.labels.length > 0) {
    params.set("labels", opts.labels.join(","));
  }
  return `${GITHUB_REPO_URL}/issues/new?${params.toString()}`;
}
