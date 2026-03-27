import express from "express";
import cors from "cors";
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

const app = express();

app.use(cors());
app.use(express.json());

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

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: "Error interno" });
});

app.listen(env.port, () => {
  console.log(`POS backend running on http://localhost:${env.port}`);
});
