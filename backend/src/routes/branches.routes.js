import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.use((req, res, next) => {
  if (!req.systemSettings?.multiBranchEnabled) {
    return res.status(403).json({ message: "La gestion de sucursales esta desactivada por superadmin" });
  }
  return next();
});

router.get("/", async (req, res) => {
  if (req.user.role === "superadmin") {
    const all = await pool.query(
      `
        SELECT id, code, name, active, created_at, updated_at
        FROM branches
        ORDER BY name ASC
      `
    );
    return res.json(all.rows);
  }

  const current = await pool.query(
    `
      SELECT id, code, name, active, created_at, updated_at
      FROM branches
      WHERE id = $1
      LIMIT 1
    `,
    [req.user.branchId]
  );
  return res.json(current.rows);
});

router.get("/:id", requireRole("superadmin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID de sucursal invalido" });
  }

  const result = await pool.query(
    `
      SELECT id, code, name, active, created_at, updated_at
      FROM branches
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Sucursal no encontrada" });
  }

  return res.json(result.rows[0]);
});

router.post("/", requireRole("superadmin"), async (req, res) => {
  const code = String(req.body?.code || "").trim().toUpperCase();
  const name = String(req.body?.name || "").trim();
  if (!code || !name) {
    return res.status(400).json({ message: "code y name son requeridos" });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO branches (code, name, active)
        VALUES ($1, $2, true)
        RETURNING id, code, name, active, created_at, updated_at
      `,
      [code, name]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "El codigo de sucursal ya existe" });
    }
    throw error;
  }
});

router.patch("/:id", requireRole("superadmin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID de sucursal invalido" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;
  const active = typeof req.body?.active === "boolean" ? req.body.active : null;

  const result = await pool.query(
    `
      UPDATE branches
      SET
        name = COALESCE($1, name),
        active = COALESCE($2, active),
        updated_at = NOW()
      WHERE id = $3
      RETURNING id, code, name, active, created_at, updated_at
    `,
    [name || null, active, id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Sucursal no encontrada" });
  }

  return res.json(result.rows[0]);
});

router.delete("/:id", requireRole("superadmin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID de sucursal invalido" });
  }
  if (id === 1) {
    return res.status(400).json({ message: "No se puede eliminar la sucursal base" });
  }

  const usage = await pool.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE branch_id = $1) AS users_count,
        (SELECT COUNT(*)::int FROM sales WHERE branch_id = $1) AS sales_count,
        (SELECT COUNT(*)::int FROM cash_sessions WHERE branch_id = $1) AS cash_sessions_count,
        (SELECT COUNT(*)::int FROM products WHERE branch_id = $1) AS products_count,
        (SELECT COUNT(*)::int FROM categories WHERE branch_id = $1) AS categories_count
    `,
    [id]
  );

  const row = usage.rows[0];
  const hasUsage =
    Number(row?.users_count || 0) > 0 ||
    Number(row?.sales_count || 0) > 0 ||
    Number(row?.cash_sessions_count || 0) > 0 ||
    Number(row?.products_count || 0) > 0 ||
    Number(row?.categories_count || 0) > 0;

  if (hasUsage) {
    return res.status(400).json({
      message: "No se puede eliminar la sucursal porque tiene datos asociados",
      usage: {
        users: Number(row.users_count || 0),
        sales: Number(row.sales_count || 0),
        cashSessions: Number(row.cash_sessions_count || 0),
        products: Number(row.products_count || 0),
        categories: Number(row.categories_count || 0),
      },
    });
  }

  const result = await pool.query("DELETE FROM branches WHERE id = $1 RETURNING id", [id]);
  if (!result.rows[0]) {
    return res.status(404).json({ message: "Sucursal no encontrada" });
  }
  return res.json({ ok: true });
});

export default router;
