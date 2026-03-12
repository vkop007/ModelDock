import { NextRequest, NextResponse } from "next/server";
import {
  PUBLIC_API_PROVIDERS,
  getConfiguredApiKeyRequirement,
  getProviderRuntimeStatus,
  requirePublicApiAuth,
} from "@/lib/server/modeldock-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = requirePublicApiAuth(request);
  if (authError) {
    return authError;
  }

  const providers = await Promise.all(
    PUBLIC_API_PROVIDERS.map((provider) => getProviderRuntimeStatus(provider)),
  );

  return NextResponse.json({
    success: true,
    authRequired: getConfiguredApiKeyRequirement(),
    providers,
  });
}
