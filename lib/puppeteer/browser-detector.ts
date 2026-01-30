import fs from "fs";
import path from "path";
import os from "os";

export interface DetectedBrowser {
  id: string;
  name: string;
  installed: boolean;
  cookiePath: string;
  profilePath: string;
  icon: string;
}

interface BrowserConfig {
  id: string;
  name: string;
  icon: string;
  paths: {
    darwin?: string[];
    win32?: string[];
    linux?: string[];
  };
  cookieFile: string;
  type: "chromium" | "firefox";
}

const HOME = os.homedir();

// Browser configurations with paths for each OS
const BROWSER_CONFIGS: BrowserConfig[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    icon: "chrome",
    paths: {
      darwin: [
        path.join(HOME, "Library/Application Support/Google/Chrome/Default"),
      ],
      win32: [
        path.join(
          process.env.LOCALAPPDATA || "",
          "Google/Chrome/User Data/Default",
        ),
      ],
      linux: [path.join(HOME, ".config/google-chrome/Default")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "chrome-beta",
    name: "Google Chrome Beta",
    icon: "chrome",
    paths: {
      darwin: [
        path.join(
          HOME,
          "Library/Application Support/Google/Chrome Beta/Default",
        ),
      ],
      win32: [
        path.join(
          process.env.LOCALAPPDATA || "",
          "Google/Chrome Beta/User Data/Default",
        ),
      ],
      linux: [path.join(HOME, ".config/google-chrome-beta/Default")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "chromium",
    name: "Chromium",
    icon: "chromium",
    paths: {
      darwin: [path.join(HOME, "Library/Application Support/Chromium/Default")],
      win32: [
        path.join(process.env.LOCALAPPDATA || "", "Chromium/User Data/Default"),
      ],
      linux: [path.join(HOME, ".config/chromium/Default")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    icon: "edge",
    paths: {
      darwin: [
        path.join(HOME, "Library/Application Support/Microsoft Edge/Default"),
      ],
      win32: [
        path.join(
          process.env.LOCALAPPDATA || "",
          "Microsoft/Edge/User Data/Default",
        ),
      ],
      linux: [path.join(HOME, ".config/microsoft-edge/Default")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "brave",
    name: "Brave",
    icon: "brave",
    paths: {
      darwin: [
        path.join(
          HOME,
          "Library/Application Support/BraveSoftware/Brave-Browser/Default",
        ),
      ],
      win32: [
        path.join(
          process.env.LOCALAPPDATA || "",
          "BraveSoftware/Brave-Browser/User Data/Default",
        ),
      ],
      linux: [path.join(HOME, ".config/BraveSoftware/Brave-Browser/Default")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "arc",
    name: "Arc",
    icon: "arc",
    paths: {
      darwin: [
        path.join(HOME, "Library/Application Support/Arc/User Data/Default"),
      ],
      // Arc is macOS only for now
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    icon: "vivaldi",
    paths: {
      darwin: [path.join(HOME, "Library/Application Support/Vivaldi/Default")],
      win32: [
        path.join(process.env.LOCALAPPDATA || "", "Vivaldi/User Data/Default"),
      ],
      linux: [path.join(HOME, ".config/vivaldi/Default")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  {
    id: "opera",
    name: "Opera",
    icon: "opera",
    paths: {
      darwin: [
        path.join(HOME, "Library/Application Support/com.operasoftware.Opera"),
      ],
      win32: [
        path.join(process.env.APPDATA || "", "Opera Software/Opera Stable"),
      ],
      linux: [path.join(HOME, ".config/opera")],
    },
    cookieFile: "Cookies",
    type: "chromium",
  },
  // Firefox - uses different profile structure
  {
    id: "firefox",
    name: "Mozilla Firefox",
    icon: "firefox",
    paths: {
      darwin: [path.join(HOME, "Library/Application Support/Firefox/Profiles")],
      win32: [path.join(process.env.APPDATA || "", "Mozilla/Firefox/Profiles")],
      linux: [path.join(HOME, ".mozilla/firefox")],
    },
    cookieFile: "cookies.sqlite",
    type: "firefox",
  },
];

/**
 * Find Firefox default profile directory
 * Firefox profiles are in folders like "xxxxx.default-release" or "xxxxx.default"
 */
function findFirefoxProfile(profilesDir: string): string | null {
  if (!fs.existsSync(profilesDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(profilesDir);
    // Look for default-release first (newer Firefox), then default
    const defaultRelease = entries.find((e) => e.endsWith(".default-release"));
    if (defaultRelease) {
      return path.join(profilesDir, defaultRelease);
    }

    const defaultProfile = entries.find((e) => e.endsWith(".default"));
    if (defaultProfile) {
      return path.join(profilesDir, defaultProfile);
    }

    // Fallback: find any profile directory
    const anyProfile = entries.find((e) => {
      const fullPath = path.join(profilesDir, e);
      return (
        fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, "cookies.sqlite"))
      );
    });
    if (anyProfile) {
      return path.join(profilesDir, anyProfile);
    }
  } catch (e) {
    console.error("[BrowserDetector] Error finding Firefox profile:", e);
  }

  return null;
}

/**
 * Detect all installed browsers on the system
 */
export function detectInstalledBrowsers(): DetectedBrowser[] {
  const platform = process.platform as "darwin" | "win32" | "linux";
  const detectedBrowsers: DetectedBrowser[] = [];

  for (const config of BROWSER_CONFIGS) {
    const paths = config.paths[platform];
    if (!paths || paths.length === 0) {
      continue;
    }

    // Check each possible path for this browser
    for (const basePath of paths) {
      let profilePath: string;
      let cookiePath: string;

      if (config.type === "firefox") {
        // Firefox uses a different profile structure
        const firefoxProfile = findFirefoxProfile(basePath);
        if (!firefoxProfile) {
          continue;
        }
        profilePath = firefoxProfile;
        cookiePath = path.join(profilePath, config.cookieFile);
      } else {
        // Chromium browsers
        profilePath = basePath;
        cookiePath = path.join(profilePath, config.cookieFile);
      }

      // Check if the cookie file exists (indicates browser is installed and has been used)
      const installed = fs.existsSync(cookiePath);

      if (installed) {
        detectedBrowsers.push({
          id: config.id,
          name: config.name,
          installed: true,
          cookiePath,
          profilePath,
          icon: config.icon,
        });
        // Only add first found instance
        break;
      }
    }
  }

  return detectedBrowsers;
}

/**
 * Get the cookie database path for a specific browser
 */
export function getBrowserCookiePath(browserId: string): string | null {
  const platform = process.platform as "darwin" | "win32" | "linux";

  const config = BROWSER_CONFIGS.find((c) => c.id === browserId);
  if (!config) {
    return null;
  }

  const paths = config.paths[platform];
  if (!paths || paths.length === 0) {
    return null;
  }

  for (const basePath of paths) {
    let cookiePath: string;

    if (config.type === "firefox") {
      const firefoxProfile = findFirefoxProfile(basePath);
      if (!firefoxProfile) {
        continue;
      }
      cookiePath = path.join(firefoxProfile, config.cookieFile);
    } else {
      cookiePath = path.join(basePath, config.cookieFile);
    }

    if (fs.existsSync(cookiePath)) {
      return cookiePath;
    }
  }

  return null;
}

/**
 * Get the browser type (chromium or firefox)
 */
export function getBrowserType(
  browserId: string,
): "chromium" | "firefox" | null {
  const config = BROWSER_CONFIGS.find((c) => c.id === browserId);
  return config?.type || null;
}

/**
 * Get browser display info by ID
 */
export function getBrowserInfo(
  browserId: string,
): { name: string; icon: string } | null {
  const config = BROWSER_CONFIGS.find((c) => c.id === browserId);
  if (!config) {
    return null;
  }
  return { name: config.name, icon: config.icon };
}

/**
 * Get the keychain service name for decryption key retrieval
 * Different browsers may use different keychain entries
 */
export function getKeychainService(browserId: string): {
  service: string;
  account: string;
} {
  // Most Chromium browsers use Chrome's keychain entry on macOS
  // Some browsers may have their own
  switch (browserId) {
    case "brave":
      return { service: "Brave Safe Storage", account: "Brave" };
    case "edge":
      return {
        service: "Microsoft Edge Safe Storage",
        account: "Microsoft Edge",
      };
    case "chromium":
      return { service: "Chromium Safe Storage", account: "Chromium" };
    case "vivaldi":
      return { service: "Vivaldi Safe Storage", account: "Vivaldi" };
    case "opera":
      return { service: "Opera Safe Storage", account: "Opera" };
    case "arc":
      return { service: "Arc Safe Storage", account: "Arc" };
    case "chrome":
    case "chrome-beta":
    default:
      return { service: "Chrome Safe Storage", account: "Chrome" };
  }
}
