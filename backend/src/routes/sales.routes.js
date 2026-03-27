import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.post("/", async (req, res) => {
  const { items, paymentMethod = "cash", customerId = null, notes = null, chargeNow = true } = req.body || {};
  const allowedPaymentMethods = ["cash", "card", "transfer", "mixed", "credit"];
  const shouldChargeNow = Boolean(chargeNow);

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items es requerido y debe contener productos" });
  }
  if (shouldChargeNow && !req.permissions?.salesCharge) {
    return res.status(403).json({ message: "No tienes permiso para cobrar ventas en esta tienda" });
  }
  if (!allowedPaymentMethods.includes(String(paymentMethod))) {
    return res.status(400).json({ message: "Metodo de pago invalido" });
  }
  if (shouldChargeNow && paymentMethod === "credit" && !Number(customerId)) {
    return res.status(400).json({ message: "Para cobro a credito debes seleccionar un cliente" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let openCashSessionId = null;
    if (shouldChargeNow) {
      const openSession = await client.query(
        "SELECT id FROM cash_sessions WHERE user_id = $1 AND status = 'open' LIMIT 1",
        [req.user.sub]
      );

      if (!openSession.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Debe abrir caja antes de vender" });
      }
      openCashSessionId = openSession.rows[0].id;
    }

    let total = 0;
    const resolvedItems = [];

    for (const rawItem of items) {
      const productId = Number(rawItem?.productId);
      const quantity = Number(rawItem?.quantity);

      if (!productId || !quantity || quantity <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Cada item requiere productId y quantity > 0" });
      }

      const productResult = await client.query(
        "SELECT id, sku, name, price, cost, stock, active FROM products WHERE id = $1 LIMIT 1",
        [productId]
      );
      const product = productResult.rows[0];

      if (!product || !product.active) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Producto ${productId} no disponible` });
      }
      if (Number(product.stock) < quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Stock insuficiente para ${product.name}` });
      }

      const unitPrice = Number(product.price);
      const unitCost = Number(product.cost || 0);
      const subtotal = unitPrice * quantity;
      total += subtotal;

      resolvedItems.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity,
        unitCost,
        unitPrice,
        subtotal,
      });
    }

    const saleNumberResult = await client.query(
      "SELECT CONCAT('VENTA-', LPAD((COALESCE(MAX(id),0) + 1)::text, 6, '0')) AS sale_number FROM sales"
    );
    const saleNumber = saleNumberResult.rows[0].sale_number;

    const saleInsert = await client.query(
      `
        INSERT INTO sales (
          sale_number,
          user_id,
          charged_by_user_id,
          subtotal,
          tax,
          discount,
          total,
          customer_id,
          payment_method,
          payment_status,
          notes,
          sale_date,
          charged_at,
          cash_session_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          0,
          0,
          $4,
          $5,
          $6,
          $7,
          $8,
          NOW(),
          CASE WHEN $9 THEN NOW() ELSE NULL END,
          $10
        )
        RETURNING id, sale_number, user_id, charged_by_user_id, subtotal, total, customer_id, payment_method, payment_status, sale_date
      `,
      [
        saleNumber,
        req.user.sub,
        shouldChargeNow ? req.user.sub : null,
        total,
        Number(customerId) || null,
        paymentMethod,
        shouldChargeNow ? "completed" : "pending",
        notes,
        shouldChargeNow,
        openCashSessionId,
      ]
    );
    const sale = saleInsert.rows[0];

    for (const item of resolvedItems) {
      await client.query(
        `
          INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            product_sku,
            quantity,
            cost_historico,
            unit_price,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [sale.id, item.productId, item.name, item.sku, item.quantity, item.unitCost, item.unitPrice, item.subtotal]
      );

    }

    if (shouldChargeNow && paymentMethod === "cash" && openCashSessionId) {
      await client.query(
        `
          UPDATE cash_sessions
          SET total_cash_sales = total_cash_sales + $1
          WHERE id = $2
        `,
        [total, openCashSessionId]
      );
    }

    await client.query("COMMIT");
    sale.payment_status = shouldChargeNow ? "completed" : "pending";
    return res.status(201).json({ sale, items: resolvedItems });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Error al registrar la venta" });
  } finally {
    client.release();
  }
});

router.post("/:id/charge", async (req, res) => {
  if (!req.permissions?.salesCharge) {
    return res.status(403).json({ message: "No tienes permiso para cobrar ventas en esta tienda" });
  }

  const saleId = Number(req.params.id);
  const paymentMethod = String(req.body?.paymentMethod || "cash");
  const customerId = req.body?.customerId ?? null;
  const allowedPaymentMethods = ["cash", "card", "transfer", "mixed", "credit"];

  if (!saleId) {
    return res.status(400).json({ message: "ID de venta invalido" });
  }
  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ message: "Metodo de pago invalido" });
  }
  if (paymentMethod === "credit" && !Number(customerId)) {
    return res.status(400).json({ message: "Para cobro a credito debes seleccionar un cliente" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const openSession = await client.query(
      "SELECT id FROM cash_sessions WHERE user_id = $1 AND status = 'open' LIMIT 1",
      [req.user.sub]
    );
    if (!openSession.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Debe abrir caja antes de cobrar" });
    }

    const saleResult = await client.query(
      `
        SELECT id, payment_status, payment_method
        FROM sales
        WHERE id = $1
        FOR UPDATE
      `,
      [saleId]
    );

    const sale = saleResult.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Venta no encontrada" });
    }
    if (sale.payment_status === "completed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La venta ya estaba cobrada" });
    }
    if (sale.payment_status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Solo se pueden cobrar ventas pendientes" });
    }

    const updated = await client.query(
      `
        UPDATE sales
        SET payment_status = 'completed',
            payment_method = $1,
            customer_id = COALESCE($2, customer_id),
            cash_session_id = $3,
            charged_by_user_id = $4,
            charged_at = NOW()
        WHERE id = $5
        RETURNING id, sale_number, payment_status, payment_method, charged_by_user_id, charged_at
      `,
      [paymentMethod, Number(customerId) || null, openSession.rows[0].id, req.user.sub, saleId]
    );

    if (paymentMethod === "cash") {
      await client.query(
        `
          UPDATE cash_sessions
          SET total_cash_sales = total_cash_sales + (
            SELECT total FROM sales WHERE id = $1
          )
          WHERE id = $2
        `,
        [saleId, openSession.rows[0].id]
      );
    }

    await client.query("COMMIT");
    return res.json({ sale: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Error al cobrar la venta" });
  } finally {
    client.release();
  }
});

router.post("/:id/refund", async (req, res) => {
  if (!req.permissions?.salesCharge) {
    return res.status(403).json({ message: "No tienes permiso para procesar devoluciones" });
  }

  const saleId = Number(req.params.id);
  const refundMethod = String(req.body?.refundMethod || "cash");
  const returnAll = Boolean(req.body?.returnAll);
  const notes = req.body?.notes || null;
  const requestedItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const allowedMethods = ["cash", "card", "transfer", "mixed", "credit"];

  if (!saleId) {
    return res.status(400).json({ message: "ID de venta invalido" });
  }
  if (!allowedMethods.includes(refundMethod)) {
    return res.status(400).json({ message: "Metodo de devolucion invalido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const openSession = await client.query(
      "SELECT id FROM cash_sessions WHERE user_id = $1 AND status = 'open' LIMIT 1",
      [req.user.sub]
    );
    if (!openSession.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Debe abrir caja antes de procesar devoluciones" });
    }

    const saleResult = await client.query(
      `
        SELECT id, payment_status
        FROM sales
        WHERE id = $1
        FOR UPDATE
      `,
      [saleId]
    );
    const sale = saleResult.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Venta no encontrada" });
    }
    if (sale.payment_status !== "completed") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Solo se pueden devolver ventas completadas" });
    }

    const saleItemsResult = await client.query(
      `
        SELECT id, product_id, quantity, unit_price, returned_quantity
        FROM sale_items
        WHERE sale_id = $1
        FOR UPDATE
      `,
      [saleId]
    );

    if (!saleItemsResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "La venta no tiene productos para devolver" });
    }

    const candidates = saleItemsResult.rows.map((row) => ({
      saleItemId: Number(row.id),
      productId: row.product_id ? Number(row.product_id) : null,
      quantity: Number(row.quantity),
      unitPrice: Number(row.unit_price),
      returnedQuantity: Number(row.returned_quantity || 0),
      refundableQuantity: Math.max(0, Number(row.quantity) - Number(row.returned_quantity || 0)),
    }));

    let itemsToRefund = [];
    if (returnAll) {
      itemsToRefund = candidates
        .filter((item) => item.refundableQuantity > 0)
        .map((item) => ({
          saleItemId: item.saleItemId,
          quantity: item.refundableQuantity,
        }));
    } else {
      itemsToRefund = requestedItems
        .map((item) => ({
          saleItemId: Number(item?.saleItemId),
          quantity: Number(item?.quantity),
        }))
        .filter((item) => item.saleItemId && item.quantity > 0);
    }

    if (!itemsToRefund.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Debes seleccionar al menos un producto a devolver" });
    }

    let totalRefund = 0;
    const resolvedRefundItems = [];
    for (const reqItem of itemsToRefund) {
      const baseItem = candidates.find((item) => item.saleItemId === reqItem.saleItemId);
      if (!baseItem) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Item ${reqItem.saleItemId} no pertenece a la venta` });
      }
      if (reqItem.quantity > baseItem.refundableQuantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Cantidad invalida para item ${reqItem.saleItemId}` });
      }

      const subtotal = Number((reqItem.quantity * baseItem.unitPrice).toFixed(2));
      totalRefund += subtotal;
      resolvedRefundItems.push({
        saleItemId: baseItem.saleItemId,
        productId: baseItem.productId,
        quantity: reqItem.quantity,
        unitPrice: baseItem.unitPrice,
        subtotal,
      });
    }

    const allRefundable = candidates.reduce((sum, item) => sum + item.refundableQuantity, 0);
    const requestedQty = resolvedRefundItems.reduce((sum, item) => sum + item.quantity, 0);
    const returnType = requestedQty === allRefundable ? "full" : "partial";

    const returnInsert = await client.query(
      `
        INSERT INTO sale_returns (
          sale_id,
          processed_by_user_id,
          cash_session_id,
          return_type,
          refund_method,
          total_refund,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, sale_id, return_type, refund_method, total_refund, created_at
      `,
      [saleId, req.user.sub, openSession.rows[0].id, returnType, refundMethod, totalRefund, notes]
    );
    const returnRow = returnInsert.rows[0];

    for (const item of resolvedRefundItems) {
      await client.query(
        `
          INSERT INTO sale_return_items (
            sale_return_id,
            sale_item_id,
            product_id,
            quantity,
            unit_price,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [returnRow.id, item.saleItemId, item.productId, item.quantity, item.unitPrice, item.subtotal]
      );

      await client.query(
        `
          UPDATE sale_items
          SET returned_quantity = returned_quantity + $1
          WHERE id = $2
        `,
        [item.quantity, item.saleItemId]
      );

      if (item.productId) {
        await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2", [item.quantity, item.productId]);
      }
    }

    if (refundMethod === "cash") {
      await client.query(
        `
          UPDATE cash_sessions
          SET total_cash_refunds = total_cash_refunds + $1
          WHERE id = $2
        `,
        [totalRefund, openSession.rows[0].id]
      );
    }

    if (returnType === "full") {
      await client.query("UPDATE sales SET payment_status = 'refunded' WHERE id = $1", [saleId]);
    }

    await client.query("COMMIT");
    return res.status(201).json({
      refund: {
        ...returnRow,
        total_refund: Number(returnRow.total_refund),
      },
      items: resolvedRefundItems,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ message: "Error al procesar devolucion" });
  } finally {
    client.release();
  }
});

router.get("/recent", async (req, res) => {
  const result = await pool.query(
    `
      SELECT id, sale_number, total, customer_id, payment_method, payment_status, sale_date
      FROM sales
      ORDER BY sale_date DESC
      LIMIT 50
    `
  );
  return res.json(result.rows);
});

router.get("/", async (req, res) => {
  const search = String(req.query.search || "").trim();
  const paymentMethod = String(req.query.paymentMethod || "all");
  const paymentStatus = String(req.query.paymentStatus || "all");

  const values = [];
  const where = [];
  let idx = 1;

  if (search) {
    where.push(`(s.sale_number ILIKE $${idx} OR creator.full_name ILIKE $${idx} OR charger.full_name ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx += 1;
  }
  if (paymentMethod !== "all") {
    where.push(`s.payment_method = $${idx}`);
    values.push(paymentMethod);
    idx += 1;
  }
  if (paymentStatus !== "all") {
    where.push(`s.payment_status = $${idx}`);
    values.push(paymentStatus);
    idx += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.sale_number,
        s.sale_date,
        s.total,
        s.customer_id,
        s.payment_method,
        s.payment_status,
        COALESCE(charger.full_name, creator.full_name, 'Usuario') AS cashier,
        COALESCE(creator.full_name, 'Usuario') AS taken_by,
        charger.full_name AS charged_by,
        COALESCE(SUM(si.quantity), 0) AS items_count
      FROM sales s
      LEFT JOIN users creator ON creator.id = s.user_id
      LEFT JOIN users charger ON charger.id = s.charged_by_user_id
      LEFT JOIN sale_items si ON si.sale_id = s.id
      ${whereSql}
      GROUP BY
        s.id,
        s.sale_number,
        s.sale_date,
        s.total,
        s.payment_method,
        s.payment_status,
        creator.full_name,
        charger.full_name
      ORDER BY s.sale_date DESC
      LIMIT 200
    `,
    values
  );
  return res.json(result.rows);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "ID de venta invalido" });
  }

  const saleResult = await pool.query(
    `
      SELECT
        s.id,
        s.sale_number,
        s.sale_date,
        s.total,
        s.customer_id,
        s.payment_method,
        s.payment_status,
        COALESCE(charger.full_name, creator.full_name, 'Usuario') AS cashier,
        COALESCE(creator.full_name, 'Usuario') AS taken_by,
        charger.full_name AS charged_by
      FROM sales s
      LEFT JOIN users creator ON creator.id = s.user_id
      LEFT JOIN users charger ON charger.id = s.charged_by_user_id
      WHERE s.id = $1
      LIMIT 1
    `,
    [id]
  );

  const sale = saleResult.rows[0];
  if (!sale) {
    return res.status(404).json({ message: "Venta no encontrada" });
  }

  const itemsResult = await pool.query(
    `
      SELECT
        si.id AS sale_item_id,
        product_id,
        product_name,
        product_sku,
        quantity,
        returned_quantity,
        (quantity - returned_quantity) AS refundable_quantity,
        cost_historico,
        unit_price,
        subtotal,
        (subtotal - (cost_historico * quantity))::DECIMAL(10, 2) AS utilidad
      FROM sale_items
      WHERE sale_id = $1
      ORDER BY id ASC
    `,
    [id]
  );

  return res.json({ ...sale, items: itemsResult.rows });
});

export default router;
