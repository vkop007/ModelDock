import fs from "fs";
import path from "path";
import crypto from "crypto";
import sqlite3 from "sqlite3";
// @ts-ignore
import tld from "tldjs";
// @ts-ignore
import keytar from "keytar";
import {
  getBrowserCookiePath,
  getKeychainService,
  getBrowserType,
} from "./browser-detector";

interface Cookie {
  name: string;
  value: string;
  expires_utc: number;
  host_key: string;
  path: string;
  is_secure: number;
  is_httponly: number;
  has_expires: number;
  encrypted_value: Buffer | string; // Helper for processing
  creation_utc: number;
}

export interface FormattedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: string;
}

const ITERATIONS = 1003;
const SALT = "saltysalt";
const KEYLENGTH = 16;

function decrypt(key: Buffer, encryptedData: Buffer): string {
  try {
    const iv = Buffer.alloc(KEYLENGTH, " "); // Fixed: IV must be 16 bytes
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    decipher.setAutoPadding(false);

    // Slice off 'v10' or v11 prefix usually in Chrome cookies on Mac?
    // chrome-cookies-secure slices 3. "v10" or "v11".
    const data = encryptedData.slice(3);

    let decoded = decipher.update(data);
    const final = decipher.final();

    // Concatenate properly
    decoded = Buffer.concat([decoded, final]);

    // Manual padding removal (PKCS7-like but simple check in original lib)
    const padding = decoded[decoded.length - 1];
    if (padding) {
      decoded = decoded.slice(32, decoded.length - padding); // Fixed: Slice first 32 bytes (HMAC/Salt?) and padding
    }

    return decoded.toString("utf8");
  } catch (e) {
    console.error("Decryption error:", e);
    return "";
  }
}

async function getDerivedKey(browserId: string = "chrome"): Promise<Buffer> {
  if (process.platform === "darwin") {
    const { service, account } = getKeychainService(browserId);
    const password = await keytar.getPassword(service, account);
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password || "",
        SALT,
        ITERATIONS,
        KEYLENGTH,
        "sha1",
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        },
      );
    });
  }
  // Linux/Windows stubs or implementation could go here
  if (process.platform === "linux") {
    // Basic linux support (hardcoded 'peanuts' as per original)
    return new Promise((resolve, reject) => {
      crypto.pbkdf2("peanuts", SALT, 1, KEYLENGTH, "sha1", (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }

  throw new Error("Platform not supported for optimized batch cookie import");
}

function getChromeCookiePath(browserId: string = "chrome"): string {
  // Use browser-detector for dynamic path resolution
  const detectedPath = getBrowserCookiePath(browserId);
  if (detectedPath) {
    return detectedPath;
  }

  // Fallback to hardcoded Chrome paths
  if (process.platform === "darwin") {
    return path.join(
      process.env.HOME || "",
      "Library/Application Support/Google/Chrome/Default/Cookies",
    );
  }
  if (process.platform === "linux") {
    return path.join(
      process.env.HOME || "",
      ".config/google-chrome/Default/Cookies",
    );
  }
  // Fallback or other profiles handling could be improved
  return "";
}

/**
 * Chromium timestamp to Unix timestamp
 */
function convertChromiumTimestamp(timestamp: number): number {
  // Chromium uses Windows Gregorian epoch (1601-01-01) in microseconds
  // Unix is 1970-01-01 in seconds (or ms)
  // Difference is 11644473600 seconds
  return Math.floor(timestamp / 1000000 - 11644473600);
}

/**
 * Firefox timestamp to Unix timestamp
 * Firefox stores expiry as Unix timestamp in seconds
 */
function convertFirefoxTimestamp(timestamp: number): number {
  // Firefox already uses Unix timestamp in seconds
  return timestamp;
}

/**
 * Read cookies from Firefox's cookies.sqlite database
 * Firefox cookies are NOT encrypted, making this much simpler than Chromium
 */
async function getFirefoxCookiesBatch(
  useUrls: Record<string, string>,
  dbPath: string,
): Promise<Record<string, FormattedCookie[]>> {
  console.log(`[CookieUtils] Reading Firefox cookies from ${dbPath}`);

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });

    const results: Record<string, FormattedCookie[]> = {};
    const domains = Object.values(useUrls)
      .map((u) => tld.getDomain(u))
      .filter(Boolean);
    const uniqueDomains = [...new Set(domains)];

    // Firefox uses 'host' column, Chromium uses 'host_key'
    const domainPlaceholders = uniqueDomains
      .map(() => "host LIKE ?")
      .join(" OR ");
    const params = uniqueDomains.map((d) => `%${d}`);

    // Firefox moz_cookies table structure
    const query = `
      SELECT 
        name,
        value,
        host,
        path,
        expiry,
        isSecure,
        isHttpOnly,
        sameSite
      FROM moz_cookies
      WHERE ${domainPlaceholders}
    `;

    db.all(query, params, (err: Error | null, rows: any[]) => {
      if (err) {
        db.close();
        return reject(err);
      }

      // Group cookies by provider
      for (const [provider, url] of Object.entries(useUrls)) {
        const domain = tld.getDomain(url);
        if (!domain) continue;

        const providerCookies = rows
          .filter((row) => row.host.includes(domain))
          .map((row) => ({
            name: row.name,
            value: row.value, // Firefox cookies are NOT encrypted
            domain: row.host,
            path: row.path,
            expires: convertFirefoxTimestamp(row.expiry),
            httpOnly: !!row.isHttpOnly,
            secure: !!row.isSecure,
            sameSite:
              row.sameSite === 0
                ? "None"
                : row.sameSite === 1
                  ? "Lax"
                  : "Strict",
          }));

        results[provider] = providerCookies;
      }

      db.close();
      resolve(results);
    });
  });
}

export async function getCookiesBatch(
  useUrls: Record<string, string>,
  browserId: string = "chrome",
): Promise<Record<string, FormattedCookie[]>> {
  const dbPath = getChromeCookiePath(browserId);
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cookie database not found at ${dbPath}`);
  }

  // Check browser type and route to appropriate function
  const browserType = getBrowserType(browserId);

  if (browserType === "firefox") {
    // Firefox cookies are NOT encrypted - use simpler function
    return getFirefoxCookiesBatch(useUrls, dbPath);
  }

  // Chromium browsers - need decryption
  console.log(`[CookieUtils] Reading cookies from ${browserId} at ${dbPath}`);

  // 1. Get Key (Once!)
  let derivedKey: Buffer;
  try {
    derivedKey = await getDerivedKey(browserId);
  } catch (e) {
    console.warn(`Could not retrieve ${browserId} key:`, e);
    // If we fail here, we can't really proceed for encrypted cookies
    return {};
  }

  return new Promise((resolve, reject) => {
    // 2. Open DB
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
    });

    const results: Record<string, FormattedCookie[]> = {};
    const domains = Object.values(useUrls)
      .map((u) => tld.getDomain(u))
      .filter(Boolean);
    const uniqueDomains = [...new Set(domains)];

    // Construct query for all domains
    // logical OR for domains
    const domainPlaceholders = uniqueDomains
      .map(() => "host_key LIKE ?")
      .join(" OR ");
    const sql = `
      SELECT host_key, path, is_secure, expires_utc, name, value, hex(encrypted_value) as encrypted_value, creation_utc, is_httponly, has_expires 
      FROM cookies 
      WHERE ${domainPlaceholders}
    `;

    // Params need %domain% wrapped? original uses '%domain' (matches tail)
    const params = uniqueDomains.map((d) => `%${d}`);

    db.all(sql, params, (err, rows: any[]) => {
      if (err) {
        db.close();
        return reject(err);
      }

      // Process rows
      const allCookies = rows.map((row) => {
        let value = row.value;
        if (!value && row.encrypted_value) {
          const encryptedBuffer = Buffer.from(row.encrypted_value, "hex");
          value = decrypt(derivedKey, encryptedBuffer);
        }

        return {
          name: row.name,
          value: value,
          domain: row.host_key,
          path: row.path,
          expires: row.has_expires
            ? convertChromiumTimestamp(row.expires_utc)
            : 0,
          httpOnly: row.is_httponly === 1,
          secure: row.is_secure === 1,
          sameSite: "Lax", // Default
        } as FormattedCookie;
      });

      db.close();

      // Distribute back to providers
      for (const [provider, url] of Object.entries(useUrls)) {
        const domain = tld.getDomain(url);
        if (!domain) continue;

        // Filter cookies relevant to this URL
        // Simple domain matching: cookie domain must match tail of url hostname
        const urlObj = new URL(url);
        const relevant = allCookies.filter((c) => {
          // Basic domain match check
          // if cookie domain starts with ., it matches subdomains
          if (!c.domain) return false;

          // Exact match or subdomain
          // e.g. .google.com matches chatgpt.com? No.
          // .openai.com matches chat.openai.com

          // Normalize
          const cDomain = c.domain.startsWith(".")
            ? c.domain.substring(1)
            : c.domain;
          return urlObj.hostname.endsWith(cDomain);
        });

        results[provider] = relevant;
      }

      resolve(results);
    });
  });
}
