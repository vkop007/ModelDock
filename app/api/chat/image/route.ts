import { NextRequest } from "next/server";
import { getProvider } from "@/lib/puppeteer";
import { CookieEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const {
      provider: providerName,
      prompt,
      cookies,
      conversationId,
    } = await request.json();

    if (!providerName || !prompt) {
      return new Response(
        JSON.stringify({ error: "Provider and prompt are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`[Image API] Generating image via ${providerName}...`);
    const provider = getProvider(providerName);

    // Inject cookies if provided
    if (cookies && cookies.length > 0) {
      await provider.injectCookies(cookies as CookieEntry[]);
    }

    // Check if provider supports image generation
    if (!("generateImage" in provider)) {
      return new Response(
        JSON.stringify({ error: "Provider does not support image generation" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Cast and call
    const imageProvider = provider as unknown as {
      generateImage: (
        prompt: string
      ) => Promise<{ success: boolean; imageUrl?: string; error?: string }>;
    };

    const result = await imageProvider.generateImage(prompt);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Image API] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
