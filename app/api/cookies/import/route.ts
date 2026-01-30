import { NextRequest, NextResponse } from "next/server";
import { PROVIDER_URLS } from "@/lib/puppeteer/browser-manager";
import { LLMProvider } from "@/types";
// @ts-ignore
import chrome from "chrome-cookies-secure";

import { getCookiesBatch } from "@/lib/puppeteer/cookie-utils";

export async function POST(req: NextRequest) {
  try {
    const { provider, browser = "chrome" } = await req.json();

    console.log(
      `[CookieImport] Import request: provider=${provider}, browser=${browser}`,
    );
    const getCookies = (url: string): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        // @ts-ignore
        chrome.getCookies(url, "puppeteer", (err: any, cookies: any) => {
          if (err) {
            // resolve with empty array instead of rejecting for partial success
            console.error(`[CookieImport] Error fetching for ${url}:`, err);
            resolve([]);
          } else {
            if (Array.isArray(cookies)) {
              resolve(cookies);
            } else {
              resolve([]);
            }
          }
        });
      });
    };

    const formatCookies = (cookies: any[]) => {
      return cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expirationDate || c.expires, // Handle both formats
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }));
    };

    if (provider === "all") {
      const providers = Object.keys(PROVIDER_URLS) as LLMProvider[];
      let results: Record<string, any> = {};

      try {
        console.log(
          `[CookieImport] Attempting batch import from ${browser}...`,
        );
        // Filter out empty URLs
        const targetUrls: Record<string, string> = {};
        providers.forEach((p) => {
          if (PROVIDER_URLS[p]) targetUrls[p] = PROVIDER_URLS[p];
        });

        // Use new batch method with browser parameter
        results = await getCookiesBatch(targetUrls, browser);

        // Log results
        Object.entries(results).forEach(([p, cookies]) => {
          console.log(
            `[CookieImport] Found ${cookies.length} cookies for ${p}`,
          );
        });
      } catch (batchError) {
        console.error(
          "[CookieImport] Batch import failed, falling back to sequential:",
          batchError,
        );

        // Fallback to sequential if batch fails
        await Promise.all(
          providers.map(async (p) => {
            const url = PROVIDER_URLS[p];
            if (!url) return;

            try {
              const cookies = await getCookies(url);
              if (cookies && cookies.length > 0) {
                results[p] = formatCookies(cookies);
                console.log(
                  `[CookieImport] Found ${cookies.length} cookies for ${p}`,
                );
              }
            } catch (e) {
              console.error(`[CookieImport] Failed for ${p}:`, e);
            }
          }),
        );
      }

      return NextResponse.json({
        success: true,
        cookies: results,
        isBulk: true,
      });
    }

    if (!provider || !PROVIDER_URLS[provider as LLMProvider]) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const url = PROVIDER_URLS[provider as LLMProvider];
    console.log(`[CookieImport] Fetching cookies for ${provider} from ${url}`);

    const cookies = await getCookies(url);

    if (!cookies || cookies.length === 0) {
      return NextResponse.json(
        { error: "No cookies found in default browser" },
        { status: 404 },
      );
    }

    // Transform cookies to our format
    const formattedCookies = formatCookies(cookies);

    return NextResponse.json({ success: true, cookies: formattedCookies });
  } catch (error) {
    console.error("[CookieImport] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
