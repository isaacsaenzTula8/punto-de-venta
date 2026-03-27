import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const includeInactive = String(req.query.includeInactive || "0") === "1";
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.sku,
        p.barcode,
        p.name,
        p.cost,
        p.price,
        p.stock,
        p.description,
        p.category_id,
        p.active,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${includeInactive ? "" : "WHERE p.active = true"}
      ORDER BY p.name ASC
    `
  );

  return res.json(
    result.rows.map((row) => ({
      id: String(row.id),
      sku: row.sku,
      barcode: row.barcode || "",
      name: row.name,
      cost: Number(row.cost || 0),
      price: Number(row.price),
      stock: Number(row.stock),
      description: row.description || "",
      categoryId: row.category_id ? String(row.category_id) : "",
      category: row.category || "Otros",
      active: Boolean(row.active),
    }))
  );
});

router.post("/", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const { sku, barcode, name, cost, price, stock, categoryId, description = null } = req.body || {};
  if (!sku || !name || cost === undefined || price === undefined || stock === undefined) {
    return res.status(400).json({ message: "sku, name, cost, price y stock son requeridos" });
  }

  const parsedCost = Number(cost);
  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const parsedCategoryId = categoryId ? Number(categoryId) : null;
  const normalizedBarcode = typeof barcode === "string" && barcode.trim() ? barcode.trim() : null;

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

  try {
    const result = await pool.query(
      `
        INSERT INTO products (sku, barcode, name, cost, price, stock, category_id, description, active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        RETURNING id, sku, barcode, name, cost, price, stock, category_id, description, active
      `,
      [String(sku).trim(), normalizedBarcode, String(name).trim(), parsedCost, parsedPrice, parsedStock, parsedCategoryId, description]
    );
    return res.status(201).json(result.rows[0]);
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

  const { sku, barcode, name, cost, price, stock, categoryId, description, active } = req.body || {};
  const parsedCost = cost !== undefined ? Number(cost) : null;
  const parsedPrice = price !== undefined ? Number(price) : null;
  const parsedStock = stock !== undefined ? Number(stock) : null;
  const parsedCategoryId = categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : undefined;
  const parsedBarcode = barcode !== undefined ? (typeof barcode === "string" ? barcode.trim() : "") : undefined;

  if (
    (parsedCost !== null && (Number.isNaN(parsedCost) || parsedCost < 0)) ||
    (parsedPrice !== null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) ||
    (parsedStock !== null && (Number.isNaN(parsedStock) || parsedStock < 0))
  ) {
    return res.status(400).json({ message: "cost, price o stock invalidos" });
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
          cost = COALESCE($4, cost),
          price = COALESCE($5, price),
          stock = COALESCE($6, stock),
          category_id = CASE WHEN $7::int IS NULL THEN category_id ELSE $7 END,
          description = COALESCE($8, description),
          active = COALESCE($9, active)
        WHERE id = $10
        RETURNING id, sku, barcode, name, cost, price, stock, category_id, description, active
      `,
      [
        typeof sku === "string" && sku.trim() ? sku.trim() : null,
        parsedBarcode === undefined ? null : parsedBarcode,
        typeof name === "string" && name.trim() ? name.trim() : null,
        parsedCost,
        parsedPrice,
        parsedStock,
        parsedCategoryId === undefined ? null : parsedCategoryId,
        typeof description === "string" ? description : null,
        typeof active === "boolean" ? active : null,
        id,
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

  return res.json(result.rows[0]);
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
      WHERE id = $1
      RETURNING id
    `,
    [id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Producto no encontrado" });
  }

  return res.json({ ok: true });
});

export default router;
