import { NextRequest, NextResponse } from "next/server";
import { PROVIDER_URLS } from "@/lib/puppeteer/browser-manager";
import { LLMProvider } from "@/types";
// @ts-ignore
import chrome from "chrome-cookies-secure";

export async function POST(req: NextRequest) {
  try {
    const { provider } = await req.json();

    if (!provider || !PROVIDER_URLS[provider as LLMProvider]) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const url = PROVIDER_URLS[provider as LLMProvider];
    console.log(`[CookieImport] Fetching cookies for ${provider} from ${url}`);

    // Promisify getCookies
    const getCookies = (url: string): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        // @ts-ignore
        chrome.getCookies(url, "puppeteer", (err: any, cookies: any) => {
          if (err) {
            reject(err);
          } else {
            console.log(
              `[CookieImport] Raw cookies type: ${typeof cookies}, isArray: ${Array.isArray(
                cookies,
              )}`,
            );
            if (Array.isArray(cookies)) {
              resolve(cookies);
            } else {
              // Sometimes it might return an object with items?
              // or if null
              resolve([]);
            }
          }
        });
      });
    };

    const cookies = await getCookies(url);

    if (!cookies || cookies.length === 0) {
      return NextResponse.json(
        { error: "No cookies found in default browser" },
        { status: 404 },
      );
    }

    // Transform cookies to our format
    const formattedCookies = cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

    return NextResponse.json({ success: true, cookies: formattedCookies });
  } catch (error) {
    console.error("[CookieImport] Error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
