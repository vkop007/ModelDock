import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/puppeteer";
import { CookieEntry, LLMProvider } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, instructions, cookies } = body as {
      provider: LLMProvider;
      instructions: string;
      cookies: CookieEntry[];
    };

    if (!provider || !instructions) {
      return NextResponse.json(
        { success: false, error: "Provider and instructions are required" },
        { status: 400 }
      );
    }

    // Supported providers: chatgpt, claude, gemini, grok, qwen
    if (
      provider !== "chatgpt" &&
      provider !== "claude" &&
      provider !== "gemini" &&
      provider !== "grok" &&
      provider !== "qwen"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "System instructions only supported for ChatGPT, Claude, Gemini, Grok, and Qwen",
        },
        { status: 400 }
      );
    }

    console.log(`[Instructions API] Setting instructions for ${provider}...`);
    const llmProvider = getProvider(provider);

    // Inject cookies if provided
    if (cookies && cookies.length > 0) {
      await llmProvider.injectCookies(cookies);
    }

    // Cast to provider with setCustomInstructions method
    const providerWithInstructions = llmProvider as unknown as {
      setCustomInstructions: (instructions: string) => Promise<{
        success: boolean;
        error?: string;
      }>;
    };

    const result = await providerWithInstructions.setCustomInstructions(
      instructions
    );

    if (result.success) {
      console.log(`[Instructions API] Successfully set instructions`);
      return NextResponse.json({ success: true });
    } else {
      console.error(`[Instructions API] Failed:`, result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Instructions API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
