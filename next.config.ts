import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: [
    "puppeteer-core",
    "puppeteer",
    "puppeteer-real-browser",
    "chrome-cookies-secure",
    "keytar",
    "sqlite3",
  ],
};

export default nextConfig;
