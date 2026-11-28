/** Check ZIP metadata before SheetJS allocation; verify actual inflated bytes
 * through a bounded stream when the platform provides deflate-raw. */
export async function verifyXlsxContainer(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    u16 = (n: number) => view.getUint16(n, true),
    u32 = (n: number) => view.getUint32(n, true);
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--)
    if (u32(n) === 0x06054b50 && n + 22 + u16(n + 20) === bytes.length) {
      end = n;
      break;
    }
  if (end < 0) throw Error("Indice ZIP mancante o corrotto");
  const count = u16(end + 10),
    size = u32(end + 12),
    offset = u32(end + 16);
  if (
    u16(end + 4) ||
    u16(end + 6) ||
    count !== u16(end + 8) ||
    count === 65535 ||
    count > 2000 ||
    offset + size > end
  )
    throw Error("Contenitore ZIP non supportato o eccessivo");
  let pos = offset,
    total = 0,
    actualTotal = 0;
  const occupied: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    if (pos + 46 > offset + size || u32(pos) !== 0x02014b50)
      throw Error("Indice ZIP non valido");
    const flags = u16(pos + 8),
      method = u16(pos + 10),
      compressed = u32(pos + 20),
      expanded = u32(pos + 24),
      nameLength = u16(pos + 28),
      extra = u16(pos + 30),
      comment = u16(pos + 32),
      local = u32(pos + 42);
    total += expanded;
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      expanded > 16 * 1024 * 1024 ||
      total > 64 * 1024 * 1024 ||
      pos + 46 + nameLength + extra + comment > offset + size ||
      local + 30 > offset ||
      u32(local) !== 0x04034b50
    )
      throw Error("Workbook compresso oltre i limiti o non supportato");
    if (u16(local + 8) !== method || u16(local + 6) & 1)
      throw Error("Metadati ZIP discordanti");
    const start = local + 30 + u16(local + 26) + u16(local + 28),
      finish = start + compressed;
    if (
      start > offset ||
      finish > offset ||
      occupied.some(([a, b]) => local < b && finish > a)
    )
      throw Error("Intervalli ZIP non validi");
    occupied.push([local, finish]);
    if (method === 0) {
      if (compressed !== expanded) throw Error("Dimensione ZIP discordante");
      actualTotal += expanded;
    } else {
      // Unsupported browsers fail closed with a clear message, never inflate unchecked.
      let decompressor: DecompressionStream;
      try {
        decompressor = new DecompressionStream("deflate-raw");
      } catch {
        throw Error(
          "Aggiornare il browser: controllo di sicurezza XLSX non disponibile"
        );
      }
      const stream = new Blob([bytes.slice(start, finish)])
          .stream()
          .pipeThrough(decompressor),
        reader = stream.getReader();
      let actual = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          actual += chunk.value.byteLength;
          actualTotal += chunk.value.byteLength;
          if (
            actual > expanded ||
            actual > 16 * 1024 * 1024 ||
            actualTotal > 64 * 1024 * 1024
          ) {
            await reader.cancel();
            throw Error("Dimensione decompressione oltre i limiti");
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (actual !== expanded)
        throw Error("Dimensione decompressa discordante");
    }
    pos += 46 + nameLength + extra + comment;
  }
  if (pos !== offset + size) throw Error("Indice ZIP incompleto");
}
