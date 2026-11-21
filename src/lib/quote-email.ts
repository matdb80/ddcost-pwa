/**
 * R3 (TKT-20261117-84210001): preparazione manuale dell'email per il preventivo.
 * Il protocollo mailto: non può allegare file: si apre la finestra di stampa e si
 * richiede l'apertura della posta con oggetto e corpo precompilati. Non si
 * confermano né il salvataggio del PDF né l'apertura effettiva della posta;
 * l'utente deve salvare e allegare il PDF prima dell'invio.
 */
export const QUOTE_EMAIL_BODY =
  "Gentile Cliente,\n" +
  "in allegato il preventivo richiesto, restiamo a disposizione per eventuali chiarimenti\n" +
  "\nCordiali saluti";

type QuoteEmailSource = {
  numero_preventivo?: unknown;
  riferimento_preventivo?: unknown;
  cliente?: unknown;
};

export function quoteEmailSubject(doc: QuoteEmailSource, fallbackId?: number): string {
  const number = typeof doc.numero_preventivo === "string" && doc.numero_preventivo.trim()
    ? doc.numero_preventivo.trim()
    : fallbackId ? String(fallbackId) : "";
  const reference = String(doc.riferimento_preventivo ?? "").trim();
  const client = String(doc.cliente ?? "").trim();
  const parts = ["Preventivo", number || reference || "unatantum"];
  if (client) parts.push("-", client);
  return parts.join(" ");
}

export function buildQuoteMailto(doc: QuoteEmailSource, fallbackId?: number): string {
  return "mailto:?subject=" + encodeURIComponent(quoteEmailSubject(doc, fallbackId)) +
    "&body=" + encodeURIComponent(QUOTE_EMAIL_BODY);
}

/** Apre il programma di posta predefinito senza navigare via dalla PWA. */
export function openMailClient(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Web Share API Level 2: vero solo quando il browser accetta file. */
export function canShareFiles(file: File): boolean {
  try {
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    return typeof nav.canShare === "function" && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Condivide il PDF come file (Outlook/mail app sul dispositivo). Lancia se annullato o non riuscito. */
export async function shareQuotePdfFile(file: File, text: string): Promise<void> {
  const nav = navigator as Navigator & { share?: (data: { files: File[]; text: string }) => Promise<void> };
  if (typeof nav.share !== "function") throw new Error("Condivisione file non supportata dal browser");
  await nav.share({ files: [file], text });
}

/** Scarica il PDF e restituisce il nome file: il mailto resta con allegato MANUALE esplicito. */
export function downloadQuotePdfFile(file: File): string {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return file.name;
}
