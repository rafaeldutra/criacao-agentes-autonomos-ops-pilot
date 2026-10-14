import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export const DEFAULT_API_URL: string = stripTrailingSlash(
  import.meta.env.VITE_OPSPILOT_API_URL ?? "http://localhost:3000",
);

export const STORAGE_KEYS = { apiUrl: "opspilot.apiUrl", theme: "opspilot.theme" } as const;

export const themeSchema = z.enum(["light", "dark", "system"]);
export type Theme = z.infer<typeof themeSchema>;

export interface Settings {
  apiUrl: string;
  theme: Theme;
}

export interface LoadedSettings extends Settings {
  /** false when localStorage is unavailable: the settings work but will not be remembered. */
  persisted: boolean;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const apiUrlSchema = z
  .string()
  .trim()
  .min(1, "Informe a URL da API.")
  .transform((value, ctx) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Informe uma URL completa, por exemplo http://localhost:3000." });
      return z.NEVER;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: "Use um endereço http:// ou https://." });
      return z.NEVER;
    }
    if (url.username || url.password) {
      ctx.addIssue({ code: "custom", message: "A URL não pode conter usuário ou senha." });
      return z.NEVER;
    }
    return stripTrailingSlash(`${url.origin}${url.pathname}`);
  });

/** Validates a user-provided API URL (http/https only, no credentials, no trailing slash). */
export function parseApiUrl(input: string): { ok: true; url: string } | { ok: false; message: string } {
  const result = apiUrlSchema.safeParse(input);
  if (result.success) return { ok: true, url: result.data };
  return { ok: false, message: result.error.issues[0]?.message ?? "URL inválida." };
}

function getStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSettings(): LoadedSettings {
  const storage = getStorage();
  const defaults: LoadedSettings = { apiUrl: DEFAULT_API_URL, theme: "system", persisted: false };
  if (!storage) return defaults;
  try {
    const rawUrl = storage.getItem(STORAGE_KEYS.apiUrl);
    const rawTheme = storage.getItem(STORAGE_KEYS.theme);
    const parsedUrl = rawUrl === null ? undefined : parseApiUrl(rawUrl);
    const parsedTheme = themeSchema.safeParse(rawTheme);
    return {
      apiUrl: parsedUrl?.ok ? parsedUrl.url : DEFAULT_API_URL,
      theme: parsedTheme.success ? parsedTheme.data : "system",
      persisted: true,
    };
  } catch {
    return defaults;
  }
}

/** Persists the settings; returns whether they were actually stored. */
export function saveSettings(settings: Settings): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    if (settings.apiUrl === DEFAULT_API_URL) storage.removeItem(STORAGE_KEYS.apiUrl);
    else storage.setItem(STORAGE_KEYS.apiUrl, settings.apiUrl);
    storage.setItem(STORAGE_KEYS.theme, settings.theme);
    return true;
  } catch {
    return false;
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export interface SettingsApi extends LoadedSettings {
  setApiUrl(url: string): void;
  setTheme(theme: Theme): void;
}

export function useSettings(): SettingsApi {
  const [state, setState] = useState<LoadedSettings>(loadSettings);

  useEffect(() => {
    applyTheme(state.theme);
  }, [state.theme]);

  const update = useCallback((patch: Partial<Settings>) => {
    setState((current) => {
      const next = { ...current, ...patch };
      const persisted = saveSettings(next);
      return { ...next, persisted };
    });
  }, []);

  const setApiUrl = useCallback((apiUrl: string) => update({ apiUrl }), [update]);
  const setTheme = useCallback(
    (theme: Theme) => {
      applyTheme(theme);
      update({ theme });
    },
    [update],
  );

  return { ...state, setApiUrl, setTheme };
}
