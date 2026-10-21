// SPDX-License-Identifier: AGPL-3.0-only
/** Cotações só informativas. Nenhuma ordem, corretora ou carteira. */

export const QUOTE_DISCLAIMER = "Só informativo, não é recomendação";

export type QuoteKind = "crypto" | "fx" | "equity";

export interface AssetSpec {
  symbol: string;
  kind: QuoteKind;
  label: string;
  /** Fonte pública gratuita documentada. */
  source: "coingecko" | "frankfurter" | "finnhub";
  /** Variação absoluta (%) que dispara alerta (João define). */
  alertAbsPct: number;
  /** CoinGecko id ou par Frankfurter ou símbolo Finnhub. */
  externalId: string;
}

/** Lista inicial do João. Ações exigem chave Finnhub no setup:cloud. */
export const DEFAULT_ASSETS: readonly AssetSpec[] = [
  { symbol: "BTC", kind: "crypto", label: "Bitcoin", source: "coingecko", alertAbsPct: 8, externalId: "bitcoin" },
  { symbol: "ETH", kind: "crypto", label: "Ether", source: "coingecko", alertAbsPct: 8, externalId: "ethereum" },
  { symbol: "USD-BRL", kind: "fx", label: "Dólar / real", source: "frankfurter", alertAbsPct: 2, externalId: "USD" },
  { symbol: "EUR-BRL", kind: "fx", label: "Euro / real", source: "frankfurter", alertAbsPct: 2, externalId: "EUR" },
  { symbol: "PETR4.SA", kind: "equity", label: "Petrobras PN", source: "finnhub", alertAbsPct: 5, externalId: "PETR4.SA" },
];

export interface Quote {
  symbol: string;
  price: number;
  changePct: number | null;
  source: string;
  quotedAt: string;
  fetchedAt: string;
  disclaimer: typeof QUOTE_DISCLAIMER;
}

export const QUOTE_MAX_AGE_MS = 15 * 60_000;

export function isQuoteStale(quote: Pick<Quote, "fetchedAt">, now: number, maxAgeMs = QUOTE_MAX_AGE_MS): boolean {
  const t = Date.parse(quote.fetchedAt);
  if (!Number.isFinite(t)) return true;
  return now - t > maxAgeMs;
}

export function withStaleFlag<T extends Quote>(quote: T, now: number): T & { stale: boolean } {
  return { ...quote, stale: isQuoteStale(quote, now) };
}

export function shouldAlert(changePct: number | null, limitAbsPct: number): boolean {
  if (changePct === null || !Number.isFinite(changePct)) return false;
  return Math.abs(changePct) >= limitAbsPct;
}

export interface QuoteCard {
  quote: Quote;
  stale: boolean;
  alert: boolean;
  disclaimer: typeof QUOTE_DISCLAIMER;
}

export function quoteCard(quote: Quote, now: number, limitAbsPct: number): QuoteCard {
  return {
    quote: { ...quote, disclaimer: QUOTE_DISCLAIMER },
    stale: isQuoteStale(quote, now),
    alert: shouldAlert(quote.changePct, limitAbsPct),
    disclaimer: QUOTE_DISCLAIMER,
  };
}

/** Não existe e não pode existir caminho de ordem. */
export const TRADE_ACTIONS = [] as const;
export function hasTradeCapability(): false {
  return false;
}
