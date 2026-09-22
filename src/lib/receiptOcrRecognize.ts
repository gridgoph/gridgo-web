/**
 * OCR a payment-receipt screenshot in the browser.
 *
 * Same Tesseract build and English model the client WebView uses
 * (`tesseract.js@5.1.1` + `@tesseract.js-data/eng` best_int). The parser in
 * `receiptOcr.ts` then pulls the wallet reference out of the text.
 */

export type ReceiptOcrRaw = { text: string; confidence: number };

type TesseractWorker = {
  recognize: (image: HTMLCanvasElement | string) => Promise<{
    data: { text?: string; confidence?: number };
  }>;
  terminate: () => Promise<void>;
};

type TesseractNS = {
  createWorker: (
    lang: string,
    oem: number,
    options: Record<string, unknown>,
  ) => Promise<TesseractWorker>;
};

const TESSERACT_SRC =
  "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

let tesseractPromise: Promise<TesseractNS> | null = null;

function loadTesseract(): Promise<TesseractNS> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Receipt OCR runs in the browser."));
  }
  const existing = (window as Window & { Tesseract?: TesseractNS }).Tesseract;
  if (existing) return Promise.resolve(existing);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = (window as Window & { Tesseract?: TesseractNS }).Tesseract;
      if (loaded) resolve(loaded);
      else reject(new Error("The receipt reader could not download."));
    };
    script.onerror = () => {
      tesseractPromise = null;
      reject(new Error("The receipt reader could not download."));
    };
    document.head.appendChild(script);
  });
  return tesseractPromise;
}

/**
 * Wallet screenshots can be only a few hundred pixels wide. Enlarge the small
 * reference type the same way the client WebView does, without changing the
 * stored receipt.
 */
export async function receiptImageFromUrl(source: string): Promise<HTMLCanvasElement> {
  const objectUrl = await blobUrlFor(source);
  try {
    const img = new Image();
    img.src = objectUrl;
    await img.decode();
    const scale = Math.min(3, Math.max(1, 1200 / img.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("That screenshot could not be read.");
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function blobUrlFor(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("That screenshot could not be read.");
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function recognizeReceiptFromUrl(
  url: string,
  isCurrent: () => boolean = () => true,
): Promise<ReceiptOcrRaw> {
  const Tesseract = await loadTesseract();
  if (!isCurrent()) throw new Error("replaced");
  const canvas = await receiptImageFromUrl(url);
  if (!isCurrent()) throw new Error("replaced");
  const worker = await Tesseract.createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    langPath: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
    logger: () => {},
  });
  try {
    if (!isCurrent()) throw new Error("replaced");
    const result = await worker.recognize(canvas);
    return {
      text: result.data.text ?? "",
      confidence: typeof result.data.confidence === "number" ? result.data.confidence : 0,
    };
  } finally {
    await worker.terminate();
  }
}
