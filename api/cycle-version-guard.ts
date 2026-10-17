export function requireCurrentRevision(sourceId: number, latestId: number, latestRev: number): void {
  if (sourceId !== latestId) {
    throw new Error(`Revisione superata: aprire la revisione ${latestRev} prima di salvare.`);
  }
}
