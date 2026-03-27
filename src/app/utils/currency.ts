const GT_LOCALE = "es-GT";

export function formatCurrency(value: number): string {
  return `Q${value.toLocaleString(GT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
