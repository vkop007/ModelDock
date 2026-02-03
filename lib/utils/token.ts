export const DEFAULT_COST_PER_1K_TOKENS_USD = 0.002;

export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function estimateCostUSD(
  tokens: number,
  costPer1k = DEFAULT_COST_PER_1K_TOKENS_USD,
): number {
  if (!tokens || tokens <= 0) return 0;
  return (tokens / 1000) * costPer1k;
}
