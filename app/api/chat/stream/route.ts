import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/puppeteer";
import { CookieEntry, LLMProvider } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, message, cookies, conversationId, images } = body as {
      provider: LLMProvider;
      message: string;
      cookies: CookieEntry[];
      conversationId?: string;
      images?: string[]; // Base64 strings
    };

    if (!provider || (!message && (!images || images.length === 0))) {
      return NextResponse.json(
        { success: false, error: "Provider and message/images are required" },
        { status: 400 },
      );
    }

    console.log("[Stream API] Using browser method...");
    const llmProvider = getProvider(provider);

    // Inject cookies if provided
    if (cookies && cookies.length > 0) {
      await llmProvider.injectCookies(cookies);
    }

    // Handle Image Uploads
    const imagePaths: string[] = [];
    if (images && images.length > 0) {
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");

      const tmpDir = os.tmpdir();

      for (const base64Image of images) {
        // Remove header if present (e.g., "data:image/png;base64,")
        const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

        let buffer: Buffer;
        let ext = "png";

        if (matches && matches.length === 3) {
          ext = matches[1].split("/")[1];
          buffer = Buffer.from(matches[2], "base64");
        } else {
          buffer = Buffer.from(base64Image, "base64");
        }

        const filename = `upload_${Date.now()}_${Math.random()
          .toString(36)
          .substring(7)}.${ext}`;
        const filepath = path.join(tmpDir, filename);

        await fs.promises.writeFile(filepath, buffer);
        imagePaths.push(filepath);
      }
    }

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`),
          );

          const providerWithStreaming = llmProvider as unknown as {
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
          };

          const result = await providerWithStreaming.sendMessageWithStreaming(
            message,
            (chunk: string) => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "chunk",
                    content: chunk,
                  })}\n\n`,
                ),
              );
            },
            conversationId,
            imagePaths,
            request.signal,
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                success: result.success,
                content: result.content,
                error: result.error,
                conversationId: result.conversationId,
              })}\n\n`,
            ),
          );

          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: String(error),
              })}\n\n`,
            ),
          );
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
  } catch (error: any) {
    if (error.name === "AbortError" || error.message === "AbortError") {
      console.log("[Stream API] Stream aborted by client");
      return new Response(JSON.stringify({ error: "Aborted" }), {
        status: 499,
      });
    }
    console.error("[Stream API] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
