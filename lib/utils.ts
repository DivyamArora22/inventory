export function toIntOrZero(v: string): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export function toFloatOrZero(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function piecesToBags(pieces: number, piecesPerBag: number): { bags: number; leftoverPieces: number } {
  if (piecesPerBag <= 0) return { bags: 0, leftoverPieces: pieces };
  const bags = Math.floor(pieces / piecesPerBag);
  const leftoverPieces = pieces % piecesPerBag;
  return { bags, leftoverPieces };
}
