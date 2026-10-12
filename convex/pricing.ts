// Official OpenAI standard API prices, checked 2026-10-12. USD per 1M tokens.
// https://developers.openai.com/api/docs/models/gpt-4.1
// https://developers.openai.com/api/docs/models/gpt-4.1-mini
// https://developers.openai.com/api/docs/models/gpt-image-1
// Web-search tool: https://developers.openai.com/api/docs/pricing
export const PRICES = {
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-image-1": { textInput: 5, cachedTextInput: 1.25, imageInput: 10, cachedImageInput: 2.5, output: 40 },
} as const;
export const WEB_SEARCH_USD_PER_CALL = 10 / 1000;
// Fixed reporting conversion, not a live foreign-exchange quote.
export const USD_TO_INR = 90;
export const PRICING_DATE = "2026-10-12";
export const PRICING_URL = "https://developers.openai.com/api/docs/pricing";

// Preserve actual usage separately; never invent missing token counts.
export function priceCall(model: string, usage: any, webSearchCalls = 0) {
  if (!usage || typeof usage.input_tokens !== "number" || typeof usage.output_tokens !== "number")
    return { costUSD: null, costINR: null };
  let costUSD: number;
  if (model === "gpt-image-1") {
    const details = usage.input_tokens_details;
    if (typeof details?.text_tokens !== "number" || typeof details?.image_tokens !== "number")
      return { costUSD: null, costINR: null };
    const p = PRICES[model];
    const cached = details.cached_tokens_details;
    // Current generations use text input only. If cached multimodal input is returned
    // without its modality breakdown, its price cannot be calculated honestly.
    if (details.cached_tokens && !cached) return { costUSD: null, costINR: null };
    const textCached = cached?.text_tokens ?? 0, imageCached = cached?.image_tokens ?? 0;
    costUSD = ((details.text_tokens - textCached) * p.textInput + textCached * p.cachedTextInput
      + (details.image_tokens - imageCached) * p.imageInput + imageCached * p.cachedImageInput
      + usage.output_tokens * p.output) / 1_000_000;
  } else if (model === "gpt-4.1" || model === "gpt-4.1-mini") {
    const p = PRICES[model], cached = usage.input_tokens_details?.cached_tokens ?? 0;
    costUSD = ((usage.input_tokens - cached) * p.input + cached * p.cachedInput + usage.output_tokens * p.output) / 1_000_000;
  } else return { costUSD: null, costINR: null };
  costUSD += webSearchCalls * WEB_SEARCH_USD_PER_CALL;
  return { costUSD, costINR: costUSD * USD_TO_INR };
}
