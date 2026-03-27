import express from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireRole("superadmin"));

router.get("/", async (_req, res) => {
  const result = await pool.query(
    `
      SELECT u.id, u.username, u.email, u.full_name, u.role, u.branch_id, b.name AS branch_name, u.active, u.last_login, u.created_at
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      ORDER BY id DESC
    `
  );
  return res.json(result.rows);
});

router.post("/", async (req, res) => {
  const { username, email, fullName, role, password, branchId } = req.body || {};
  if (!username || !email || !fullName || !role || !password) {
    return res.status(400).json({ message: "username, email, fullName, role y password son requeridos" });
  }

  const allowedRoles = ["superadmin", "admin", "manager", "cashier"];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Rol invalido" });
  }

  const parsedBranchId = Number(branchId || 0) || 1;
  const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [parsedBranchId]);
  if (!branchCheck.rows[0]) {
    return res.status(400).json({ message: "Sucursal invalida" });
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      `
        INSERT INTO users (username, email, password_hash, full_name, role, branch_id, active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        RETURNING id, username, email, full_name, role, branch_id, active, created_at
      `,
      [username, email, hash, fullName, role, parsedBranchId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (String(error?.message || "").includes("duplicate key")) {
      return res.status(409).json({ message: "Username o email ya existe" });
    }
    throw error;
  }
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID invalido" });
  }

  const { fullName, role, active, branchId } = req.body || {};
  const allowedRoles = ["superadmin", "admin", "manager", "cashier"];
  if (role && !allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Rol invalido" });
  }

  const parsedBranchId = branchId !== undefined ? Number(branchId || 0) : undefined;
  if (parsedBranchId !== undefined) {
    const branchCheck = await pool.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [parsedBranchId]);
    if (!branchCheck.rows[0]) {
      return res.status(400).json({ message: "Sucursal invalida" });
    }
  }

  const result = await pool.query(
    `
      UPDATE users
      SET
        full_name = COALESCE($1, full_name),
        role = COALESCE($2, role),
        active = COALESCE($3, active),
        branch_id = COALESCE($4, branch_id)
      WHERE id = $5
      RETURNING id, username, email, full_name, role, branch_id, active, last_login, created_at
    `,
    [fullName ?? null, role ?? null, typeof active === "boolean" ? active : null, parsedBranchId ?? null, id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  return res.json(result.rows[0]);
});

router.post("/:id/reset-password", async (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body || {};
  if (!id || !password) {
    return res.status(400).json({ message: "ID y password son requeridos" });
  }

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      RETURNING id, username
    `,
    [hash, id]
  );

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  await pool.query("UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [
    id,
  ]);

  return res.json({ ok: true });
});

export default router;
