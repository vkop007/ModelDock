import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/puppeteer";
import { PROVIDER_URLS, browserManager } from "@/lib/puppeteer/browser-manager";
import { getCookiesBatch } from "@/lib/puppeteer/cookie-utils";
import { CookieEntry, LLMProvider, PROVIDERS } from "@/types";

export const PUBLIC_API_PROVIDERS = Object.keys(PROVIDERS) as LLMProvider[];

export const PUBLIC_API_BROWSER_IDS = [
  "chrome",
  "chrome-beta",
  "chromium",
  "edge",
  "brave",
  "arc",
  "vivaldi",
  "opera",
  "firefox",
] as const;

export type PublicApiBrowserId = (typeof PUBLIC_API_BROWSER_IDS)[number];

type StoredSessionSource = "manual" | PublicApiBrowserId;

interface CookieLike {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

interface StoredProviderSession {
  cookies: CookieEntry[];
  source: StoredSessionSource;
  updatedAt: number;
}

interface ApiConfigFile {
  providers: Partial<Record<LLMProvider, StoredProviderSession>>;
}

const API_CONFIG_DIR = path.join(process.cwd(), ".browser-data");
const API_CONFIG_FILE = path.join(API_CONFIG_DIR, "api-config.json");

export interface ProviderRuntimeStatus {
  id: LLMProvider;
  name: string;
  transport: "browser-session" | "local-http";
  requiresCookies: boolean;
  configured: boolean;
  cookieCount: number;
  isConnected: boolean | null;
  isAuthenticated: boolean | null;
  storedSource: StoredSessionSource | null;
  updatedAt: number | null;
}

export interface ResolvedProviderCookies {
  cookies: CookieEntry[];
  source: "request" | "stored" | PublicApiBrowserId | "not-required";
}

interface StreamingProvider {
  sendMessageWithStreaming: (
    message: string,
    onChunk: (chunk: string) => void,
    conversationId?: string,
    imagePaths?: string[],
    signal?: AbortSignal,
  ) => Promise<{
    success: boolean;
    content?: string;
    error?: string;
    conversationId?: string;
  }>;
}

function createEmptyConfig(): ApiConfigFile {
  return { providers: {} };
}

export function isPublicApiProvider(value: string): value is LLMProvider {
  return PUBLIC_API_PROVIDERS.includes(value as LLMProvider);
}

export function isPublicApiBrowserId(
  value: string,
): value is PublicApiBrowserId {
  return PUBLIC_API_BROWSER_IDS.includes(value as PublicApiBrowserId);
}

export function isBrowserBackedProvider(provider: LLMProvider): boolean {
  return provider !== "ollama";
}

export function getConfiguredApiKeyRequirement(): boolean {
  return Boolean(process.env.MODELDOCK_API_KEY?.trim());
}

export function requirePublicApiAuth(
  request: NextRequest,
): NextResponse | null {
  const expectedApiKey = process.env.MODELDOCK_API_KEY?.trim();
  if (!expectedApiKey) {
    return null;
  }

  const authorizationHeader = request.headers.get("authorization");
  const bearerToken = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice(7).trim()
    : null;
  const headerToken =
    request.headers.get("x-modeldock-api-key")?.trim() ||
    request.headers.get("x-api-key")?.trim() ||
    null;
  const providedApiKey = bearerToken || headerToken;

  if (providedApiKey === expectedApiKey) {
    return null;
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Unauthorized. Provide Authorization: Bearer <MODELDOCK_API_KEY> or x-modeldock-api-key.",
    },
    { status: 401 },
  );
}

async function ensureApiConfigDir(): Promise<void> {
  await fs.mkdir(API_CONFIG_DIR, { recursive: true });
}

function normalizeSameSite(
  sameSite?: string,
): CookieEntry["sameSite"] | undefined {
  if (sameSite === "Strict" || sameSite === "Lax" || sameSite === "None") {
    return sameSite;
  }

  return undefined;
}

export function sanitizeCookies(cookies: CookieLike[] = []): CookieEntry[] {
  return cookies
    .filter((cookie) => cookie?.name && cookie?.value && cookie?.domain)
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || "/",
      expires: cookie.expires,
      httpOnly: Boolean(cookie.httpOnly),
      secure: cookie.secure ?? true,
      sameSite: normalizeSameSite(cookie.sameSite),
    }));
}

async function readApiConfig(): Promise<ApiConfigFile> {
  try {
    const raw = await fs.readFile(API_CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ApiConfigFile>;

    return {
      providers: parsed.providers ?? {},
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[ModelDock API] Failed to read api-config.json:", error);
    }
    return createEmptyConfig();
  }
}

async function writeApiConfig(config: ApiConfigFile): Promise<void> {
  await ensureApiConfigDir();
  await fs.writeFile(API_CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export async function getStoredProviderSession(
  provider: LLMProvider,
): Promise<StoredProviderSession | null> {
  const config = await readApiConfig();
  return config.providers[provider] ?? null;
}

export async function getStoredCookies(
  provider: LLMProvider,
): Promise<CookieEntry[]> {
  const session = await getStoredProviderSession(provider);
  return session?.cookies ?? [];
}

export async function storeProviderCookies(
  provider: LLMProvider,
  cookies: CookieEntry[],
  source: StoredSessionSource = "manual",
): Promise<void> {
  const sanitizedCookies = sanitizeCookies(cookies);
  const config = await readApiConfig();

  config.providers[provider] = {
    cookies: sanitizedCookies,
    source,
    updatedAt: Date.now(),
  };

  await writeApiConfig(config);
}

export async function clearStoredProviderSession(
  provider: LLMProvider,
): Promise<void> {
  const config = await readApiConfig();
  if (!config.providers[provider]) {
    return;
  }

  delete config.providers[provider];
  await writeApiConfig(config);
}

export async function importCookiesForProvider(
  provider: LLMProvider,
  browserId: PublicApiBrowserId,
): Promise<CookieEntry[]> {
  const importedCookies = await getCookiesBatch(
    { [provider]: PROVIDER_URLS[provider] },
    browserId,
  );

  return sanitizeCookies(importedCookies[provider] ?? []);
}

export async function resolveProviderCookies(
  provider: LLMProvider,
  requestCookies?: CookieEntry[],
  importFromBrowser?: PublicApiBrowserId,
): Promise<ResolvedProviderCookies> {
  if (!isBrowserBackedProvider(provider)) {
    return { cookies: [], source: "not-required" };
  }

  if (importFromBrowser) {
    const cookies = await importCookiesForProvider(provider, importFromBrowser);
    return { cookies, source: importFromBrowser };
  }

  const sanitizedRequestCookies = sanitizeCookies(requestCookies);
  if (sanitizedRequestCookies.length > 0) {
    return { cookies: sanitizedRequestCookies, source: "request" };
  }

  const storedCookies = await getStoredCookies(provider);
  return { cookies: storedCookies, source: "stored" };
}

export async function getProviderRuntimeStatus(
  provider: LLMProvider,
): Promise<ProviderRuntimeStatus> {
  const storedSession = await getStoredProviderSession(provider);
  const transport = isBrowserBackedProvider(provider)
    ? "browser-session"
    : "local-http";
  const isConnected = isBrowserBackedProvider(provider)
    ? browserManager.isPageOpen(provider)
    : null;
  let isAuthenticated: boolean | null = null;

  if (provider === "ollama") {
    try {
      isAuthenticated = await getProvider(provider).isAuthenticated();
    } catch {
      isAuthenticated = false;
    }
  } else if (isConnected) {
    try {
      isAuthenticated = await getProvider(provider).isAuthenticated();
    } catch {
      isAuthenticated = false;
    }
  }

  return {
    id: provider,
    name: PROVIDERS[provider].name,
    transport,
    requiresCookies: isBrowserBackedProvider(provider),
    configured: isBrowserBackedProvider(provider)
      ? Boolean(storedSession?.cookies.length)
      : true,
    cookieCount: storedSession?.cookies.length ?? 0,
    isConnected,
    isAuthenticated,
    storedSource: storedSession?.source ?? null,
    updatedAt: storedSession?.updatedAt ?? null,
  };
}

export async function writeImagesToTempFiles(
  images: string[] = [],
): Promise<string[]> {
  const imagePaths: string[] = [];

  for (const image of images) {
    const matches = image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    let ext = "png";
    let buffer: Buffer;

    if (matches && matches.length === 3) {
      ext = matches[1].split("/")[1] || "png";
      buffer = Buffer.from(matches[2], "base64");
    } else {
      buffer = Buffer.from(image, "base64");
    }

    const filename = `modeldock-upload-${randomUUID()}.${ext}`;
    const filepath = path.join(os.tmpdir(), filename);
    await fs.writeFile(filepath, buffer);
    imagePaths.push(filepath);
  }

  return imagePaths;
}

export async function cleanupTempFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (filepath) => {
      try {
        await fs.unlink(filepath);
      } catch {}
    }),
  );
}

export async function sendProviderMessageWithStreaming(
  provider: LLMProvider,
  message: string,
  onChunk: (chunk: string) => void,
  options?: {
    cookies?: CookieEntry[];
    conversationId?: string;
    imagePaths?: string[];
    signal?: AbortSignal;
  },
): Promise<{
  success: boolean;
  content?: string;
  error?: string;
  conversationId?: string;
}> {
  const llmProvider = getProvider(provider);

  if (options?.cookies && options.cookies.length > 0) {
    await llmProvider.injectCookies(options.cookies);
  }

  const streamingProvider = llmProvider as unknown as StreamingProvider;
  return streamingProvider.sendMessageWithStreaming(
    message,
    onChunk,
    options?.conversationId,
    options?.imagePaths,
    options?.signal,
  );
}
