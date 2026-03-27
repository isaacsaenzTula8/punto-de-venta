import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/current", async (req, res) => {
  const query = `
    SELECT id, user_id, opening_amount, opened_at, closed_at, closing_amount, status
    FROM cash_sessions
    WHERE user_id = $1 AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
  `;
  const result = await pool.query(query, [req.user.sub]);
  return res.json({ session: result.rows[0] || null });
});

router.post("/open", async (req, res) => {
  const openingAmount = Number(req.body?.openingAmount ?? 0);
  if (Number.isNaN(openingAmount) || openingAmount < 0) {
    return res.status(400).json({ message: "openingAmount invalido" });
  }

  const current = await pool.query(
    "SELECT id FROM cash_sessions WHERE user_id = $1 AND status = 'open' LIMIT 1",
    [req.user.sub]
  );
  if (current.rows[0]) {
    return res.status(400).json({ message: "Ya existe una caja abierta para este usuario" });
  }

  const insert = await pool.query(
    `
      INSERT INTO cash_sessions (user_id, opening_amount, opened_at, status)
      VALUES ($1, $2, NOW(), 'open')
      RETURNING id, user_id, opening_amount, opened_at, status
    `,
    [req.user.sub, openingAmount]
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
      WHERE user_id = $1 AND status = 'open'
      ORDER BY opened_at DESC
      LIMIT 1
    `,
    [req.user.sub]
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

export default router;
