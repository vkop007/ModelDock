import fs from "fs";
import path from "path";
import crypto from "crypto";
import sqlite3 from "sqlite3";
// @ts-ignore
import tld from "tldjs";
// @ts-ignore
import keytar from "keytar";

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

async function getDerivedKey(): Promise<Buffer> {
  if (process.platform === "darwin") {
    const password = await keytar.getPassword("Chrome Safe Storage", "Chrome");
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

function getChromeCookiePath(): string {
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
function convertTimestamp(timestamp: number): number {
  // Chromium uses Windows Gregorian epoch (1601-01-01) in microseconds
  // Unix is 1970-01-01 in seconds (or ms)
  // Difference is 11644473600 seconds
  return Math.floor(timestamp / 1000000 - 11644473600);
}

export async function getCookiesBatch(
  useUrls: Record<string, string>,
): Promise<Record<string, FormattedCookie[]>> {
  const dbPath = getChromeCookiePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cookie database not found at ${dbPath}`);
  }

  // 1. Get Key (Once!)
  let derivedKey: Buffer;
  try {
    derivedKey = await getDerivedKey();
  } catch (e) {
    console.warn("Could not retrieve Chrome key:", e);
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
          expires: row.has_expires ? convertTimestamp(row.expires_utc) : 0,
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
