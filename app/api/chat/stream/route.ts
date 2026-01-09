import { NextRequest } from "next/server";
import { getProvider } from "@/lib/puppeteer";
import { CookieEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { provider: providerName, message, cookies } = await request.json();

    if (!providerName || !message) {
      return new Response(
        JSON.stringify({ error: "Provider and message are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("[Stream API] Using browser method...");
    const provider = getProvider(providerName);

    // Inject cookies if provided
    if (cookies && cookies.length > 0) {
      await provider.injectCookies(cookies as CookieEntry[]);
    }

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "start" })}\n\n`)
          );

          const providerWithStreaming = provider as unknown as {
            sendMessageWithStreaming: (
              message: string,
              onChunk: (chunk: string) => void
            ) => Promise<{
              success: boolean;
              content?: string;
              error?: string;
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
                  })}\n\n`
                )
              );
            }
          );

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "done",
                success: result.success,
                content: result.content,
                error: result.error,
              })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                error: String(error),
              })}\n\n`
            )
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
  } catch (error) {
    console.error("[Stream API] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
