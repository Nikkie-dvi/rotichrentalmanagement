/** Room / house types a landlord can assign to a unit. */
export const UNIT_TYPES = [
  { value: "single", label: "Single room" },
  { value: "bedsitter", label: "Bedsitter" },
  { value: "studio", label: "Studio" },
  { value: "1_bedroom", label: "1 Bedroom" },
  { value: "2_bedroom", label: "2 Bedroom" },
  { value: "3_bedroom", label: "3 Bedroom" },
  { value: "4_bedroom", label: "4 Bedroom" },
  { value: "maisonette", label: "Maisonette" },
  { value: "bungalow", label: "Bungalow" },
  { value: "shop", label: "Shop / Commercial" },
  { value: "other", label: "Other" },
] as const;

export function unitTypeLabel(value?: string | null) {
  return UNIT_TYPES.find((t) => t.value === value)?.label ?? "Other";
}
