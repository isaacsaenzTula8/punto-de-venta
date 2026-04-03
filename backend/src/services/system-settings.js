import { pool } from "../db/pool.js";

const DEFAULT_SYSTEM_SETTINGS = {
  multiBranchEnabled: false,
};

export async function getSystemSettings(client = pool) {
  try {
    const result = await client.query(
      `
        SELECT multi_branch_enabled
        FROM system_settings
        WHERE id = 1
        LIMIT 1
      `
    );

    const row = result.rows[0];
    if (!row) {
      return DEFAULT_SYSTEM_SETTINGS;
    }

    return {
      multiBranchEnabled: Boolean(row.multi_branch_enabled),
    };
  } catch {
    return DEFAULT_SYSTEM_SETTINGS;
  }
}
