const stableQuoteAssets = ["USDT", "USDC", "FDUSD"] as const;

/**
 * Accept a base asset such as ETH or EDGE and default it to a USDT pair.
 * A quote suffix only marks a complete pair when another asset precedes it.
 */
export function normalizeTradingSymbol(value: string) {
  const cleaned = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "";
  const hasQuoteAsset = stableQuoteAssets.some(
    (quote) => cleaned.length > quote.length && cleaned.endsWith(quote),
  );
  return hasQuoteAsset ? cleaned : `${cleaned}USDT`;
}

/** Prefer the requested asset's USDT market, then allow an explicitly entered pair. */
export function tradingSymbolCandidates(value: string) {
  const cleaned = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return [];
  const preferred = normalizeTradingSymbol(cleaned);
  return preferred === cleaned ? [cleaned] : [preferred, cleaned];
}
