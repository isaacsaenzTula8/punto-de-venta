import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getBusinessSettings } from "../services/business-settings.js";

const router = express.Router();
router.use(requireAuth);

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

function resolveCutoffRange(period, from, to) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

  if (period === "weekly") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    const s = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    return { from: s, to: todayStr, period: "weekly" };
  }

  if (period === "monthly") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const s = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`;
    return { from: s, to: todayStr, period: "monthly" };
  }

  if (period === "range") {
    if (!isIsoDate(from) || !isIsoDate(to)) {
      throw new Error("Para rango personalizado debes enviar fechas validas en formato YYYY-MM-DD");
    }
    if (from > to) {
      throw new Error("La fecha inicial no puede ser mayor a la fecha final");
    }
    return { from, to, period: "range" };
  }

  return { from: todayStr, to: todayStr, period: "daily" };
}

router.get("/dashboard", async (req, res) => {
  const branchId = req.user.branchId;
  const summaryResult = await pool.query(
    `
      SELECT
        COALESCE(SUM(total), 0) AS total_sales,
        COALESCE(COUNT(*), 0) AS total_transactions,
        COALESCE(AVG(total), 0) AS average_ticket,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) AS card_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END), 0) AS transfer_sales,
        COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total ELSE 0 END), 0) AS credit_sales
      FROM sales
      WHERE branch_id = $1
        AND payment_status = 'completed'
        AND DATE(sale_date) = CURRENT_DATE
      LIMIT 1
    `,
    [branchId]
  );

  const productsResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM products WHERE active = true AND branch_id = $1",
    [branchId]
  );
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

router.get("/last7", async (req, res) => {
  const branchId = req.user.branchId;
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
      LEFT JOIN (
        SELECT
          DATE(sale_date) AS date,
          SUM(total) AS total_sales,
          COUNT(*) AS total_transactions
        FROM sales
        WHERE branch_id = $1
          AND payment_status = 'completed'
        GROUP BY DATE(sale_date)
      ) ds ON ds.date = days.d
      ORDER BY days.d ASC
    `,
    [branchId]
  );
  return res.json(result.rows.map((r) => ({ ...r, ventas: Number(r.ventas) })));
});

router.get("/top-products", async (req, res) => {
  const branchId = req.user.branchId;
  const limit = Math.max(1, Math.min(20, Number(req.query.limit || 8)));
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.sku,
        p.name,
        c.name AS category_name,
        SUM(si.quantity) AS total_quantity_sold,
        SUM(si.subtotal) AS total_revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.branch_id = $1
        AND s.payment_status = 'completed'
      GROUP BY p.id, p.sku, p.name, c.name
      ORDER BY total_revenue DESC
      LIMIT $2
    `,
    [branchId, limit]
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

router.get("/expirations", async (req, res) => {
  const branchId = req.user.branchId;
  const businessSettings = await getBusinessSettings(branchId, pool);
  const modules = Array.isArray(businessSettings?.enabledModules) ? businessSettings.enabledModules : [];
  if (!modules.includes("expirations")) {
    return res.json({
      summary: { expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 },
      items: [],
      enabled: false,
    });
  }
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  const days = Math.max(1, Math.min(365, Number(req.query.days || 90)));
  try {
    const summaryResult = await pool.query(
      `
        SELECT
          COALESCE(SUM(CASE WHEN b.expiration_date < CURRENT_DATE THEN b.quantity_current ELSE 0 END), 0)::int AS expired_units,
          COALESCE(SUM(CASE WHEN b.expiration_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 day') THEN b.quantity_current ELSE 0 END), 0)::int AS due_30_units,
          COALESCE(SUM(CASE WHEN b.expiration_date > (CURRENT_DATE + INTERVAL '30 day') AND b.expiration_date <= (CURRENT_DATE + INTERVAL '60 day') THEN b.quantity_current ELSE 0 END), 0)::int AS due_60_units,
          COALESCE(SUM(CASE WHEN b.expiration_date > (CURRENT_DATE + INTERVAL '60 day') AND b.expiration_date <= (CURRENT_DATE + INTERVAL '90 day') THEN b.quantity_current ELSE 0 END), 0)::int AS due_90_units
        FROM product_batches b
        WHERE b.branch_id = $1
          AND b.active = true
          AND b.quantity_current > 0
          AND b.expiration_date IS NOT NULL
      `,
      [branchId]
    );

    const listResult = await pool.query(
      `
        SELECT
          b.id,
          b.batch_code,
          b.expiration_date,
          b.quantity_current,
          p.id AS product_id,
          p.name AS product_name,
          p.sku AS product_sku,
          p.brand AS product_brand
        FROM product_batches b
        JOIN products p ON p.id = b.product_id
        WHERE b.branch_id = $1
          AND b.active = true
          AND b.quantity_current > 0
          AND b.expiration_date IS NOT NULL
          AND b.expiration_date <= (CURRENT_DATE + ($2::text || ' day')::interval)
        ORDER BY b.expiration_date ASC, b.id ASC
        LIMIT $3
      `,
      [branchId, days, limit]
    );

    const s = summaryResult.rows[0] || {};
    return res.json({
      enabled: true,
      summary: {
        expiredUnits: Number(s.expired_units || 0),
        due30Units: Number(s.due_30_units || 0),
        due60Units: Number(s.due_60_units || 0),
        due90Units: Number(s.due_90_units || 0),
      },
      items: listResult.rows.map((row) => ({
        id: Number(row.id),
        batchCode: row.batch_code,
        expirationDate: row.expiration_date,
        quantityCurrent: Number(row.quantity_current || 0),
        product: {
          id: String(row.product_id),
          name: row.product_name,
          sku: row.product_sku || "",
          brand: row.product_brand || "",
        },
      })),
    });
  } catch (error) {
    if (error?.code === "42P01") {
      return res.json({
        enabled: true,
        summary: { expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 },
        items: [],
      });
    }
    throw error;
  }
});

router.get("/sales-by-category", async (req, res) => {
  const branchId = req.user.branchId;
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
        AND s.branch_id = $2
        AND s.sale_date >= CURRENT_DATE - ($1::text || ' days')::interval
      GROUP BY COALESCE(c.name, 'Otros')
      ORDER BY value DESC
      LIMIT 8
    `,
    [days, branchId]
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

router.get("/cutoff", async (req, res) => {
  const branchId = req.user.branchId;
  const requestedPeriod = String(req.query.period || "daily").trim();
  const fromInput = String(req.query.from || "").trim();
  const toInput = String(req.query.to || "").trim();

  let range;
  try {
    range = resolveCutoffRange(requestedPeriod, fromInput, toInput);
  } catch (error) {
    return res.status(400).json({ message: error?.message || "Rango invalido" });
  }

  const { from, to, period } = range;

  const salesSummary = await pool.query(
    `
      WITH sale_costs AS (
        SELECT sale_id, SUM(cost_historico * quantity)::numeric AS total_cost
        FROM sale_items
        GROUP BY sale_id
      )
      SELECT
        COALESCE(SUM(s.total), 0)::numeric AS total_sales,
        COALESCE(COUNT(*), 0)::int AS total_transactions,
        COALESCE(AVG(s.total), 0)::numeric AS average_ticket,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total ELSE 0 END), 0)::numeric AS cash_sales,
        COALESCE(SUM(CASE WHEN s.payment_method <> 'cash' THEN s.total ELSE 0 END), 0)::numeric AS other_sales,
        COALESCE(SUM(CASE WHEN s.payment_method = 'card' THEN s.total ELSE 0 END), 0)::numeric AS card_sales,
        COALESCE(SUM(CASE WHEN s.payment_method = 'transfer' THEN s.total ELSE 0 END), 0)::numeric AS transfer_sales,
        COALESCE(SUM(CASE WHEN s.payment_method = 'mixed' THEN s.total ELSE 0 END), 0)::numeric AS mixed_sales,
        COALESCE(SUM(CASE WHEN s.payment_method = 'credit' THEN s.total ELSE 0 END), 0)::numeric AS credit_sales,
        COALESCE(SUM(sc.total_cost), 0)::numeric AS total_cost
      FROM sales s
      LEFT JOIN sale_costs sc ON sc.sale_id = s.id
      WHERE s.branch_id = $1
        AND s.payment_status = 'completed'
        AND s.sale_date >= $2::date
        AND s.sale_date < ($3::date + INTERVAL '1 day')
    `,
    [branchId, from, to]
  );

  const refundsSummary = await pool.query(
    `
      SELECT COALESCE(SUM(total_refund), 0)::numeric AS cash_refunds
      FROM sale_returns
      WHERE branch_id = $1
        AND refund_method = 'cash'
        AND created_at >= $2::date
        AND created_at < ($3::date + INTERVAL '1 day')
    `,
    [branchId, from, to]
  );

  let movementsSummary;
  try {
    movementsSummary = await pool.query(
      `
        SELECT
          COALESCE(SUM(CASE WHEN movement_type = 'in' THEN amount ELSE 0 END), 0)::numeric AS cash_entries,
          COALESCE(SUM(CASE WHEN movement_type = 'out' THEN amount ELSE 0 END), 0)::numeric AS cash_exits
        FROM cash_movements
        WHERE branch_id = $1
          AND created_at >= $2::date
          AND created_at < ($3::date + INTERVAL '1 day')
      `,
      [branchId, from, to]
    );
  } catch (error) {
    if (error?.code === "42P01") {
      movementsSummary = { rows: [{ cash_entries: 0, cash_exits: 0 }] };
    } else {
      throw error;
    }
  }

  const openingSummary = await pool.query(
    `
      SELECT COALESCE(SUM(opening_amount), 0)::numeric AS opening_cash
      FROM cash_sessions
      WHERE branch_id = $1
        AND opened_at >= $2::date
        AND opened_at < ($3::date + INTERVAL '1 day')
    `,
    [branchId, from, to]
  );

  const closingSummary = await pool.query(
    `
      SELECT COALESCE(SUM(closing_amount), 0)::numeric AS closing_cash
      FROM cash_sessions
      WHERE branch_id = $1
        AND status = 'closed'
        AND closed_at IS NOT NULL
        AND closed_at >= $2::date
        AND closed_at < ($3::date + INTERVAL '1 day')
    `,
    [branchId, from, to]
  );

  const byDepartment = await pool.query(
    `
      SELECT
        COALESCE(c.name, 'Otros') AS department_name,
        COALESCE(SUM(si.quantity), 0)::int AS units_sold,
        COALESCE(SUM(si.subtotal), 0)::numeric AS total_sales,
        COALESCE(SUM(si.cost_historico * si.quantity), 0)::numeric AS total_cost,
        COALESCE(SUM(si.subtotal - (si.cost_historico * si.quantity)), 0)::numeric AS gross_profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE s.branch_id = $1
        AND s.payment_status = 'completed'
        AND s.sale_date >= $2::date
        AND s.sale_date < ($3::date + INTERVAL '1 day')
      GROUP BY COALESCE(c.name, 'Otros')
      ORDER BY total_sales DESC
    `,
    [branchId, from, to]
  );

  const byDay = await pool.query(
    `
      WITH sale_costs AS (
        SELECT sale_id, SUM(cost_historico * quantity)::numeric AS total_cost
        FROM sale_items
        GROUP BY sale_id
      )
      SELECT
        DATE(s.sale_date) AS report_day,
        COALESCE(COUNT(*), 0)::int AS total_transactions,
        COALESCE(SUM(s.total), 0)::numeric AS total_sales,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total ELSE 0 END), 0)::numeric AS cash_sales,
        COALESCE(SUM(CASE WHEN s.payment_method <> 'cash' THEN s.total ELSE 0 END), 0)::numeric AS other_sales,
        COALESCE(SUM(sc.total_cost), 0)::numeric AS total_cost,
        COALESCE(SUM(s.total - COALESCE(sc.total_cost, 0)), 0)::numeric AS gross_profit
      FROM sales s
      LEFT JOIN sale_costs sc ON sc.sale_id = s.id
      WHERE s.branch_id = $1
        AND s.payment_status = 'completed'
        AND s.sale_date >= $2::date
        AND s.sale_date < ($3::date + INTERVAL '1 day')
      GROUP BY DATE(s.sale_date)
      ORDER BY DATE(s.sale_date) DESC
    `,
    [branchId, from, to]
  );

  const sales = salesSummary.rows[0] || {};
  const refunds = refundsSummary.rows[0] || {};
  const movements = movementsSummary.rows[0] || {};
  const opening = openingSummary.rows[0] || {};
  const closing = closingSummary.rows[0] || {};

  const totalSales = Number(sales.total_sales || 0);
  const totalCost = Number(sales.total_cost || 0);
  const grossProfit = totalSales - totalCost;
  const cashSales = Number(sales.cash_sales || 0);
  const otherSales = Number(sales.other_sales || 0);
  const cashEntries = Number(movements.cash_entries || 0);
  const cashExits = Number(movements.cash_exits || 0);
  const cashRefunds = Number(refunds.cash_refunds || 0);
  const openingCash = Number(opening.opening_cash || 0);
  const closingCash = Number(closing.closing_cash || 0);
  const expectedCash = openingCash + cashSales + cashEntries - cashExits - cashRefunds;

  return res.json({
    period,
    from,
    to,
    summary: {
      totalSales,
      totalTransactions: Number(sales.total_transactions || 0),
      averageTicket: Number(sales.average_ticket || 0),
      totalCost,
      grossProfit,
      cashSales,
      cardSales: Number(sales.card_sales || 0),
      transferSales: Number(sales.transfer_sales || 0),
      mixedSales: Number(sales.mixed_sales || 0),
      creditSales: Number(sales.credit_sales || 0),
      otherSales,
      openingCash,
      cashEntries,
      cashExits,
      cashRefunds,
      expectedCash,
      declaredClosingCash: closingCash,
      cashDifference: closingCash - expectedCash,
    },
    salesByDepartment: byDepartment.rows.map((row) => ({
      departmentName: row.department_name,
      unitsSold: Number(row.units_sold || 0),
      totalSales: Number(row.total_sales || 0),
      totalCost: Number(row.total_cost || 0),
      grossProfit: Number(row.gross_profit || 0),
    })),
    salesByDay: byDay.rows.map((row) => ({
      day: row.report_day,
      totalTransactions: Number(row.total_transactions || 0),
      totalSales: Number(row.total_sales || 0),
      cashSales: Number(row.cash_sales || 0),
      otherSales: Number(row.other_sales || 0),
      totalCost: Number(row.total_cost || 0),
      grossProfit: Number(row.gross_profit || 0),
    })),
  });
});

export default router;
