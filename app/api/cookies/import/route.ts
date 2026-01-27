import { NextRequest, NextResponse } from "next/server";
import { PROVIDER_URLS } from "@/lib/puppeteer/browser-manager";
import { LLMProvider } from "@/types";
// @ts-ignore
import chrome from "chrome-cookies-secure";

export async function POST(req: NextRequest) {
  try {
    const { provider } = await req.json();

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
        expires: c.expirationDate,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }));
    };

    if (provider === "all") {
      const results: Record<string, any> = {};
      const providers = Object.keys(PROVIDER_URLS) as LLMProvider[];

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
