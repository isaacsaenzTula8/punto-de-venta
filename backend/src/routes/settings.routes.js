import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getStoreSettings } from "../services/store-settings.js";

const router = express.Router();

router.use(requireAuth);

router.get("/store", async (req, res) => {
  const branchId = req.user.branchId;
  const storeSettings = await getStoreSettings(branchId, pool);
  return res.json(storeSettings);
});

router.patch("/store", requireRole("superadmin"), async (req, res) => {
  const cashierCanCharge = req.body?.cashierCanCharge;
  const branchId = Number(req.body?.branchId || req.user.branchId);
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
