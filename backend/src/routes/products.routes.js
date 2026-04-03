import express from "express";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSystemSettings } from "../services/system-settings.js";
import { getBusinessSettings } from "../services/business-settings.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsProductsDir = path.resolve(__dirname, "../../uploads/products");

async function ensureUploadsDir() {
  await fs.mkdir(uploadsProductsDir, { recursive: true });
}

function parseImageDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");
  const ext = mime === "image/png" ? "png" : "jpg";
  return { buffer, ext };
}

async function saveProductImageDataUrl(dataUrl) {
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("Formato de imagen invalido. Solo se permite PNG o JPG");
  }
  if (parsed.buffer.length > 2 * 1024 * 1024) {
    throw new Error("La imagen es demasiado grande. Maximo 2 MB");
  }
  await ensureUploadsDir();
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${parsed.ext}`;
  const fullPath = path.join(uploadsProductsDir, fileName);
  await fs.writeFile(fullPath, parsed.buffer);
  return `/uploads/products/${fileName}`;
}

async function deletePreviousImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return;
  if (!imageUrl.startsWith("/uploads/products/")) return;
  const fileName = imageUrl.replace("/uploads/products/", "");
  const fullPath = path.join(uploadsProductsDir, fileName);
  try {
    await fs.unlink(fullPath);
  } catch {
    // Ignorar si no existe o no se puede borrar.
  }
}

function parseBooleanValue(value, fallback = true) {
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "si", "sí", "yes", "activo", "active"].includes(raw)) return true;
  if (["0", "false", "no", "inactivo", "inactive"].includes(raw)) return false;
  return fallback;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

async function isExpirationsEnabled(branchId) {
  const settings = await getBusinessSettings(branchId, pool);
  const modules = Array.isArray(settings?.enabledModules) ? settings.enabledModules : [];
  return modules.includes("expirations");
}

async function isBrandsAndSizesEnabled(branchId) {
  const settings = await getBusinessSettings(branchId, pool);
  const modules = Array.isArray(settings?.enabledModules) ? settings.enabledModules : [];
  return modules.includes("brands_and_sizes");
}

async function isBarcodeAlreadyUsed(barcode, excludeProductId = null) {
  const normalizedBarcode = typeof barcode === "string" ? barcode.trim() : "";
  if (!normalizedBarcode) return false;
  const result = await pool.query(
    `
      SELECT id
      FROM products
      WHERE barcode = $1
        AND ($2::int IS NULL OR id <> $2)
      LIMIT 1
    `,
    [normalizedBarcode, excludeProductId]
  );
  return Boolean(result.rows[0]);
}

router.use(requireAuth);

router.get("/:id/presentations", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ message: "ID de producto invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const productCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [productId, branchId]
  );
  if (!productCheck.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }

  const result = await pool.query(
    `
      SELECT id, product_id, branch_id, name, sku, barcode, units_factor, price, is_default, active
      FROM product_presentations
      WHERE product_id = $1
        AND branch_id = $2
      ORDER BY is_default DESC, units_factor ASC, id ASC
    `,
    [productId, branchId]
  );

  return res.json(
    result.rows.map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      branchId: Number(row.branch_id),
      name: row.name,
      sku: row.sku || "",
      barcode: row.barcode || "",
      unitsFactor: Number(row.units_factor || 1),
      price: Number(row.price || 0),
      isDefault: Boolean(row.is_default),
      active: Boolean(row.active),
    }))
  );
});

router.post("/:id/presentations", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ message: "ID de producto invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const name = String(req.body?.name || "").trim();
  const sku = req.body?.sku ? String(req.body.sku).trim() : null;
  const barcode = req.body?.barcode ? String(req.body.barcode).trim() : null;
  const unitsFactor = Number(req.body?.unitsFactor || 0);
  const price = Number(req.body?.price || 0);
  const isDefault = Boolean(req.body?.isDefault);

  if (!name) return res.status(400).json({ message: "name es requerido" });
  if (!Number.isInteger(unitsFactor) || unitsFactor <= 0) {
    return res.status(400).json({ message: "unitsFactor invalido" });
  }
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ message: "price invalido" });
  }

  const productCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [productId, branchId]
  );
  if (!productCheck.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (isDefault) {
      await client.query(
        "UPDATE product_presentations SET is_default = false, updated_at = NOW() WHERE product_id = $1",
        [productId]
      );
    }

    const inserted = await client.query(
      `
        INSERT INTO product_presentations (
          product_id, branch_id, name, sku, barcode, units_factor, price, is_default, active, updated_at
        )
        VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, true, NOW())
        RETURNING id, product_id, branch_id, name, sku, barcode, units_factor, price, is_default, active
      `,
      [productId, branchId, name, sku, barcode, unitsFactor, price, isDefault]
    );
    await client.query("COMMIT");
    const row = inserted.rows[0];
    return res.status(201).json({
      id: Number(row.id),
      productId: Number(row.product_id),
      branchId: Number(row.branch_id),
      name: row.name,
      sku: row.sku || "",
      barcode: row.barcode || "",
      unitsFactor: Number(row.units_factor || 1),
      price: Number(row.price || 0),
      isDefault: Boolean(row.is_default),
      active: Boolean(row.active),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505" && error?.constraint === "idx_product_presentations_barcode_unique") {
      return res.status(409).json({ message: "Codigo de barras de presentacion duplicado" });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "La presentacion ya existe" });
    }
    throw error;
  } finally {
    client.release();
  }
});

router.patch("/presentations/:presentationId", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const presentationId = Number(req.params.presentationId);
  if (!presentationId) return res.status(400).json({ message: "ID de presentacion invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const name = req.body?.name === undefined ? null : String(req.body.name || "").trim();
  const sku = req.body?.sku === undefined ? null : String(req.body.sku || "").trim();
  const barcode = req.body?.barcode === undefined ? null : String(req.body.barcode || "").trim();
  const unitsFactor = req.body?.unitsFactor === undefined ? null : Number(req.body.unitsFactor);
  const price = req.body?.price === undefined ? null : Number(req.body.price);
  const isDefault = req.body?.isDefault === undefined ? null : Boolean(req.body.isDefault);
  const active = req.body?.active === undefined ? null : Boolean(req.body.active);

  if (unitsFactor !== null && (!Number.isInteger(unitsFactor) || unitsFactor <= 0)) {
    return res.status(400).json({ message: "unitsFactor invalido" });
  }
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return res.status(400).json({ message: "price invalido" });
  }
  if (name !== null && !name) {
    return res.status(400).json({ message: "name invalido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT id, product_id FROM product_presentations WHERE id = $1 AND branch_id = $2 LIMIT 1 FOR UPDATE",
      [presentationId, branchId]
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Presentacion no encontrada" });
    }

    if (isDefault === true) {
      await client.query(
        "UPDATE product_presentations SET is_default = false, updated_at = NOW() WHERE product_id = $1",
        [current.rows[0].product_id]
      );
    }

    const updated = await client.query(
      `
        UPDATE product_presentations
        SET
          name = COALESCE($1, name),
          sku = CASE WHEN $2::text IS NULL THEN sku ELSE NULLIF($2, '') END,
          barcode = CASE WHEN $3::text IS NULL THEN barcode ELSE NULLIF($3, '') END,
          units_factor = COALESCE($4, units_factor),
          price = COALESCE($5, price),
          is_default = COALESCE($6, is_default),
          active = COALESCE($7, active),
          updated_at = NOW()
        WHERE id = $8 AND branch_id = $9
        RETURNING id, product_id, branch_id, name, sku, barcode, units_factor, price, is_default, active
      `,
      [name, sku, barcode, unitsFactor, price, isDefault, active, presentationId, branchId]
    );
    await client.query("COMMIT");

    const row = updated.rows[0];
    return res.json({
      id: Number(row.id),
      productId: Number(row.product_id),
      branchId: Number(row.branch_id),
      name: row.name,
      sku: row.sku || "",
      barcode: row.barcode || "",
      unitsFactor: Number(row.units_factor || 1),
      price: Number(row.price || 0),
      isDefault: Boolean(row.is_default),
      active: Boolean(row.active),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505" && error?.constraint === "idx_product_presentations_barcode_unique") {
      return res.status(409).json({ message: "Codigo de barras de presentacion duplicado" });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "La presentacion ya existe" });
    }
    throw error;
  } finally {
    client.release();
  }
});

router.delete("/presentations/:presentationId", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const presentationId = Number(req.params.presentationId);
  if (!presentationId) return res.status(400).json({ message: "ID de presentacion invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const result = await pool.query(
    `
      UPDATE product_presentations
      SET active = false,
          is_default = false,
          updated_at = NOW()
      WHERE id = $1
        AND branch_id = $2
      RETURNING id
    `,
    [presentationId, branchId]
  );
  if (!result.rows[0]) {
    return res.status(404).json({ message: "Presentacion no encontrada" });
  }

  return res.json({ ok: true });
});

router.get("/:id/batches", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ message: "ID de producto invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const productCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [productId, branchId]
  );
  if (!productCheck.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }
  if (!(await isExpirationsEnabled(branchId))) {
    return res.status(403).json({ message: "El modulo de caducidades/lotes no esta activo" });
  }

  const result = await pool.query(
    `
      SELECT
        b.id,
        b.product_id,
        b.branch_id,
        b.batch_code,
        b.expiration_date,
        b.quantity_initial,
        b.quantity_current,
        b.unit_cost,
        b.active,
        b.created_at,
        b.updated_at
      FROM product_batches b
      WHERE b.product_id = $1
        AND b.branch_id = $2
      ORDER BY
        CASE WHEN b.expiration_date IS NULL THEN 1 ELSE 0 END,
        b.expiration_date ASC,
        b.id ASC
    `,
    [productId, branchId]
  );

  return res.json(
    result.rows.map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      branchId: Number(row.branch_id),
      batchCode: row.batch_code,
      expirationDate: row.expiration_date || null,
      quantityInitial: Number(row.quantity_initial || 0),
      quantityCurrent: Number(row.quantity_current || 0),
      unitCost: Number(row.unit_cost || 0),
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  );
});

router.post("/:id/batches", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ message: "ID de producto invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const batchCode = String(req.body?.batchCode || "").trim();
  const expirationDateRaw = String(req.body?.expirationDate || "").trim();
  const quantity = Number(req.body?.quantity || 0);
  const unitCost = Number(req.body?.unitCost || 0);
  const reason = String(req.body?.reason || "Ingreso de lote").trim();

  if (!batchCode) return res.status(400).json({ message: "batchCode es requerido" });
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "quantity invalido" });
  }
  if (!Number.isFinite(unitCost) || unitCost < 0) {
    return res.status(400).json({ message: "unitCost invalido" });
  }
  if (expirationDateRaw && !isIsoDate(expirationDateRaw)) {
    return res.status(400).json({ message: "expirationDate invalido (usa YYYY-MM-DD)" });
  }

  const productCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [productId, branchId]
  );
  if (!productCheck.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }
  if (!(await isExpirationsEnabled(branchId))) {
    return res.status(403).json({ message: "El modulo de caducidades/lotes no esta activo" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `
        INSERT INTO product_batches (
          product_id, branch_id, batch_code, expiration_date, quantity_initial, quantity_current, unit_cost, active, created_by_user_id
        )
        VALUES ($1, $2, $3, NULLIF($4, '')::date, $5, $5, $6, true, $7)
        RETURNING id, product_id, branch_id, batch_code, expiration_date, quantity_initial, quantity_current, unit_cost, active
      `,
      [productId, branchId, batchCode, expirationDateRaw || null, quantity, unitCost, req.user.sub]
    );

    const batch = inserted.rows[0];
    await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2 AND branch_id = $3", [
      quantity,
      productId,
      branchId,
    ]);
    await client.query(
      `
        INSERT INTO product_batch_movements (
          batch_id, product_id, branch_id, movement_type, quantity, reason, created_by_user_id
        )
        VALUES ($1, $2, $3, 'in', $4, $5, $6)
      `,
      [batch.id, productId, branchId, quantity, reason || "Ingreso de lote", req.user.sub]
    );

    await client.query("COMMIT");
    return res.status(201).json({
      id: Number(batch.id),
      productId: Number(batch.product_id),
      branchId: Number(batch.branch_id),
      batchCode: batch.batch_code,
      expirationDate: batch.expiration_date || null,
      quantityInitial: Number(batch.quantity_initial || 0),
      quantityCurrent: Number(batch.quantity_current || 0),
      unitCost: Number(batch.unit_cost || 0),
      active: Boolean(batch.active),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      return res.status(409).json({ message: "El lote ya existe para este producto" });
    }
    throw error;
  } finally {
    client.release();
  }
});

router.post("/batches/:batchId/adjust", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const batchId = Number(req.params.batchId);
  if (!batchId) return res.status(400).json({ message: "ID de lote invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const movementType = String(req.body?.movementType || "").trim().toLowerCase();
  const quantity = Number(req.body?.quantity || 0);
  const reason = String(req.body?.reason || "").trim();
  const allowed = ["in", "out", "adjust"];
  if (!(await isExpirationsEnabled(branchId))) {
    return res.status(403).json({ message: "El modulo de caducidades/lotes no esta activo" });
  }

  if (!allowed.includes(movementType)) {
    return res.status(400).json({ message: "movementType invalido" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ message: "quantity invalido" });
  }
  if (!reason) {
    return res.status(400).json({ message: "reason es requerido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchResult = await client.query(
      `
        SELECT id, product_id, branch_id, quantity_current, active
        FROM product_batches
        WHERE id = $1
          AND branch_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [batchId, branchId]
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Lote no encontrado" });
    }
    if (!batch.active) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El lote esta inactivo" });
    }

    const sign = movementType === "out" ? -1 : 1;
    const delta = sign * quantity;
    const nextQty = Number(batch.quantity_current || 0) + delta;
    if (nextQty < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El ajuste deja lote en negativo" });
    }

    await client.query(
      `
        UPDATE product_batches
        SET quantity_current = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [nextQty, batchId]
    );
    await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2 AND branch_id = $3", [
      delta,
      batch.product_id,
      branchId,
    ]);
    await client.query(
      `
        INSERT INTO product_batch_movements (
          batch_id, product_id, branch_id, movement_type, quantity, reason, created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [batchId, batch.product_id, branchId, movementType, quantity, reason, req.user.sub]
    );
    await client.query("COMMIT");
    return res.json({ ok: true, quantityCurrent: nextQty });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.get("/:id/discounts", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ message: "ID de producto invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const productCheck = await pool.query(
    "SELECT id FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [productId, branchId]
  );
  if (!productCheck.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }

  const result = await pool.query(
    `
      SELECT
        pd.id,
        pd.product_id,
        pd.branch_id,
        pd.discount_type,
        pd.discount_value,
        pd.start_at,
        pd.end_at,
        pd.active,
        pd.created_at,
        pd.updated_at
      FROM product_discounts pd
      WHERE pd.product_id = $1
        AND pd.branch_id = $2
      ORDER BY pd.start_at DESC, pd.id DESC
      LIMIT 50
    `,
    [productId, branchId]
  );

  return res.json(
    result.rows.map((row) => ({
      id: Number(row.id),
      productId: Number(row.product_id),
      branchId: Number(row.branch_id),
      discountType: row.discount_type,
      discountValue: Number(row.discount_value || 0),
      startAt: row.start_at,
      endAt: row.end_at,
      active: Boolean(row.active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  );
});

router.post("/:id/discounts", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const productId = Number(req.params.id);
  if (!productId) return res.status(400).json({ message: "ID de producto invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const discountType = String(req.body?.discountType || "").trim().toLowerCase();
  const discountValue = Number(req.body?.discountValue || 0);
  const startAt = String(req.body?.startAt || "").trim();
  const endAt = String(req.body?.endAt || "").trim();

  if (!["amount", "percent"].includes(discountType)) {
    return res.status(400).json({ message: "discountType invalido" });
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return res.status(400).json({ message: "discountValue invalido" });
  }
  if (discountType === "percent" && discountValue > 100) {
    return res.status(400).json({ message: "El porcentaje no puede ser mayor a 100" });
  }
  if (!startAt || !endAt) {
    return res.status(400).json({ message: "startAt y endAt son obligatorios" });
  }
  if (new Date(startAt).toString() === "Invalid Date" || new Date(endAt).toString() === "Invalid Date") {
    return res.status(400).json({ message: "Formato de fecha invalido" });
  }
  if (new Date(endAt) <= new Date(startAt)) {
    return res.status(400).json({ message: "endAt debe ser mayor a startAt" });
  }

  const productCheck = await pool.query(
    "SELECT id, price FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [productId, branchId]
  );
  if (!productCheck.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }
  if (discountType === "amount" && discountValue > Number(productCheck.rows[0].price || 0)) {
    return res.status(400).json({ message: "El descuento por monto no puede superar el precio del producto" });
  }

  const inserted = await pool.query(
    `
      INSERT INTO product_discounts (
        product_id,
        branch_id,
        discount_type,
        discount_value,
        start_at,
        end_at,
        active,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5::timestamp, $6::timestamp, true, $7, $7)
      RETURNING id, product_id, branch_id, discount_type, discount_value, start_at, end_at, active, created_at, updated_at
    `,
    [productId, branchId, discountType, discountValue, startAt, endAt, req.user.sub]
  );

  const row = inserted.rows[0];
  return res.status(201).json({
    id: Number(row.id),
    productId: Number(row.product_id),
    branchId: Number(row.branch_id),
    discountType: row.discount_type,
    discountValue: Number(row.discount_value || 0),
    startAt: row.start_at,
    endAt: row.end_at,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
});

router.delete("/discounts/:discountId", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const discountId = Number(req.params.discountId);
  if (!discountId) return res.status(400).json({ message: "ID de descuento invalido" });

  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  const result = await pool.query(
    `
      UPDATE product_discounts
      SET active = false,
          updated_at = NOW(),
          updated_by_user_id = $1
      WHERE id = $2
        AND branch_id = $3
      RETURNING id
    `,
    [req.user.sub, discountId, branchId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Descuento no encontrado" });
  }

  return res.json({ ok: true });
});

router.post("/reassign-branch", requireRole("superadmin"), async (req, res) => {
  const systemSettings = await getSystemSettings(pool);
  if (!systemSettings.multiBranchEnabled) {
    return res.status(403).json({ message: "La reasignacion de sucursal esta desactivada" });
  }

  const targetBranchId = Number(req.body?.targetBranchId || 0);
  const productIdsRaw = Array.isArray(req.body?.productIds) ? req.body.productIds : [];
  const productIds = [...new Set(productIdsRaw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (!targetBranchId) {
    return res.status(400).json({ message: "targetBranchId invalido" });
  }
  if (!productIds.length) {
    return res.status(400).json({ message: "Debes enviar al menos un producto" });
  }

  const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [targetBranchId]);
  if (!branchCheck.rows[0]) {
    return res.status(400).json({ message: "Sucursal destino invalida" });
  }

  const result = await pool.query(
    `
      WITH selected AS (
        SELECT
          p.id,
          p.category_id,
          src.name AS source_category_name
        FROM products p
        LEFT JOIN categories src ON src.id = p.category_id
        WHERE p.id = ANY($2::int[])
      ),
      moved AS (
        UPDATE products p
        SET
          branch_id = $1,
          category_id = dst.id,
          updated_at = NOW()
        FROM selected s
        LEFT JOIN categories dst
          ON dst.branch_id = $1
         AND lower(trim(dst.name)) = lower(trim(s.source_category_name))
         AND dst.active = true
        WHERE p.id = s.id
        RETURNING p.id, s.source_category_name, dst.id AS mapped_category_id
      )
      SELECT
        id,
        source_category_name,
        mapped_category_id
      FROM moved
    `,
    [targetBranchId, productIds]
  );

  const movedRows = result.rows || [];
  const mappedCount = movedRows.filter((row) => Number(row.mapped_category_id || 0) > 0).length;
  const unmapped = movedRows
    .filter((row) => !row.mapped_category_id)
    .map((row) => ({
      productId: Number(row.id),
      sourceCategoryName: row.source_category_name || null,
    }));

  return res.json({
    ok: true,
    movedCount: movedRows.length,
    mappedCategoryCount: mappedCount,
    unmappedCategoryCount: unmapped.length,
    movedIds: movedRows.map((r) => Number(r.id)),
    unmappedCategories: unmapped,
  });
});

router.post("/import", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;

  if (!rows.length) {
    return res.status(400).json({ message: "Debes enviar filas para importar" });
  }
  if (rows.length > 3000) {
    return res.status(400).json({ message: "Maximo 3000 filas por importacion" });
  }

  const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [branchId]);
  if (!branchCheck.rows[0]) {
    return res.status(400).json({ message: "Sucursal invalida" });
  }
  const expirationsEnabled = await isExpirationsEnabled(branchId);
  const brandsAndSizesEnabled = await isBrandsAndSizesEnabled(branchId);

  const client = await pool.connect();
  const issues = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    await client.query("BEGIN");

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const rowNumber = index + 1;
      const inputSku = String(row.sku || "").trim();
      const sku = inputSku || `SKU-AUTO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const name = String(row.name || "").trim();
      const categoryName = String(row.category || "Otros").trim() || "Otros";
      const barcode = String(row.barcode || "").trim();
      const brand = String(row.brand || row.marca || "").trim();
      const sizeLabel = brandsAndSizesEnabled
        ? String(row.sizeLabel || row.size_label || row.talla || "").trim()
        : "";
      const locationCode = String(row.locationCode || row.location_code || "").trim();
      const description = String(row.description || "").trim();
      const expirationDate = String(
        row.expirationDate || row.expiration_date || row.fechaCaducidad || row.fecha_caducidad || ""
      ).trim();
      const expirationRequired = expirationsEnabled
        ? parseBooleanValue(
        row.expirationRequired ?? row.expiration_required ?? row.requiereCaducidad ?? row.requiere_caducidad,
            false
          )
        : false;
      const parsedCost = Number(row.cost ?? 0);
      const parsedPrice = Number(row.price ?? 0);
      const parsedStock = Number(row.stock ?? 0);
      const active = parseBooleanValue(row.active, true);

      if (!name) {
        skipped += 1;
        issues.push({ row: rowNumber, message: "Nombre es obligatorio" });
        continue;
      }
      if (
        Number.isNaN(parsedCost) ||
        Number.isNaN(parsedPrice) ||
        Number.isNaN(parsedStock) ||
        parsedCost < 0 ||
        parsedPrice < 0 ||
        parsedStock < 0
      ) {
        skipped += 1;
        issues.push({ row: rowNumber, message: "cost, price o stock invalidos" });
        continue;
      }

      try {
        await client.query("SAVEPOINT import_row");

        let categoryId = null;
        const existingCategory = await client.query(
          `
            SELECT id
            FROM categories
            WHERE branch_id = $1
              AND lower(trim(name)) = lower(trim($2))
            LIMIT 1
          `,
          [branchId, categoryName]
        );

        if (existingCategory.rows[0]) {
          categoryId = Number(existingCategory.rows[0].id);
        } else {
          const insertedCategory = await client.query(
            `
              INSERT INTO categories (name, active, branch_id)
              VALUES ($1, true, $2)
              RETURNING id
            `,
            [categoryName, branchId]
          );
          categoryId = Number(insertedCategory.rows[0].id);
        }

        const result = await client.query(
          `
            INSERT INTO products (
              sku, barcode, name, brand, size_label, cost, price, stock, category_id, description, location_code, expiration_required, expiration_date, active, branch_id
            )
            VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, $9, NULLIF($10, ''), NULLIF($11, ''), $12, NULLIF($13, '')::date, $14, $15)
            ON CONFLICT (sku)
            DO UPDATE SET
              barcode = EXCLUDED.barcode,
              name = EXCLUDED.name,
              brand = EXCLUDED.brand,
              size_label = EXCLUDED.size_label,
              cost = EXCLUDED.cost,
              price = EXCLUDED.price,
              stock = EXCLUDED.stock,
              category_id = EXCLUDED.category_id,
              description = EXCLUDED.description,
              location_code = EXCLUDED.location_code,
            expiration_required = EXCLUDED.expiration_required,
            expiration_date = EXCLUDED.expiration_date,
              active = EXCLUDED.active,
              updated_at = NOW()
            RETURNING id, sku, barcode, price, (xmax = 0) AS inserted
          `,
          [
            sku,
            barcode,
            name,
            brand,
            brandsAndSizesEnabled ? sizeLabel.slice(0, 80) : null,
            parsedCost,
            parsedPrice,
            parsedStock,
            categoryId,
            description,
            locationCode.slice(0, 40),
            expirationRequired,
            expirationsEnabled ? expirationDate || null : null,
            active,
            branchId,
          ]
        );
        const upserted = result.rows[0];
        await client.query(
          `
            INSERT INTO product_presentations (
              product_id, branch_id, name, sku, barcode, units_factor, price, is_default, active, updated_at
            )
            VALUES ($1, $2, 'Unidad', $3, $4, 1, $5, true, true, NOW())
            ON CONFLICT DO NOTHING
          `,
          [Number(upserted.id), branchId, upserted.sku, upserted.barcode, Number(upserted.price || 0)]
        );
        if (upserted?.inserted) {
          created += 1;
        } else {
          updated += 1;
        }
        await client.query("RELEASE SAVEPOINT import_row");
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT import_row");
        await client.query("RELEASE SAVEPOINT import_row");
        skipped += 1;
        if (error?.code === "23505" && error?.constraint === "idx_products_barcode_unique") {
          issues.push({ row: rowNumber, message: "Codigo de barras duplicado" });
        } else if (error?.code === "23505") {
          issues.push({ row: rowNumber, message: "Conflicto unico (SKU o categoria)" });
        } else {
          issues.push({ row: rowNumber, message: "No se pudo importar la fila" });
        }
      }
    }

    await client.query("COMMIT");
    return res.json({
      ok: true,
      branchId,
      totalRows: rows.length,
      created,
      updated,
      skipped,
      issues: issues.slice(0, 300),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Error al importar productos" });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  const includeInactive = String(req.query.includeInactive || "0") === "1";
  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.sku,
        p.barcode,
        p.name,
        p.brand,
        p.size_label,
        p.cost,
        p.price,
        CASE
          WHEN apd.discount_type = 'percent' THEN GREATEST(0, ROUND((p.price - ((p.price * apd.discount_value) / 100.0))::numeric, 2))
          WHEN apd.discount_type = 'amount' THEN GREATEST(0, ROUND((p.price - apd.discount_value)::numeric, 2))
          ELSE p.price
        END AS discounted_price,
        apd.discount_type AS active_discount_type,
        apd.discount_value AS active_discount_value,
        apd.start_at AS active_discount_start_at,
        apd.end_at AS active_discount_end_at,
        p.stock,
        p.description,
        p.image_url,
        p.location_code,
        p.expiration_required,
        p.expiration_date,
        p.category_id,
        p.active,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT discount_type, discount_value, start_at, end_at
        FROM product_discounts pd
        WHERE pd.product_id = p.id
          AND pd.branch_id = p.branch_id
          AND pd.active = true
          AND NOW() BETWEEN pd.start_at AND pd.end_at
        ORDER BY pd.start_at DESC, pd.id DESC
        LIMIT 1
      ) apd ON true
      WHERE p.branch_id = $1
      ${includeInactive ? "" : "AND p.active = true"}
      ORDER BY p.name ASC
    `,
    [branchId]
  );
  const presentationRows = await pool.query(
    `
      SELECT
        id,
        product_id,
        name,
        sku,
        barcode,
        units_factor,
        price,
        is_default,
        active
      FROM product_presentations
      WHERE branch_id = $1
        AND active = true
      ORDER BY is_default DESC, units_factor ASC, id ASC
    `,
    [branchId]
  );
  const presentationsByProduct = new Map();
  for (const row of presentationRows.rows) {
    const productId = String(row.product_id);
    if (!presentationsByProduct.has(productId)) {
      presentationsByProduct.set(productId, []);
    }
    presentationsByProduct.get(productId).push({
      id: Number(row.id),
      name: row.name,
      sku: row.sku || "",
      barcode: row.barcode || "",
      unitsFactor: Number(row.units_factor || 1),
      price: Number(row.price || 0),
      isDefault: Boolean(row.is_default),
      active: Boolean(row.active),
    });
  }

  return res.json(
    result.rows.map((row) => ({
      id: String(row.id),
      sku: row.sku,
      barcode: row.barcode || "",
      name: row.name,
      brand: row.brand || "",
      sizeLabel: row.size_label || "",
      cost: Number(row.cost || 0),
      price: Number(row.price),
      discountedPrice: Number(row.discounted_price || row.price || 0),
      hasActiveDiscount: Boolean(row.active_discount_type),
      activeDiscountType: row.active_discount_type || null,
      activeDiscountValue: row.active_discount_value !== null ? Number(row.active_discount_value || 0) : null,
      activeDiscountStartAt: row.active_discount_start_at || null,
      activeDiscountEndAt: row.active_discount_end_at || null,
      stock: Number(row.stock),
      presentations: presentationsByProduct.get(String(row.id)) || [],
      description: row.description || "",
      imageUrl: row.image_url || "",
      locationCode: row.location_code || "",
      expirationRequired: Boolean(row.expiration_required),
      expirationDate: row.expiration_date || null,
      categoryId: row.category_id ? String(row.category_id) : "",
      category: row.category || "Otros",
      active: Boolean(row.active),
    }))
  );
});

router.post("/", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const {
    sku,
    barcode,
    name,
    brand,
    sizeLabel,
    cost,
    price,
    stock,
    categoryId,
    description = null,
    imageDataUrl,
    locationCode,
    expirationRequired = false,
    expirationDate = null,
  } = req.body || {};
  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.body?.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;
  if (!sku || !name || cost === undefined || price === undefined || stock === undefined) {
    return res.status(400).json({ message: "sku, name, cost, price y stock son requeridos" });
  }

  const parsedCost = Number(cost);
  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const parsedCategoryId = categoryId ? Number(categoryId) : null;
  const normalizedBarcode = typeof barcode === "string" && barcode.trim() ? barcode.trim() : null;
  const normalizedLocationCode = typeof locationCode === "string" && locationCode.trim() ? locationCode.trim().slice(0, 40) : null;
  const normalizedExpirationDate =
    typeof expirationDate === "string" && expirationDate.trim() ? expirationDate.trim().slice(0, 10) : null;
  const normalizedExpirationRequired = Boolean(expirationRequired);

  if (
    Number.isNaN(parsedCost) ||
    parsedCost < 0 ||
    Number.isNaN(parsedPrice) ||
    parsedPrice < 0 ||
    Number.isNaN(parsedStock) ||
    parsedStock < 0
  ) {
    return res.status(400).json({ message: "cost, price o stock invalidos" });
  }
  if (normalizedBarcode && (await isBarcodeAlreadyUsed(normalizedBarcode))) {
    return res.status(409).json({ message: "El codigo de barras ya existe" });
  }

  const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [branchId]);
  if (!branchCheck.rows[0]) {
    return res.status(400).json({ message: "Sucursal invalida" });
  }
  const expirationsEnabled = await isExpirationsEnabled(branchId);
  const brandsAndSizesEnabled = await isBrandsAndSizesEnabled(branchId);
  if (parsedCategoryId) {
    const categoryCheck = await pool.query(
      "SELECT id FROM categories WHERE id = $1 AND branch_id = $2 AND active = true LIMIT 1",
      [parsedCategoryId, branchId]
    );
    if (!categoryCheck.rows[0]) {
      return res.status(400).json({ message: "Categoria invalida para la sucursal seleccionada" });
    }
  }

  let imageUrl = null;
  if (typeof imageDataUrl === "string" && imageDataUrl.trim()) {
    try {
      imageUrl = await saveProductImageDataUrl(imageDataUrl.trim());
    } catch (error) {
      return res.status(400).json({ message: error?.message || "Imagen invalida" });
    }
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO products (
          sku, barcode, name, brand, cost, price, stock, category_id, description, image_url, location_code,
          size_label,
          expiration_required, expiration_date, active, branch_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::date, true, $15)
        RETURNING id, sku, barcode, name, brand, size_label, cost, price, stock, category_id, description, image_url, location_code, expiration_required, expiration_date, active
      `,
      [
        String(sku).trim(),
        normalizedBarcode,
        String(name).trim(),
        typeof brand === "string" && brand.trim() ? brand.trim() : null,
        brandsAndSizesEnabled && typeof sizeLabel === "string" && sizeLabel.trim() ? sizeLabel.trim().slice(0, 80) : null,
        parsedCost,
        parsedPrice,
        parsedStock,
        parsedCategoryId,
        description,
        imageUrl,
        normalizedLocationCode,
        expirationsEnabled ? normalizedExpirationRequired : false,
        expirationsEnabled ? normalizedExpirationDate : null,
        branchId,
      ]
    );
    const created = result.rows[0];
    await pool.query(
      `
        INSERT INTO product_presentations (
          product_id, branch_id, name, sku, barcode, units_factor, price, is_default, active, updated_at
        )
        VALUES ($1, $2, 'Unidad', $3, $4, 1, $5, true, true, NOW())
        ON CONFLICT DO NOTHING
      `,
      [created.id, branchId, created.sku, created.barcode, created.price]
    );
    return res.status(201).json(created);
  } catch (error) {
    if (error?.code === "23505" && error?.constraint === "idx_products_barcode_unique") {
      return res.status(409).json({ message: "El codigo de barras ya existe" });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "El SKU ya existe" });
    }
    throw error;
  }
});

router.patch("/:id", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const {
    sku,
    barcode,
    name,
    brand,
    sizeLabel,
    cost,
    price,
    stock,
    categoryId,
    description,
    active,
    branchId,
    imageDataUrl,
    removeImage,
    locationCode,
    expirationRequired,
    expirationDate,
  } = req.body || {};
  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(branchId || 0);
  const targetBranchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;
  const parsedCost = cost !== undefined ? Number(cost) : null;
  const parsedPrice = price !== undefined ? Number(price) : null;
  const parsedStock = stock !== undefined ? Number(stock) : null;
  const parsedCategoryId = categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : undefined;
  const parsedBarcode = barcode !== undefined ? (typeof barcode === "string" ? barcode.trim() : "") : undefined;
  const parsedLocationCode =
    locationCode !== undefined ? (typeof locationCode === "string" ? locationCode.trim().slice(0, 40) : "") : undefined;
  const parsedExpirationDate =
    expirationDate !== undefined ? (typeof expirationDate === "string" ? expirationDate.trim().slice(0, 10) : "") : undefined;
  const parsedSizeLabel = sizeLabel !== undefined ? (typeof sizeLabel === "string" ? sizeLabel.trim().slice(0, 80) : "") : undefined;

  if (
    (parsedCost !== null && (Number.isNaN(parsedCost) || parsedCost < 0)) ||
    (parsedPrice !== null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) ||
    (parsedStock !== null && (Number.isNaN(parsedStock) || parsedStock < 0))
  ) {
    return res.status(400).json({ message: "cost, price o stock invalidos" });
  }
  if (parsedBarcode !== undefined && parsedBarcode && (await isBarcodeAlreadyUsed(parsedBarcode, id))) {
    return res.status(409).json({ message: "El codigo de barras ya existe" });
  }

  const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [targetBranchId]);
  if (!branchCheck.rows[0]) {
    return res.status(400).json({ message: "Sucursal invalida" });
  }
  const expirationsEnabled = await isExpirationsEnabled(targetBranchId);
  const brandsAndSizesEnabled = await isBrandsAndSizesEnabled(targetBranchId);
  if (parsedCategoryId !== undefined && parsedCategoryId !== null) {
    const categoryCheck = await pool.query(
      "SELECT id FROM categories WHERE id = $1 AND branch_id = $2 AND active = true LIMIT 1",
      [parsedCategoryId, targetBranchId]
    );
    if (!categoryCheck.rows[0]) {
      return res.status(400).json({ message: "Categoria invalida para la sucursal seleccionada" });
    }
  }

  const currentProduct = await pool.query(
    "SELECT image_url FROM products WHERE id = $1 AND branch_id = $2 LIMIT 1",
    [id, targetBranchId]
  );
  if (!currentProduct.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }
  const currentImageUrl = currentProduct.rows[0].image_url || null;

  let nextImageUrl = undefined;
  if (removeImage === true) {
    nextImageUrl = "__REMOVE__";
  } else if (typeof imageDataUrl === "string" && imageDataUrl.trim()) {
    try {
      nextImageUrl = await saveProductImageDataUrl(imageDataUrl.trim());
    } catch (error) {
      return res.status(400).json({ message: error?.message || "Imagen invalida" });
    }
  }

  let result;
  try {
    result = await pool.query(
      `
        UPDATE products
        SET
          sku = COALESCE($1, sku),
          barcode = CASE WHEN $2::text IS NULL THEN barcode ELSE NULLIF($2, '') END,
          name = COALESCE($3, name),
          brand = CASE WHEN $4::text IS NULL THEN brand ELSE NULLIF($4, '') END,
          size_label = CASE WHEN $5::text IS NULL THEN size_label ELSE NULLIF($5, '') END,
          cost = COALESCE($6, cost),
          price = COALESCE($7, price),
          stock = COALESCE($8, stock),
          category_id = CASE WHEN $9::int IS NULL THEN category_id ELSE $9 END,
          description = COALESCE($10, description),
          image_url = CASE
            WHEN $11::text IS NULL THEN image_url
            WHEN $11::text = '__REMOVE__' THEN NULL
            ELSE NULLIF($11, '')
          END,
          location_code = CASE
            WHEN $12::text IS NULL THEN location_code
            ELSE NULLIF($12, '')
          END,
          expiration_required = COALESCE($13, expiration_required),
          expiration_date = CASE
            WHEN $14::text IS NULL THEN expiration_date
            ELSE NULLIF($14, '')::date
          END,
          active = COALESCE($15, active),
          branch_id = COALESCE($16, branch_id)
        WHERE id = $17 AND branch_id = $18
        RETURNING id, sku, barcode, name, brand, size_label, cost, price, stock, category_id, description, image_url, location_code, expiration_required, expiration_date, active, branch_id
      `,
      [
        typeof sku === "string" && sku.trim() ? sku.trim() : null,
        parsedBarcode === undefined ? null : parsedBarcode,
        typeof name === "string" && name.trim() ? name.trim() : null,
        brand === undefined ? null : typeof brand === "string" ? brand.trim() : "",
        brandsAndSizesEnabled ? (parsedSizeLabel === undefined ? null : parsedSizeLabel) : null,
        parsedCost,
        parsedPrice,
        parsedStock,
        parsedCategoryId === undefined ? null : parsedCategoryId,
        typeof description === "string" ? description : null,
        nextImageUrl === undefined ? null : nextImageUrl,
        parsedLocationCode === undefined ? null : parsedLocationCode,
        expirationsEnabled ? (typeof expirationRequired === "boolean" ? expirationRequired : null) : null,
        expirationsEnabled ? (parsedExpirationDate === undefined ? null : parsedExpirationDate) : null,
        typeof active === "boolean" ? active : null,
        targetBranchId,
        id,
        targetBranchId,
      ]
    );
  } catch (error) {
    if (error?.code === "23505" && error?.constraint === "idx_products_barcode_unique") {
      return res.status(409).json({ message: "El codigo de barras ya existe" });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "El SKU ya existe" });
    }
    throw error;
  }

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }

  if (nextImageUrl !== undefined && currentImageUrl && currentImageUrl !== nextImageUrl) {
    await deletePreviousImage(currentImageUrl);
  }

  const updatedRow = result.rows[0];
  await pool.query(
    `
      UPDATE product_presentations
      SET
        sku = CASE WHEN $1::text IS NULL THEN sku ELSE $1 END,
        barcode = CASE WHEN $2::text IS NULL THEN barcode ELSE $2 END,
        price = CASE WHEN $3::numeric IS NULL THEN price ELSE $3 END,
        updated_at = NOW()
      WHERE product_id = $4
        AND branch_id = $5
        AND is_default = true
        AND active = true
    `,
    [
      typeof sku === "string" && sku.trim() ? sku.trim() : null,
      parsedBarcode === undefined ? null : parsedBarcode || null,
      parsedPrice === null ? null : parsedPrice,
      id,
      targetBranchId,
    ]
  );

  return res.json(updatedRow);
});

router.delete("/:id", requireRole("superadmin", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const result = await pool.query(
    `
      UPDATE products
      SET active = false
      WHERE id = $1 AND branch_id = $2
      RETURNING id
    `,
    [id, req.user.branchId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }

  return res.json({ ok: true });
});

export default router;
