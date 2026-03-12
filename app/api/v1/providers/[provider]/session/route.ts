import { NextRequest, NextResponse } from "next/server";
import { getProvider, browserManager } from "@/lib/puppeteer";
import {
  clearStoredProviderSession,
  getProviderRuntimeStatus,
  isBrowserBackedProvider,
  isPublicApiBrowserId,
  isPublicApiProvider,
  PublicApiBrowserId,
  requirePublicApiAuth,
  resolveProviderCookies,
  storeProviderCookies,
} from "@/lib/server/modeldock-api";
import { CookieEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SessionRouteContext {
  params: Promise<{ provider: string }>;
}

export async function GET(request: NextRequest, context: SessionRouteContext) {
  const authError = requirePublicApiAuth(request);
  if (authError) {
    return authError;
  }

  const { provider } = await context.params;
  if (!isPublicApiProvider(provider)) {
    return NextResponse.json(
      { success: false, error: `Unsupported provider: ${provider}` },
      { status: 400 },
    );
  }

  const status = await getProviderRuntimeStatus(provider);
  return NextResponse.json({ success: true, provider: status });
}

export async function POST(request: NextRequest, context: SessionRouteContext) {
  const authError = requirePublicApiAuth(request);
  if (authError) {
    return authError;
  }

  const { provider } = await context.params;
  if (!isPublicApiProvider(provider)) {
    return NextResponse.json(
      { success: false, error: `Unsupported provider: ${provider}` },
      { status: 400 },
    );
  }

  if (!isBrowserBackedProvider(provider)) {
    const isAuthenticated = await getProvider(provider).isAuthenticated();
    const status = await getProviderRuntimeStatus(provider);

    return NextResponse.json({
      success: true,
      provider: status,
      isAuthenticated,
      cookieCount: 0,
      source: "not-required",
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    cookies?: CookieEntry[];
    importFromBrowser?: string;
    persist?: boolean;
    warmup?: boolean;
    awaitWarmup?: boolean;
  };
  const browserSource = body.importFromBrowser;

  if (browserSource && !isPublicApiBrowserId(browserSource)) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported browser source: ${browserSource}`,
      },
      { status: 400 },
    );
  }

  const validatedBrowserSource = browserSource as
    | PublicApiBrowserId
    | undefined;

  const resolved = await resolveProviderCookies(
    provider,
    body.cookies,
    validatedBrowserSource,
  );

  if (resolved.cookies.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No cookies available. Provide cookies, use importFromBrowser, or configure the session first.",
      },
      { status: 400 },
    );
  }

  const persist =
    body.persist ??
    (resolved.source === "request" || Boolean(validatedBrowserSource));

  if (persist && resolved.source !== "stored") {
    await storeProviderCookies(
      provider,
      resolved.cookies,
      resolved.source === "request"
        ? "manual"
        : validatedBrowserSource ?? "manual",
    );
  }

  const llmProvider = getProvider(provider);
  await llmProvider.injectCookies(resolved.cookies);

  if (body.warmup) {
    if (body.awaitWarmup) {
      await browserManager.warmPage(provider, resolved.cookies, {
        preventSwitch: true,
      });
    } else {
      browserManager.warmPage(provider, resolved.cookies, {
        preventSwitch: true,
      }).catch((error) => {
        console.error("[Public Session API] Background warmup failed:", error);
      });
    }
  }

  const isAuthenticated = await llmProvider.isAuthenticated();
  const status = await getProviderRuntimeStatus(provider);

  return NextResponse.json({
    success: true,
    provider: status,
    source: resolved.source,
    persisted: persist,
    isAuthenticated,
  });
}

export async function DELETE(
  request: NextRequest,
  context: SessionRouteContext,
) {
  const authError = requirePublicApiAuth(request);
  if (authError) {
    return authError;
  }

  const { provider } = await context.params;
  if (!isPublicApiProvider(provider)) {
    return NextResponse.json(
      { success: false, error: `Unsupported provider: ${provider}` },
      { status: 400 },
    );
  }

  if (isBrowserBackedProvider(provider)) {
    await browserManager.closePage(provider);
    await clearStoredProviderSession(provider);
  }

  return NextResponse.json({
    success: true,
    provider,
    cleared: isBrowserBackedProvider(provider),
  });
}
