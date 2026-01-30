import { NextResponse } from "next/server";
import { detectInstalledBrowsers } from "@/lib/puppeteer/browser-detector";

export async function GET() {
  try {
    const browsers = detectInstalledBrowsers();

    return NextResponse.json({
      success: true,
      browsers,
      platform: process.platform,
    });
  } catch (error) {
    console.error("[BrowserDetect] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: String(error),
        browsers: [],
      },
      { status: 500 },
    );
  }
}
