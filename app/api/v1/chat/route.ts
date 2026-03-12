import { NextRequest, NextResponse } from "next/server";
import {
  cleanupTempFiles,
  isBrowserBackedProvider,
  isPublicApiBrowserId,
  isPublicApiProvider,
  PublicApiBrowserId,
  requirePublicApiAuth,
  resolveProviderCookies,
  sendProviderMessageWithStreaming,
  storeProviderCookies,
  writeImagesToTempFiles,
} from "@/lib/server/modeldock-api";
import { browserManager } from "@/lib/puppeteer/browser-manager";
import { CookieEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authError = requirePublicApiAuth(request);
  if (authError) {
    return authError;
  }

  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
    message?: string;
    conversationId?: string;
    cookies?: CookieEntry[];
    importFromBrowser?: string;
    persistCookies?: boolean;
    images?: string[];
    stream?: boolean;
    warmup?: boolean;
    awaitWarmup?: boolean;
  };
  const browserSource = body.importFromBrowser;

  if (!body.provider || !isPublicApiProvider(body.provider)) {
    return NextResponse.json(
      { success: false, error: "A supported provider is required." },
      { status: 400 },
    );
  }

  if (!body.message && (!body.images || body.images.length === 0)) {
    return NextResponse.json(
      {
        success: false,
        error: "message or images are required.",
      },
      { status: 400 },
    );
  }

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

  const provider = body.provider;
  const resolved = await resolveProviderCookies(
    provider,
    body.cookies,
    validatedBrowserSource,
  );
  const shouldPersistCookies =
    body.persistCookies ??
    (resolved.source !== "stored" && resolved.source !== "not-required");

  if (isBrowserBackedProvider(provider) && resolved.cookies.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No cookies available for this provider. Provide cookies, use importFromBrowser, or configure /api/v1/providers/{provider}/session first.",
      },
      { status: 400 },
    );
  }

  if (
    shouldPersistCookies &&
    isBrowserBackedProvider(provider) &&
    resolved.source !== "stored" &&
    resolved.source !== "not-required"
  ) {
    await storeProviderCookies(
      provider,
      resolved.cookies,
      resolved.source === "request"
        ? "manual"
        : validatedBrowserSource ?? "manual",
    );
  }

  if (body.warmup && isBrowserBackedProvider(provider)) {
    if (body.awaitWarmup) {
      await browserManager.warmPage(provider, resolved.cookies, {
        preventSwitch: true,
      });
    } else {
      browserManager.warmPage(provider, resolved.cookies, {
        preventSwitch: true,
      }).catch((error) => {
        console.error("[Public Chat API] Background warmup failed:", error);
      });
    }
  }

  const imagePaths = await writeImagesToTempFiles(body.images || []);
  const message = body.message || "";

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "start",
                provider,
                source: resolved.source,
              })}\n\n`,
            ),
          );

          const result = await sendProviderMessageWithStreaming(
            provider,
            message,
            (chunk) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "chunk",
                    content: chunk,
                  })}\n\n`,
                ),
              );
            },
            {
              cookies: resolved.cookies,
              conversationId: body.conversationId,
              imagePaths,
              signal: request.signal,
            },
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                success: result.success,
                provider,
                content: result.content,
                error: result.error,
                conversationId: result.conversationId,
              })}\n\n`,
            ),
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: String(error),
              })}\n\n`,
            ),
          );
        } finally {
          await cleanupTempFiles(imagePaths);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const result = await sendProviderMessageWithStreaming(
      provider,
      message,
      () => {},
      {
        cookies: resolved.cookies,
        conversationId: body.conversationId,
        imagePaths,
        signal: request.signal,
      },
    );

    const status = result.success ? 200 : 500;
    return NextResponse.json(
      {
        success: result.success,
        provider,
        source: resolved.source,
        content: result.content,
        error: result.error,
        conversationId: result.conversationId,
      },
      { status },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  } finally {
    await cleanupTempFiles(imagePaths);
  }
}
