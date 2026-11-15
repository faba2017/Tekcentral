import type { ProductSpecification } from "@/types/product";

export interface LegacyProductDetail {
  label: string;
  value: string;
}

export type ProductBodyPresentation =
  | { kind: "prose"; paragraphs: string[]; details: [] }
  | { kind: "details"; paragraphs: string[]; details: LegacyProductDetail[] };

const normalizedLabel = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const detailLine = /^([^:\n]{2,80}):\s+(.+)$/;

export function presentProductBody(
  description?: string,
  overview?: string,
  structuredSpecifications: ProductSpecification[] = [],
): ProductBodyPresentation | undefined {
  const body = description?.trim() || overview?.trim();
  if (!body) return undefined;

  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed: Array<{ line: string; label?: string; value?: string }> = lines.map((line) => {
    const match = line.match(detailLine);
    return match ? { line, label: match[1]!.trim(), value: match[2]!.trim() } : { line };
  });
  const detailCount = parsed.filter((item) => item.label !== undefined).length;
  const isLegacyDetailList = detailCount >= 3 && detailCount / lines.length >= 0.7;

  if (!isLegacyDetailList) {
    return { kind: "prose", paragraphs: body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean), details: [] };
  }

  const structuredLabels = new Set(structuredSpecifications.map((item) => normalizedLabel(item.name)));
  const details: LegacyProductDetail[] = parsed.flatMap((item) => item.label !== undefined && item.value !== undefined && !structuredLabels.has(normalizedLabel(item.label))
    ? [{ label: item.label, value: item.value }]
    : []);
  const paragraphs = parsed.flatMap((item) => item.label !== undefined ? [] : [item.line]);
  return { kind: "details", paragraphs, details };
}
