import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import authRoutes from "./routes/auth.routes.js";
import cashRoutes from "./routes/cash.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import usersRoutes from "./routes/users.routes.js";
import productsRoutes from "./routes/products.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import categoriesRoutes from "./routes/categories.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import branchesRoutes from "./routes/branches.routes.js";
import onlineOrdersRoutes from "./routes/online-orders.routes.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/branches", branchesRoutes);
app.use("/api/online-orders", onlineOrdersRoutes);

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "La imagen es demasiado grande para procesarla." });
  }
  console.error(err);
  res.status(500).json({ message: "Error interno" });
});

app.listen(env.port, "0.0.0.0", () => {
  console.log(`POS backend running on http://localhost:${env.port}`);
});
