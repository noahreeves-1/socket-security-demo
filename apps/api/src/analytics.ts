import { analyticsSummarySchema, type AnalyticsSummary, type Order } from "./schemas.js";

export const ANALYTICS_TIMEOUT_MS = 3_000;

export async function requestAnalytics(
  orders: Order[],
  analyticsUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = ANALYTICS_TIMEOUT_MS,
): Promise<AnalyticsSummary> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Analytics request timed out."));
    }, timeoutMs);
  });
  try {
    // Cover the connection and response body even if upstream ignores abort.
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(`${analyticsUrl}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ orders }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Analytics returned an unsuccessful response.");
        return analyticsSummarySchema.parse(await response.json());
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
