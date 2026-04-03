import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSystemSettings } from "../services/system-settings.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const systemSettings = await getSystemSettings(pool);
  const requestedBranchId = Number(req.query.branchId || 0);
  const branchId =
    req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requestedBranchId
      ? requestedBranchId
      : req.user.branchId;
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.name,
        c.description,
        c.active,
        c.created_at,
        COUNT(p.id)::int AS products_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.branch_id = c.branch_id
      WHERE c.branch_id = $1
      GROUP BY c.id, c.name, c.description, c.active, c.created_at
      ORDER BY c.name ASC
    `,
    [branchId]
  );
  return res.json(result.rows);
});

router.post("/", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const { name, description = null } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ message: "Nombre de categoria requerido" });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO categories (name, description, active, branch_id)
        VALUES ($1, $2, true, $3)
        RETURNING id, name, description, active, created_at
      `,
      [String(name).trim(), description, req.user.branchId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (String(error?.message || "").includes("duplicate key")) {
      return res.status(409).json({ message: "La categoria ya existe" });
    }
    throw error;
  }
});

router.patch("/:id", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const { name, description, active } = req.body || {};
  const result = await pool.query(
    `
      UPDATE categories
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        active = COALESCE($3, active)
      WHERE id = $4 AND branch_id = $5
      RETURNING id, name, description, active, created_at
    `,
    [
      typeof name === "string" && name.trim() ? name.trim() : null,
      typeof description === "string" ? description : null,
      typeof active === "boolean" ? active : null,
      id,
      req.user.branchId,
    ]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Categoria no encontrada" });
  }

  return res.json(result.rows[0]);
});

router.delete("/:id", requireRole("superadmin", "admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const count = await pool.query(
    "SELECT COUNT(*)::int AS count FROM products WHERE category_id = $1 AND branch_id = $2",
    [id, req.user.branchId]
  );
  if (Number(count.rows[0]?.count || 0) > 0) {
    return res.status(400).json({ message: "No se puede eliminar: hay productos asociados" });
  }

  const result = await pool.query("DELETE FROM categories WHERE id = $1 AND branch_id = $2 RETURNING id", [
    id,
    req.user.branchId,
  ]);
  if (!result.rows[0]) {
    return res.status(404).json({ message: "Categoria no encontrada" });
  }

  return res.json({ ok: true });
});

export default router;
