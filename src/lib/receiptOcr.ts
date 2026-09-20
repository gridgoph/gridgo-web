/**
 * Pull a wallet reference out of receipt OCR text.
 *
 * Copied from gridgo-client/lib/receiptOcr.ts so Operations can read the same
 * number the client app does. Do not edit the client file from this port.
 *
 * GRIDGO matches GCash / Maya / InstaPay transfers by the reference printed
 * on the screenshot. Dates, amounts and the "Ref. No." label itself are not
 * that number. An empty or weak read returns null — never a guessed value.
 */

/** Shortest reference Operations can match against the GRIDGO wallet. */
const MIN_REFERENCE_LENGTH = 4;
const MAX_REFERENCE_LENGTH = 64;

export const OCR_UNREADABLE = "The number could not be read. Type it.";
export const OCR_READING = "Reading the reference from your screenshot…";

/** Overall Tesseract confidence below this, with a short unlabeled token, is discarded. */
export const OCR_LOW_CONFIDENCE = 25;

const LABEL =
  /(?:instapay\s+)?ref(?:erence)?\.?\s*(?:no\.?|number|#)?/i;

const LABELED_CAPTURE =
  /(?:instapay\s+)?ref(?:erence)?\.?\s*(?:no\.?|number|#)?[:.\s-]*([A-Z0-9][A-Z0-9 \-]{6,})/i;

// A complete printed number ends before a neighbouring date or copy icon.
// Never join those OCR tokens onto it, or truncate a longer PAN/mobile.
const LABELED_NUMBER =
  /(?:instapay\s+)?ref(?:erence)?\.?\s*(?:no\.?|number|#)?[:.,\s-]*(\d+(?:[ \t]+\d+)*)(?=$|\s|[)])/i;

const NUMBER_SUFFIX =
  /^(?:\)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)?)?$/i;

const AMBIGUOUS_REFERENCE = Symbol("ambiguous reference");

const TOKEN = /[A-Z0-9][A-Z0-9 \-]{6,31}/gi;

const MONTH =
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i;

const WALLET_WORD = /^(GCASH|MAYA|INSTAPAY|REFERENCE|NUMBER|PHP|PHPESO|BANCNET)$/;

/** GCash biller receipts print "GCash Reference No." with a 9-digit number. */
const GCASH_LABEL = /gcash\s+ref(?:erence)?/i;

/** Card PANs on a Bankard/GCash receipt are not the wallet reference. */
function isCardPan(token: string): boolean {
  return /^\d{15,16}$/.test(token);
}

/** PH mobiles printed on a GCash send receipt, with or without +63. */
function isPhMobile(token: string): boolean {
  const digits = token.replace(/\D/g, "");
  if (/^0?9\d{9}$/.test(digits)) return true;
  if (/^63\d{10}$/.test(digits)) return true;
  return false;
}

export function stripReferenceToken(raw: string): string {
  return raw.replace(/[\s\-]/g, "").toUpperCase();
}

export function looksLikeDate(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(text)) return true;
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(text)) return true;
  if (MONTH.test(text)) return true;
  if (/^\d{8}$/.test(stripReferenceToken(text))) return true;
  return false;
}

export function looksLikeAmount(raw: string): boolean {
  const text = raw.trim();
  if (/(?:₱|php)\s*\d/i.test(text)) return true;
  if (/\d{1,3}(?:,\d{3})+\.\d{2}/.test(text)) return true;
  if (/^\d+\.\d{2}$/.test(text)) return true;
  return false;
}

function isCandidate(token: string): boolean {
  if (token.length < Math.max(8, MIN_REFERENCE_LENGTH)) return false;
  if (token.length > MAX_REFERENCE_LENGTH) return false;
  if (!/[0-9]/.test(token)) return false;
  if (WALLET_WORD.test(token)) return false;
  if (isCardPan(token)) return false;
  if (isPhMobile(token)) return false;
  if (/^\d{8}$/.test(token)) return false;
  return true;
}

/**
 * A biller receipt often stacks labels in one column and numbers in the other,
 * so the line after "GCash Reference No." may be another label, not the number.
 */
function numberNearLabel(lines: string[], labelIndex: number): string | null | typeof AMBIGUOUS_REFERENCE {
  const line = lines[labelIndex];
  const labeled = line.match(LABELED_CAPTURE);
  if (labeled?.[1]) {
    const hit = accept(labeled[1]);
    if (hit) return hit;
  }
  const rest = line.replace(LABEL, "").replace(/^[:.\s-]+/, "");
  if (rest) {
    const fromRest = accept(rest);
    if (fromRest) return fromRest;
  }
  for (let j = labelIndex + 1; j < Math.min(lines.length, labelIndex + 5); j += 1) {
    const next = lines[j];
    if (looksLikeDate(next) || looksLikeAmount(next)) continue;
    if (LABEL.test(next)) continue;
    if (/[A-Z]/i.test(next) && !/\d/.test(next)) return AMBIGUOUS_REFERENCE;
    const fromNext = accept(next);
    if (fromNext) return fromNext;
  }
  return null;
}

function accept(raw: string): string | null {
  const parts = raw.trim().split(/\s+/);
  if (!parts.every((part) => /^(?=.*\d)[A-Z0-9-]+$/i.test(part))) return null;
  if (looksLikeDate(raw) || looksLikeAmount(raw)) return null;
  const token = stripReferenceToken(raw);
  return isCandidate(token) ? token : null;
}

/**
 * The reference Operations can match, or null when the text does not contain
 * one we can trust. Never invents a number from leftover digits.
 */
export function extractPaymentReference(text: string): string | null {
  const source = text.replace(/\u00a0/g, " ").replace(/(\d)[ \t]+0\)/g, "$1")
    .replace(/[ \t]+\d{1,2}[ \t]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[ \t,]+\d{4}\b[^\r\n]*/gi, "")
    .trim();
  if (!source) return null;

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // Prefer the explicitly named GCash reference over the biller's BancNet id.
  // OCR often puts the date in the same line, so inspect the number before
  // applying whole-line date/amount rejection below.
  for (const gcashOnly of [true, false]) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (gcashOnly && !GCASH_LABEL.test(line)) continue;
      if (!LABEL.test(line)) continue;
      const number = line.match(LABELED_NUMBER);
      const printed = number ? stripReferenceToken(number[1]) : null;
      const suffix = number ? line.slice(number.index! + number[0].length).trim() : null;
      if (printed && suffix != null && NUMBER_SUFFIX.test(suffix) && isCandidate(printed)) {
        return printed;
      }
      if (looksLikeDate(line) || looksLikeAmount(line)) continue;
      const hit = numberNearLabel(lines, i);
      if (hit === AMBIGUOUS_REFERENCE) return null;
      if (hit) return hit;
    }
  }

  const unlabeled: string[] = [];
  for (const match of source.match(TOKEN) ?? []) {
    const hit = accept(match);
    if (hit) unlabeled.push(hit);
  }
  if (unlabeled.length === 0) return null;

  const gcash = unlabeled.find((token) => /^\d{13}$/.test(token));
  if (gcash) return gcash;

  const biller = unlabeled.find((token) => /^\d{9}$/.test(token));
  if (biller && GCASH_LABEL.test(source)) return biller;

  unlabeled.sort((a, b) => b.length - a.length);
  const best = unlabeled[0];
  // Unlabeled short runs are how OCR invents a "reference" from a date or a
  // phone. Demand a wallet-length token when there was no label.
  return best.length >= 10 ? best : null;
}

export function referenceFromOcr(result: {
  text: string;
  confidence: number;
} | null): string | null {
  if (!result) return null;
  const extracted = extractPaymentReference(result.text);
  if (!extracted) return null;
  if (result.confidence < OCR_LOW_CONFIDENCE && extracted.length < 12) return null;
  return extracted;
}

export type ReceiptOcrStatus = "idle" | "reading" | "filled" | "unreadable";

export type ReceiptOcrState = {
  status: ReceiptOcrStatus;
  reference: string | null;
};

export const OCR_IDLE: ReceiptOcrState = { status: "idle", reference: null };

/** Legacy stateless mapping; checkout uses useCheckoutPayment.applyOcrReference. */
export function nextReferenceFromOcr(current: string, ocr: ReceiptOcrState): string {
  if (ocr.status === "filled" && ocr.reference) return ocr.reference;
  if (ocr.status === "unreadable") return "";
  return current;
}
