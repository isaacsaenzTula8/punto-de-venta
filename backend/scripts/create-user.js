import bcrypt from "bcryptjs";
import { pool } from "../src/db/pool.js";

const [, , username, email, fullName, role = "cashier", password = "123456", branchIdArg = "1"] = process.argv;

if (!username || !email || !fullName) {
  console.error(
    "Uso: node scripts/create-user.js <username> <email> <full_name> [role=superadmin|admin|cashier|manager] [password] [branchId=1]"
  );
  process.exit(1);
}

const allowedRoles = new Set(["superadmin", "admin", "cashier", "manager"]);
if (!allowedRoles.has(role)) {
  console.error("role invalido. Use: superadmin, admin, cashier o manager");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const branchId = Number(branchIdArg || 1);
if (!branchId) {
  console.error("branchId invalido");
  process.exit(1);
}

try {
  const branch = await pool.query("SELECT id FROM branches WHERE id = $1 LIMIT 1", [branchId]);
  if (!branch.rows[0]) {
    console.error("Sucursal no encontrada para branchId:", branchId);
    process.exit(1);
  }

  const result = await pool.query(
    `
      INSERT INTO users (username, email, password_hash, full_name, role, branch_id, active)
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING id, username, email, full_name, role, branch_id
    `,
    [username, email, passwordHash, fullName, role, branchId]
  );
  console.log("Usuario creado:", result.rows[0]);
} catch (error) {
  console.error("No se pudo crear el usuario:", error?.message || error);
  if (error?.code) {
    console.error("Codigo:", error.code);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
