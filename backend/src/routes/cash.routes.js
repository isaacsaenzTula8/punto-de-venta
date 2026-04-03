import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/current", async (req, res) => {
  const branchId = req.user.branchId;
  const query = `
    SELECT id, user_id, opening_amount, opened_at, closed_at, closing_amount, status
    FROM cash_sessions
    WHERE user_id = $1 AND branch_id = $2 AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [req.user.sub, branchId]);
  return res.json({ session: result.rows[0] || null });
});

router.post("/open", async (req, res) => {
  const openingAmount = Number(req.body?.openingAmount ?? 0);
  if (Number.isNaN(openingAmount) || openingAmount < 0) {
    return res.status(400).json({ message: "openingAmount invalido" });
  }

  const current = await pool.query(
    "SELECT id FROM cash_sessions WHERE user_id = $1 AND branch_id = $2 AND status = 'open' LIMIT 1",
    [req.user.sub, req.user.branchId]
  );
  if (current.rows[0]) {
    return res.status(400).json({ message: "Ya existe una caja abierta para este usuario" });
  }

  const insert = await pool.query(
    `
      INSERT INTO cash_sessions (user_id, branch_id, opening_amount, opened_at, status)
      VALUES ($1, $2, $3, NOW(), 'open')
      RETURNING id, user_id, opening_amount, opened_at, status
    `,
    [req.user.sub, req.user.branchId, openingAmount]
  );

  return res.status(201).json({ session: insert.rows[0] });
});

router.post("/close", async (req, res) => {
  const closingAmount = Number(req.body?.closingAmount ?? 0);
  if (Number.isNaN(closingAmount) || closingAmount < 0) {
    return res.status(400).json({ message: "closingAmount invalido" });
  }

  const session = await pool.query(
    `
      SELECT id, opening_amount
      FROM cash_sessions
      WHERE user_id = $1 AND branch_id = $2 AND status = 'open'
      ORDER BY opened_at DESC
      LIMIT 1
    `,
    [req.user.sub, req.user.branchId]
  );

  if (!session.rows[0]) {
    return res.status(400).json({ message: "No hay una caja abierta para cerrar" });
  }

  const updated = await pool.query(
    `
      UPDATE cash_sessions
      SET status = 'closed',
          closed_at = NOW(),
          closing_amount = $1
      WHERE id = $2
      RETURNING id, user_id, opening_amount, opened_at, closed_at, closing_amount, status
    `,
    [closingAmount, session.rows[0].id]
  );

  return res.json({ session: updated.rows[0] });
});

router.get("/movements", async (req, res) => {
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const type = String(req.query.type || "all").trim();
  const values = [req.user.branchId];
  const where = ["cm.branch_id = $1"];
  let idx = 2;

  if (from) {
    where.push(`cm.created_at >= $${idx}::date`);
    values.push(from);
    idx += 1;
  }
  if (to) {
    where.push(`cm.created_at < ($${idx}::date + INTERVAL '1 day')`);
    values.push(to);
    idx += 1;
  }
  if (type === "in" || type === "out") {
    where.push(`cm.movement_type = $${idx}`);
    values.push(type);
    idx += 1;
  }

  let result;
  try {
    result = await pool.query(
      `
        SELECT
          cm.id,
          cm.movement_type,
          cm.amount,
          cm.reason,
          cm.notes,
          cm.created_at,
          u.full_name AS created_by
        FROM cash_movements cm
        LEFT JOIN users u ON u.id = cm.created_by_user_id
        WHERE ${where.join(" AND ")}
        ORDER BY cm.created_at DESC, cm.id DESC
        LIMIT 500
      `,
      values
    );
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(400).json({ message: "Falta migracion: ejecuta 015_cash_movements_and_cutoff_support.sql" });
    }
    throw error;
  }

  return res.json(
    result.rows.map((row) => ({
      id: Number(row.id),
      movementType: row.movement_type,
      amount: Number(row.amount),
      reason: row.reason || "",
      notes: row.notes || "",
      createdAt: row.created_at,
      createdBy: row.created_by || "Usuario",
    }))
  );
});

router.post("/movements", async (req, res) => {
  if (!req.permissions?.salesCharge) {
    return res.status(403).json({ message: "No tienes permiso para registrar movimientos de caja" });
  }

  const movementType = String(req.body?.movementType || "").trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || "").trim();
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;

  if (!["in", "out"].includes(movementType)) {
    return res.status(400).json({ message: "movementType invalido (in/out)" });
  }
  if (Number.isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "amount invalido" });
  }
  if (!reason) {
    return res.status(400).json({ message: "reason es requerido" });
  }

  const openSession = await pool.query(
    "SELECT id FROM cash_sessions WHERE user_id = $1 AND branch_id = $2 AND status = 'open' LIMIT 1",
    [req.user.sub, req.user.branchId]
  );

  if (!openSession.rows[0]) {
    return res.status(400).json({ message: "Debes abrir caja para registrar entradas o salidas" });
  }

  let result;
  try {
    result = await pool.query(
      `
        INSERT INTO cash_movements (
          branch_id,
          cash_session_id,
          movement_type,
          amount,
          reason,
          notes,
          created_by_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, movement_type, amount, reason, notes, created_at
      `,
      [req.user.branchId, openSession.rows[0].id, movementType, amount, reason.slice(0, 140), notes, req.user.sub]
    );
  } catch (error) {
    if (error?.code === "42P01") {
      return res.status(400).json({ message: "Falta migracion: ejecuta 015_cash_movements_and_cutoff_support.sql" });
    }
    throw error;
  }

  return res.status(201).json({
    id: Number(result.rows[0].id),
    movementType: result.rows[0].movement_type,
    amount: Number(result.rows[0].amount),
    reason: result.rows[0].reason,
    notes: result.rows[0].notes || "",
    createdAt: result.rows[0].created_at,
  });
});

export default router;
