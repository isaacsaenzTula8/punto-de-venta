import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { buildUserPermissions, getStoreSettings } from "../services/store-settings.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Token requerido" });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    const result = await pool.query(
      `
        SELECT id, user_id, revoked_at, expires_at, last_activity_at
        FROM auth_sessions
        WHERE id = $1
        LIMIT 1
      `,
      [payload.sid]
    );

    const session = result.rows[0];
    if (!session || session.revoked_at) {
      return res.status(401).json({ message: "Sesion invalida" });
    }

    const now = Date.now();
    const expiresAt = new Date(session.expires_at).getTime();
    const lastActivity = new Date(session.last_activity_at).getTime();
    const idleLimitMs = env.sessionIdleMinutes * 60 * 1000;

    if (expiresAt < now || now - lastActivity > idleLimitMs) {
      await pool.query("UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1", [session.id]);
      return res.status(401).json({ message: "Sesion expirada" });
    }

    await pool.query("UPDATE auth_sessions SET last_activity_at = NOW() WHERE id = $1", [session.id]);

    let userResult;
    try {
      userResult = await pool.query(
        `
          SELECT id, username, full_name, role, branch_id
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [payload.sub]
      );
    } catch {
      userResult = await pool.query(
        `
          SELECT id, username, full_name, role
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [payload.sub]
      );
    }
    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const effectiveBranchId = user.branch_id || 1;
    const storeSettings = await getStoreSettings(effectiveBranchId, pool);
    req.user = {
      sub: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      branchId: effectiveBranchId,
      sid: payload.sid,
    };
    req.storeSettings = storeSettings;
    req.permissions = buildUserPermissions(user.role, storeSettings);
    req.sessionId = session.id;
    return next();
  } catch {
    return res.status(401).json({ message: "Token invalido o expirado" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "No autorizado" });
    }
    return next();
  };
}
