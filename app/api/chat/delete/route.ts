import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/puppeteer";
import { CookieEntry } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const {
      provider: providerName,
      conversationId,
      cookies,
    } = await request.json();

    if (!providerName || !conversationId) {
      return NextResponse.json(
        { error: "Provider and conversationId are required" },
        { status: 400 }
      );
    }

    const provider = getProvider(providerName);

    // Inject cookies if provided (needed for authentication to delete)
    if (cookies && cookies.length > 0) {
      await provider.injectCookies(cookies as CookieEntry[]);
    }

    const s = await provider.deleteConversation(conversationId);

    return NextResponse.json({ success: s });
  } catch (error) {
    console.error("[Delete API] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation", details: String(error) },
      { status: 500 }
    );
  }
}
