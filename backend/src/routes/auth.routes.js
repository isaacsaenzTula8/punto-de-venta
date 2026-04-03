import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db/pool.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { buildUserPermissions, getStoreSettings } from "../services/store-settings.js";
import { getSystemSettings } from "../services/system-settings.js";
import { getBusinessSettings } from "../services/business-settings.js";

const router = express.Router();

function expiresInToMs(value) {
  if (typeof value === "number") return value * 1000;
  const match = String(value).trim().match(/^(\d+)([smhd])$/i);
  if (!match) return 12 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "username y password son requeridos" });
  }

  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password_hash,
      u.full_name,
      u.role,
      u.branch_id,
      b.name AS branch_name,
      u.active,
      u.failed_login_attempts,
      u.locked_until
    FROM users u
    LEFT JOIN branches b ON b.id = u.branch_id
    WHERE (u.username = $1 OR u.email = $1)
    LIMIT 1
  `;

  let result;
  try {
    result = await pool.query(query, [username]);
  } catch {
    result = await pool.query(
      `
        SELECT id, username, email, password_hash, full_name, role, active, failed_login_attempts, locked_until
        FROM users
        WHERE (username = $1 OR email = $1)
        LIMIT 1
      `,
      [username]
    );
  }
  const user = result.rows[0];

  if (!user || !user.active) {
    return res.status(401).json({ message: "Credenciales invalidas" });
  }
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return res.status(423).json({ message: "Usuario temporalmente bloqueado por intentos fallidos" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    const shouldLock = attempts >= 5;
    await pool.query(
      `
        UPDATE users
        SET failed_login_attempts = $1,
            locked_until = CASE WHEN $2 THEN NOW() + INTERVAL '15 minutes' ELSE locked_until END
        WHERE id = $3
      `,
      [attempts, shouldLock, user.id]
    );
    return res.status(401).json({ message: "Credenciales invalidas" });
  }

  await pool.query(
    "UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1",
    [user.id]
  );
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + expiresInToMs(env.jwtExpiresIn));

  await pool.query(
    `
      INSERT INTO auth_sessions (id, user_id, created_at, last_activity_at, expires_at)
      VALUES ($1, $2, NOW(), NOW(), $3)
    `,
    [sessionId, user.id, expiresAt]
  );

  const token = jwt.sign(
    {
      sub: user.id,
      sid: sessionId,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      branchId: user.branch_id || 1,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  const storeSettings = await getStoreSettings(user.branch_id || 1, pool);
  const systemSettings = await getSystemSettings(pool);
  const businessSettings = await getBusinessSettings(user.branch_id || 1, pool);
  const permissions = buildUserPermissions(user.role, storeSettings);

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id || 1,
      branchName: user.branch_name || null,
      permissions,
    },
    storeSettings,
    systemSettings,
    businessSettings,
  });
});

router.get("/me", requireAuth, async (req, res) => {
  let result;
  try {
    result = await pool.query(
      `
        SELECT
          u.id,
          u.username,
          u.email,
          u.full_name,
          u.role,
          u.branch_id,
          b.name AS branch_name
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.id = $1
        LIMIT 1
      `,
      [req.user.sub]
    );
  } catch {
    result = await pool.query(
      "SELECT id, username, email, full_name, role FROM users WHERE id = $1 LIMIT 1",
      [req.user.sub]
    );
  }

  if (!result.rows[0]) {
    return res.status(404).json({ message: "Usuario no encontrado" });
  }

  return res.json({
    ...result.rows[0],
    permissions: req.permissions,
    storeSettings: req.storeSettings,
    systemSettings: req.systemSettings,
    businessSettings: await getBusinessSettings(result.rows[0].branch_id || req.user.branchId || 1, pool),
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  await pool.query("UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1", [req.sessionId]);
  return res.json({ ok: true });
});

export default router;
