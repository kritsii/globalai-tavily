// Models sometimes echo internal IDs into prose ("…founded in 2009 [F8].").
// Citations are rendered from factIds/sourceIds, so inline markers are noise.
const INTERNAL_ID_MARKER =
  /\s*[[(]\s*[FS]\d+(?:\s*[,;&]\s*(?:and\s+)?[FS]?\d+)*\s*[\])]/g;

export function stripInternalIdMarkers(text: string): string {
  return text
    .replace(INTERNAL_ID_MARKER, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

