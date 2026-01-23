import { NextRequest, NextResponse } from "next/server";
import { getProvider, browserManager } from "@/lib/puppeteer";
import { ChatRequest, LLMProvider, CookieEntry } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest & {
      cookies?: CookieEntry[];
    };
    const { provider, message, cookies } = body;

    if (!provider || !message) {
      return NextResponse.json(
        { success: false, error: "Provider and message are required" },
        { status: 400 }
      );
    }

    // Validate provider
    if (!["chatgpt", "claude", "gemini"].includes(provider)) {
      return NextResponse.json(
        { success: false, error: "Invalid provider" },
        { status: 400 }
      );
    }

    const llmProvider = getProvider(provider as LLMProvider);

    // Inject cookies if provided
    if (cookies && cookies.length > 0) {
      await llmProvider.injectCookies(cookies);
    }

    // Send message and get response
    const result = await llmProvider.sendMessage(message);

    if (result.success) {
      return NextResponse.json({
        success: true,
        content: result.content,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to get response" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Optional: Clean up on server shutdown
export async function DELETE() {
  try {
    await browserManager.closeAll();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
