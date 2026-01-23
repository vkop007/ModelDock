import { NextRequest, NextResponse } from "next/server";
import { getProvider, browserManager } from "@/lib/puppeteer";
import { LLMProvider, CookieEntry } from "@/types";

// Initialize session with cookies
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, cookies } = body as {
      provider: LLMProvider;
      cookies: CookieEntry[];
    };

    if (!provider || !cookies) {
      return NextResponse.json(
        { success: false, error: "Provider and cookies are required" },
        { status: 400 }
      );
    }

    // Validate provider
    const supportedProviders: LLMProvider[] = [
      "chatgpt",
      "claude",
      "gemini",
      "zai",
      "grok",
      "qwen",
      "mistral",
      "ollama",
    ];

    if (!supportedProviders.includes(provider)) {
      return NextResponse.json(
        { success: false, error: "Invalid provider" },
        { status: 400 }
      );
    }

    const llmProvider = getProvider(provider);

    // Inject cookies
    await llmProvider.injectCookies(cookies);

    // Check if authenticated
    const isAuthenticated = await llmProvider.isAuthenticated();

    return NextResponse.json({
      success: true,
      isAuthenticated,
    });
  } catch (error) {
    console.error("[Session API] POST Error:", error);
    return NextResponse.json(
      { success: false, error: String(error), isAuthenticated: false },
      { status: 500 }
    );
  }
}

// Check session status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") as LLMProvider;

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Provider is required" },
        { status: 400 }
      );
    }

    if (
      ![
        "chatgpt",
        "claude",
        "gemini",
        "zai",
        "grok",
        "qwen",
        "mistral",
        "ollama",
      ].includes(provider)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid provider" },
        { status: 400 }
      );
    }

    const isPageOpen = browserManager.isPageOpen(provider);

    if (!isPageOpen) {
      return NextResponse.json({
        success: true,
        isConnected: false,
        isAuthenticated: false,
      });
    }

    const llmProvider = getProvider(provider);
    const isAuthenticated = await llmProvider.isAuthenticated();

    return NextResponse.json({
      success: true,
      isConnected: true,
      isAuthenticated,
    });
  } catch (error) {
    console.error("[Session API] GET Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Close session
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") as LLMProvider;

    if (!provider) {
      // Close all sessions
      await browserManager.closeAll();
      return NextResponse.json({ success: true });
    }

    if (
      ![
        "chatgpt",
        "claude",
        "gemini",
        "zai",
        "grok",
        "qwen",
        "mistral",
        "ollama",
      ].includes(provider)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid provider" },
        { status: 400 }
      );
    }

    await browserManager.closePage(provider);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session API] DELETE Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
