export const MAX_QUOTE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_QUOTE_ATTACHMENTS = 20;
export const MAX_QUOTE_ATTACHMENT_TOTAL = 50 * 1024 * 1024;
export const MAX_QUOTE_FILE_BASE64 = 4 * Math.ceil(MAX_QUOTE_FILE_BYTES / 3);

export function quoteFileName(name: string): string {
  return name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 180);
}

/** Browser MIME declarations are untrusted. Only these formats are previewed. */
export function quoteFileMime(bytes: Uint8Array, name: string): string {
  const starts = (...signature: number[]) => signature.every((n, i) => bytes[i] === n);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38, 0x37, 0x61) || starts(0x47, 0x49, 0x46, 0x38, 0x39, 0x61)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (/\.(txt|csv|tsv|log)$/i.test(name) && !bytes.subarray(0, 8192).includes(0)) return "text/plain";
  return "application/octet-stream";
}
