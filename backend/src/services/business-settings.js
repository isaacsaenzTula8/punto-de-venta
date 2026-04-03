import { pool } from "../db/pool.js";

const DEFAULT_SETTINGS = {
  businessName: "Mi Negocio",
  nit: "",
  phone: "",
  address: "",
  currencyCode: "GTQ",
  logoUrl: "",
  useDarkMode: false,
  primaryColor: "#0F172A",
  accentColor: "#1D4ED8",
  sectionBorders: true,
  lowStockThreshold: 20,
  storeVertical: "general",
  enabledModules: [],
};

export async function getBusinessSettings(branchId, client = pool) {
  try {
    const result = await client.query(
      `
        SELECT
          business_name,
          nit,
          phone,
          address,
          currency_code,
          logo_url,
          use_dark_mode,
          primary_color,
          accent_color,
          section_borders,
          low_stock_threshold,
          store_vertical,
          enabled_modules
        FROM business_settings
        WHERE branch_id = $1
        LIMIT 1
      `,
      [branchId]
    );

    const row = result.rows[0];
    if (!row) return DEFAULT_SETTINGS;

    return {
      businessName: row.business_name || DEFAULT_SETTINGS.businessName,
      nit: row.nit || "",
      phone: row.phone || "",
      address: row.address || "",
      currencyCode: row.currency_code || "GTQ",
      logoUrl: row.logo_url || "",
      useDarkMode: Boolean(row.use_dark_mode),
      primaryColor: row.primary_color || DEFAULT_SETTINGS.primaryColor,
      accentColor: row.accent_color || DEFAULT_SETTINGS.accentColor,
      sectionBorders: Boolean(row.section_borders ?? true),
      lowStockThreshold: Number(row.low_stock_threshold ?? DEFAULT_SETTINGS.lowStockThreshold),
      storeVertical: row.store_vertical || DEFAULT_SETTINGS.storeVertical,
      enabledModules: Array.isArray(row.enabled_modules) ? row.enabled_modules : DEFAULT_SETTINGS.enabledModules,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
