import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/dashboard", async (_req, res) => {
  const summaryResult = await pool.query(
    `
      SELECT
        COALESCE(total_sales, 0) AS total_sales,
        COALESCE(total_transactions, 0) AS total_transactions,
        COALESCE(average_ticket, 0) AS average_ticket,
        COALESCE(cash_sales, 0) AS cash_sales,
        COALESCE(card_sales, 0) AS card_sales,
        COALESCE(transfer_sales, 0) AS transfer_sales,
        COALESCE(credit_sales, 0) AS credit_sales
      FROM daily_sales_summary
      WHERE date = CURRENT_DATE
      LIMIT 1
    `
  );

  const productsResult = await pool.query("SELECT COUNT(*)::int AS count FROM products WHERE active = true");
  const summary = summaryResult.rows[0] || {
    total_sales: 0,
    total_transactions: 0,
    average_ticket: 0,
    cash_sales: 0,
    card_sales: 0,
    transfer_sales: 0,
    credit_sales: 0,
  };

  return res.json({
    totalSales: Number(summary.total_sales),
    totalTransactions: Number(summary.total_transactions),
    averageTicket: Number(summary.average_ticket),
    cashSales: Number(summary.cash_sales),
    cardSales: Number(summary.card_sales),
    transferSales: Number(summary.transfer_sales),
    creditSales: Number(summary.credit_sales),
    activeProducts: Number(productsResult.rows[0]?.count || 0),
  });
});

router.get("/last7", async (_req, res) => {
  const result = await pool.query(
    `
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 day', CURRENT_DATE, INTERVAL '1 day')::date AS d
      )
      SELECT
        to_char(days.d, 'Dy DD') AS date,
        COALESCE(ds.total_sales, 0)::numeric AS ventas,
        COALESCE(ds.total_transactions, 0)::int AS transacciones
      FROM days
      LEFT JOIN daily_sales_summary ds ON ds.date = days.d
      ORDER BY days.d ASC
    `
  );
  return res.json(result.rows.map((r) => ({ ...r, ventas: Number(r.ventas) })));
});

router.get("/top-products", async (req, res) => {
  const limit = Math.max(1, Math.min(20, Number(req.query.limit || 8)));
  const result = await pool.query(
    `
      SELECT
        id,
        sku,
        name,
        category_name,
        total_quantity_sold,
        total_revenue
      FROM top_selling_products
      LIMIT $1
    `,
    [limit]
  );
  return res.json(
    result.rows.map((r) => ({
      product: {
        id: String(r.id),
        sku: r.sku,
        name: r.name,
        category: r.category_name || "Otros",
      },
      totalQuantity: Number(r.total_quantity_sold),
      totalRevenue: Number(r.total_revenue),
    }))
  );
});

router.get("/sales-by-category", async (req, res) => {
  const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
  const result = await pool.query(
    `
      SELECT
        COALESCE(c.name, 'Otros') AS name,
        SUM(si.subtotal)::numeric AS value
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.payment_status = 'completed'
        AND s.sale_date >= CURRENT_DATE - ($1::text || ' days')::interval
      GROUP BY COALESCE(c.name, 'Otros')
      ORDER BY value DESC
      LIMIT 8
    `,
    [days]
  );
  const total = result.rows.reduce((sum, row) => sum + Number(row.value), 0);
  return res.json(
    result.rows.map((row) => ({
      name: row.name,
      value: Number(row.value),
      percent: total > 0 ? Number(((Number(row.value) / total) * 100).toFixed(1)) : 0,
    }))
  );
});

export default router;
