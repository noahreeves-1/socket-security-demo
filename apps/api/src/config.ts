import { z } from "zod";

function isHttpUrl(value: string, originOnly: boolean): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password && !url.search && !url.hash
      && (!originOnly || value === url.origin);
  } catch {
    return false;
  }
}

const configurationSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)).default(3001),
  HOST: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/).default("127.0.0.1"),
  WEB_ORIGIN: z.string().refine((value) => isHttpUrl(value, true)).default("http://127.0.0.1:5173"),
  ANALYTICS_URL: z.string().refine((value) => isHttpUrl(value, false)).default("http://127.0.0.1:8000"),
});

export interface ApiConfig {
  port: number;
  host: string;
  webOrigin: string;
  analyticsUrl: string;
}

export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  const result = configurationSchema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].join(", ");
    throw new Error(`Invalid API configuration: ${fields}.`);
  }
  return {
    port: result.data.PORT,
    host: result.data.HOST,
    webOrigin: result.data.WEB_ORIGIN,
    analyticsUrl: result.data.ANALYTICS_URL.replace(/\/+$/, ""),
  };
}
