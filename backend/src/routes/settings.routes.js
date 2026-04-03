import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getStoreSettings } from "../services/store-settings.js";
import { getSystemSettings } from "../services/system-settings.js";
import { getBusinessSettings } from "../services/business-settings.js";

const router = express.Router();
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6})$/;
const ALLOWED_VERTICALS = ["general", "pharmacy", "fashion", "grocery", "restaurant", "hardware", "wholesale"];
const ALLOWED_MODULES = [
  "expirations",
  "product_presentations",
  "brands_and_sizes",
  "kitchen_orders",
  "online_store",
  "serial_tracking",
];

router.get("/public-business", async (req, res) => {
  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId = systemSettings.multiBranchEnabled && requestedBranchId ? requestedBranchId : 1;
  const settings = await getBusinessSettings(branchId, pool);
  return res.json(settings);
});

router.use(requireAuth);

router.get("/business", async (req, res) => {
  const systemSettings = await getSystemSettings(pool);
  const branchId = systemSettings.multiBranchEnabled
    ? Number(req.query.branchId || req.user.branchId || 1)
    : Number(req.user.branchId || 1);
  const settings = await getBusinessSettings(branchId, pool);
  return res.json(settings);
});

router.patch("/business", requireRole("superadmin"), async (req, res) => {
  const systemSettings = await getSystemSettings(pool);
  const branchId = systemSettings.multiBranchEnabled
    ? Number(req.body?.branchId || req.user.branchId || 1)
    : Number(req.user.branchId || 1);
  const current = await getBusinessSettings(branchId, pool);

  const keepOrTrimmed = (rawValue, fallback) => {
    if (rawValue === undefined || rawValue === null) return fallback;
    const trimmed = String(rawValue).trim();
    return trimmed ? trimmed : fallback;
  };

  const payload = {
    businessName: keepOrTrimmed(req.body?.businessName, current.businessName || "Mi Negocio"),
    nit: keepOrTrimmed(req.body?.nit, current.nit || ""),
    phone: keepOrTrimmed(req.body?.phone, current.phone || ""),
    address: keepOrTrimmed(req.body?.address, current.address || ""),
    currencyCode: keepOrTrimmed(req.body?.currencyCode, current.currencyCode || "GTQ").toUpperCase(),
    logoUrl: keepOrTrimmed(req.body?.logoUrl, current.logoUrl || ""),
    useDarkMode: typeof req.body?.useDarkMode === "boolean" ? req.body.useDarkMode : Boolean(current.useDarkMode),
    primaryColor: keepOrTrimmed(req.body?.primaryColor, current.primaryColor || "#0F172A"),
    accentColor: keepOrTrimmed(req.body?.accentColor, current.accentColor || "#1D4ED8"),
    sectionBorders:
      typeof req.body?.sectionBorders === "boolean" ? req.body.sectionBorders : Boolean(current.sectionBorders ?? true),
    lowStockThreshold:
      req.body?.lowStockThreshold === undefined || req.body?.lowStockThreshold === null
        ? Number(current.lowStockThreshold ?? 20)
        : Number(req.body.lowStockThreshold),
    storeVertical: keepOrTrimmed(req.body?.storeVertical, current.storeVertical || "general").toLowerCase(),
    enabledModules: Array.isArray(req.body?.enabledModules)
      ? req.body.enabledModules.map((value) => String(value || "").trim()).filter(Boolean)
      : Array.isArray(current.enabledModules)
      ? current.enabledModules
      : [],
  };

  if (!payload.businessName) {
    return res.status(400).json({ message: "businessName es requerido" });
  }
  if (!branchId) {
    return res.status(400).json({ message: "branchId invalido" });
  }
  if (payload.currencyCode.length < 3 || payload.currencyCode.length > 8) {
    return res.status(400).json({ message: "currencyCode invalido" });
  }
  if (!HEX_COLOR_RE.test(payload.primaryColor)) {
    return res.status(400).json({ message: "primaryColor invalido. Usa formato #RRGGBB" });
  }
  if (!HEX_COLOR_RE.test(payload.accentColor)) {
    return res.status(400).json({ message: "accentColor invalido. Usa formato #RRGGBB" });
  }
  if (!Number.isInteger(payload.lowStockThreshold) || payload.lowStockThreshold < 0 || payload.lowStockThreshold > 100000) {
    return res.status(400).json({ message: "lowStockThreshold invalido" });
  }
  if (!ALLOWED_VERTICALS.includes(payload.storeVertical)) {
    return res.status(400).json({ message: "storeVertical invalido" });
  }
  if (!payload.enabledModules.every((module) => ALLOWED_MODULES.includes(module))) {
    return res.status(400).json({ message: "enabledModules contiene valores no permitidos" });
  }

  const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [branchId]);
  if (!branchCheck.rows[0]) {
    return res.status(400).json({ message: "Sucursal invalida" });
  }

  const result = await pool.query(
    `
      INSERT INTO business_settings (
        branch_id,
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
        enabled_modules,
        updated_at,
        updated_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, NOW(), $15)
      ON CONFLICT (branch_id) DO UPDATE
      SET business_name = EXCLUDED.business_name,
          nit = EXCLUDED.nit,
          phone = EXCLUDED.phone,
          address = EXCLUDED.address,
          currency_code = EXCLUDED.currency_code,
          logo_url = EXCLUDED.logo_url,
          use_dark_mode = EXCLUDED.use_dark_mode,
          primary_color = EXCLUDED.primary_color,
          accent_color = EXCLUDED.accent_color,
          section_borders = EXCLUDED.section_borders,
          low_stock_threshold = EXCLUDED.low_stock_threshold,
          store_vertical = EXCLUDED.store_vertical,
          enabled_modules = EXCLUDED.enabled_modules,
          updated_at = NOW(),
          updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING
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
    `,
    [
      branchId,
      payload.businessName,
      payload.nit,
      payload.phone,
      payload.address,
      payload.currencyCode,
      payload.logoUrl || null,
      payload.useDarkMode,
      payload.primaryColor,
      payload.accentColor,
      payload.sectionBorders,
      payload.lowStockThreshold,
      payload.storeVertical,
      JSON.stringify(payload.enabledModules),
      req.user.sub,
    ]
  );

  const row = result.rows[0];
  return res.json({
    businessName: row.business_name,
    nit: row.nit || "",
    phone: row.phone || "",
    address: row.address || "",
    currencyCode: row.currency_code,
    logoUrl: row.logo_url || "",
    useDarkMode: Boolean(row.use_dark_mode),
    primaryColor: row.primary_color || "#0F172A",
    accentColor: row.accent_color || "#1D4ED8",
    sectionBorders: Boolean(row.section_borders ?? true),
    lowStockThreshold: Number(row.low_stock_threshold ?? 20),
    storeVertical: row.store_vertical || "general",
    enabledModules: Array.isArray(row.enabled_modules) ? row.enabled_modules : [],
  });
});

router.get("/system", requireRole("superadmin"), async (_req, res) => {
  const settings = await getSystemSettings(pool);
  return res.json(settings);
});

router.patch("/system", requireRole("superadmin"), async (req, res) => {
  const multiBranchEnabled = req.body?.multiBranchEnabled;
  if (typeof multiBranchEnabled !== "boolean") {
    return res.status(400).json({ message: "multiBranchEnabled debe ser boolean" });
  }

  const result = await pool.query(
    `
      INSERT INTO system_settings (id, multi_branch_enabled, updated_at, updated_by_user_id)
      VALUES (1, $1, NOW(), $2)
      ON CONFLICT (id) DO UPDATE
      SET multi_branch_enabled = EXCLUDED.multi_branch_enabled,
          updated_at = NOW(),
          updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING multi_branch_enabled
    `,
    [multiBranchEnabled, req.user.sub]
  );

  return res.json({
    multiBranchEnabled: Boolean(result.rows[0].multi_branch_enabled),
  });
});

router.get("/store", async (req, res) => {
  const branchId = req.user.branchId;
  const storeSettings = await getStoreSettings(branchId, pool);
  return res.json(storeSettings);
});

router.patch("/store", requireRole("superadmin"), async (req, res) => {
  const cashierCanCharge = req.body?.cashierCanCharge;
  const systemSettings = await getSystemSettings(pool);
  const branchId = systemSettings.multiBranchEnabled
    ? Number(req.body?.branchId || req.user.branchId)
    : Number(req.user.branchId || 1);
  if (typeof cashierCanCharge !== "boolean") {
    return res.status(400).json({ message: "cashierCanCharge debe ser boolean" });
  }
  if (!branchId) {
    return res.status(400).json({ message: "branchId invalido" });
  }

  let result;
  try {
    result = await pool.query(
      `
        INSERT INTO store_settings (branch_id, cashier_can_charge, updated_at, updated_by_user_id)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (branch_id) DO UPDATE
        SET cashier_can_charge = EXCLUDED.cashier_can_charge,
            updated_at = NOW(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
        RETURNING cashier_can_charge
      `,
      [branchId, cashierCanCharge, req.user.sub]
    );
  } catch {
    result = await pool.query(
      `
        INSERT INTO store_settings (id, cashier_can_charge, updated_at, updated_by_user_id)
        VALUES (1, $1, NOW(), $2)
        ON CONFLICT (id) DO UPDATE
        SET cashier_can_charge = EXCLUDED.cashier_can_charge,
            updated_at = NOW(),
            updated_by_user_id = EXCLUDED.updated_by_user_id
        RETURNING cashier_can_charge
      `,
      [cashierCanCharge, req.user.sub]
    );
  }

  return res.json({
    cashierCanCharge: Boolean(result.rows[0].cashier_can_charge),
  });
});

export default router;
