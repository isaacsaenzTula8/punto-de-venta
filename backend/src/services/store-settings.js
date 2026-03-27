import { pool } from "../db/pool.js";

const DEFAULT_SETTINGS = {
  cashierCanCharge: true,
};

export async function getStoreSettings(branchId, client = pool) {
  let result;
  try {
    result = await client.query(
      `
        SELECT cashier_can_charge
        FROM store_settings
        WHERE branch_id = $1
        LIMIT 1
      `,
      [branchId]
    );
  } catch {
    result = await client.query(
      `
        SELECT cashier_can_charge
        FROM store_settings
        WHERE id = 1
        LIMIT 1
      `
    );
  }

  const row = result.rows[0];
  if (!row) {
    return DEFAULT_SETTINGS;
  }

  return {
    cashierCanCharge: Boolean(row.cashier_can_charge),
  };
}

export function buildUserPermissions(role, settings) {
  const canChargeByRole = ["superadmin", "admin", "manager"].includes(role);
  const salesCharge = canChargeByRole || (role === "cashier" && settings.cashierCanCharge);

  return {
    ordersCreate: true,
    salesCharge,
  };
}
