import { NextRequest, NextResponse } from "next/server";
import { browserManager } from "@/lib/puppeteer";
import { LLMProvider, CookieEntry } from "@/types";

// Pre-warm browser page for a provider
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, cookies, preventSwitch, awaitWarmup } = body as {
      provider: LLMProvider;
      cookies?: CookieEntry[];
      preventSwitch?: boolean;
      awaitWarmup?: boolean;
    };

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Provider is required" },
        { status: 400 },
      );
    }

    // Validate provider
    const validProviders: LLMProvider[] = [
      "chatgpt",
      "claude",
      "gemini",
      "zai",
      "grok",
      "qwen",
      "mistral",
    ];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { success: false, error: "Invalid provider" },
        { status: 400 },
      );
    }

    // Check if already warmed - just switch to that tab
    if (browserManager.isPageWarmed(provider)) {
      console.log(
        `[Warmup API] Page already warmed for ${provider}, switching tab`,
      );

      // Switch to the existing tab ONLY if not prevented
      if (!preventSwitch) {
        browserManager.switchToPage(provider).catch((error) => {
          console.error(`[Warmup API] Failed to switch tab:`, error);
        });
      }

      return NextResponse.json({
        success: true,
        warmed: true,
        cached: true,
        switched: !preventSwitch,
      });
    }

    // If caller wants deterministic ordering, await warmup completion
    if (awaitWarmup) {
      console.log(`[Warmup API] Starting awaited warmup for ${provider}`);
      await browserManager.warmPage(provider, cookies, { preventSwitch });
      return NextResponse.json({
        success: true,
        warmed: true,
        switched: !preventSwitch,
      });
    }

    // Start warming in background (fire-and-forget)
    console.log(`[Warmup API] Starting warmup for ${provider}`);
    browserManager
      .warmPage(provider, cookies, { preventSwitch })
      .catch((error) => {
        console.error(`[Warmup API] Background warmup failed:`, error);
      });

    return NextResponse.json({
      success: true,
      warming: true,
    });
  } catch (error) {
    console.error("[Warmup API] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}

// Check warmup status for a provider
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider") as LLMProvider;

    if (!provider) {
      return NextResponse.json(
        { success: false, error: "Provider is required" },
        { status: 400 },
      );
    }

    const isWarmed = browserManager.isPageWarmed(provider);
    const isPageOpen = browserManager.isPageOpen(provider);

    return NextResponse.json({
      success: true,
      provider,
      isWarmed,
      isPageOpen,
    });
  } catch (error) {
    console.error("[Warmup API] GET Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
