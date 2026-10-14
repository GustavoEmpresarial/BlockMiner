export type PartDropNotice = {
  partSlug?: string | null;
  quantity?: number | null;
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Toast copy for a common part that dropped on an activity claim. Null when the roll missed. */
export function formatPartDropNotice(
  part: PartDropNotice | null | undefined,
  translate: Translate,
): string | null {
  const quantity = Number(part?.quantity ?? 0);
  const slug = typeof part?.partSlug === "string" ? part.partSlug.trim() : "";
  if (!slug || !Number.isFinite(quantity) || quantity <= 0) return null;
  const name = translate(`parts.items.${slug}`, { defaultValue: slug });
  return translate("parts.drop_toast", { quantity, name });
}
