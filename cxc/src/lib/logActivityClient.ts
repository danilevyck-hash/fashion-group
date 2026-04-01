/**
 * Client-side: log activity via POST to /api/activity.
 * The API reads user info from the session cookie automatically.
 */
export function logActivityClient(params: {
  action: string;
  module: string;
  details?: Record<string, unknown>;
}) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {
    /* never fail the parent operation */
  });
}
