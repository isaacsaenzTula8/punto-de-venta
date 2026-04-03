import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { getBusinessSettings } from "../services/business-settings.js";

const router = express.Router();

router.use(requireAuth);

function resolveDiscount(subtotal, discountTypeInput, discountValueInput) {
  const subtotalNumber = Number(subtotal || 0);
  const discountType = String(discountTypeInput || "amount").trim().toLowerCase();
  const rawValue = Number(discountValueInput || 0);

  if (!Number.isFinite(rawValue) || rawValue < 0) {
    return { error: "Descuento invalido" };
  }
  if (!["amount", "percent"].includes(discountType)) {
    return { error: "Tipo de descuento invalido" };
  }
  if (discountType === "percent" && rawValue > 100) {
    return { error: "El descuento en porcentaje no puede ser mayor a 100" };
  }

  const discountRaw = discountType === "percent" ? (subtotalNumber * rawValue) / 100 : rawValue;
  const discount = Number(discountRaw.toFixed(2));
  if (discount > subtotalNumber) {
    return { error: "El descuento no puede ser mayor al subtotal" };
  }

  return { discount };
}

router.post("/", async (req, res) => {
  const branchId = req.user.branchId;
  const businessSettings = await getBusinessSettings(branchId, pool);
  const modules = Array.isArray(businessSettings?.enabledModules) ? businessSettings.enabledModules : [];
  const expirationsEnabled = modules.includes("expirations");
  const {
    items,
    paymentMethod = "cash",
    customerId = null,
    notes = null,
    chargeNow = true,
    discountType = "amount",
    discountValue = 0,
  } = req.body || {};
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
        "SELECT id FROM cash_sessions WHERE user_id = $1 AND branch_id = $2 AND status = 'open' LIMIT 1",
        [req.user.sub, branchId]
      );

      if (!openSession.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Debe abrir caja antes de vender" });
      }
      openCashSessionId = openSession.rows[0].id;
    }

    let subtotalAmount = 0;
    const resolvedItems = [];

    for (const rawItem of items) {
      const productId = Number(rawItem?.productId);
      const quantity = Number(rawItem?.quantity);
      const presentationId = rawItem?.presentationId ? Number(rawItem?.presentationId) : null;

      if (!productId || !quantity || quantity <= 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Cada item requiere productId y quantity > 0" });
      }

      const productResult = await client.query(
        `
          SELECT
            p.id,
            p.sku,
            p.name,
            p.price,
            p.cost,
            p.stock,
            p.active,
            p.expiration_required,
            apd.discount_type,
            apd.discount_value,
            CASE
              WHEN apd.discount_type = 'percent' THEN GREATEST(0, ROUND((p.price - ((p.price * apd.discount_value) / 100.0))::numeric, 2))
              WHEN apd.discount_type = 'amount' THEN GREATEST(0, ROUND((p.price - apd.discount_value)::numeric, 2))
              ELSE p.price
            END AS effective_price
          FROM products p
          LEFT JOIN LATERAL (
            SELECT discount_type, discount_value
            FROM product_discounts pd
            WHERE pd.product_id = p.id
              AND pd.branch_id = p.branch_id
              AND pd.active = true
              AND NOW() BETWEEN pd.start_at AND pd.end_at
            ORDER BY pd.start_at DESC, pd.id DESC
            LIMIT 1
          ) apd ON true
          WHERE p.id = $1
            AND p.branch_id = $2
          LIMIT 1
        `,
        [productId, branchId]
      );
      const product = productResult.rows[0];

      if (!product || !product.active) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Producto ${productId} no disponible` });
      }

      let selectedPresentation = null;
      if (presentationId) {
        const presentationResult = await client.query(
          `
            SELECT id, name, units_factor, price, sku, barcode
            FROM product_presentations
            WHERE id = $1
              AND product_id = $2
              AND branch_id = $3
              AND active = true
            LIMIT 1
          `,
          [presentationId, productId, branchId]
        );
        selectedPresentation = presentationResult.rows[0] || null;
        if (!selectedPresentation) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: `Presentacion invalida para ${product.name}` });
        }
      }

      const unitsFactor = Number(selectedPresentation?.units_factor || 1);
      const stockUnits = quantity * unitsFactor;
      if (Number(product.stock) < stockUnits) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Stock insuficiente para ${product.name}` });
      }

      let batchAllocations = [];
      if (expirationsEnabled && Boolean(product.expiration_required)) {
        const batchRows = await client.query(
          `
            SELECT id, quantity_current, expiration_date
            FROM product_batches
            WHERE product_id = $1
              AND branch_id = $2
              AND active = true
              AND quantity_current > 0
              AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
            ORDER BY
              CASE WHEN expiration_date IS NULL THEN 1 ELSE 0 END,
              expiration_date ASC,
              id ASC
            FOR UPDATE
          `,
          [productId, branchId]
        );
        const totalBatchStock = batchRows.rows.reduce((sum, row) => sum + Number(row.quantity_current || 0), 0);
        if (totalBatchStock < stockUnits) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: `Stock por lote insuficiente para ${product.name}` });
        }

        let pendingUnits = stockUnits;
        for (const row of batchRows.rows) {
          if (pendingUnits <= 0) break;
          const available = Number(row.quantity_current || 0);
          if (available <= 0) continue;
          const take = Math.min(available, pendingUnits);
          batchAllocations.push({ batchId: Number(row.id), quantityUnits: take });
          pendingUnits -= take;
        }
      }

      let unitPrice = Number(product.effective_price ?? product.price);
      if (selectedPresentation) {
        const presentationBasePrice = Number(selectedPresentation.price || 0);
        const discountType = String(product.discount_type || "").trim();
        const discountValue = Number(product.discount_value || 0);
        if (discountType === "percent") {
          unitPrice = Math.max(0, Number((presentationBasePrice - (presentationBasePrice * discountValue) / 100).toFixed(2)));
        } else if (discountType === "amount") {
          unitPrice = Math.max(0, Number((presentationBasePrice - discountValue).toFixed(2)));
        } else {
          unitPrice = presentationBasePrice;
        }
      }
      const unitCost = Number(product.cost || 0);
      const subtotal = unitPrice * quantity;
      subtotalAmount += subtotal;

      resolvedItems.push({
        productId: product.id,
        sku: selectedPresentation?.sku || product.sku,
        name: product.name,
        quantity,
        presentationId: selectedPresentation ? Number(selectedPresentation.id) : null,
        presentationName: selectedPresentation?.name || "Unidad",
        unitsFactor,
        stockUnits,
        batchAllocations,
        unitCost,
        unitPrice,
        subtotal,
      });
    }

    const discountResolved = resolveDiscount(subtotalAmount, discountType, discountValue);
    if (discountResolved.error) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: discountResolved.error });
    }

    const discount = Number(discountResolved.discount || 0);
    const total = Number((subtotalAmount - discount).toFixed(2));

    const saleNumberResult = await client.query(
      "SELECT CONCAT('VENTA-', LPAD((COALESCE(MAX(id),0) + 1)::text, 6, '0')) AS sale_number FROM sales WHERE branch_id = $1",
      [branchId]
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
          cash_session_id,
          branch_id
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          0,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          NOW(),
          CASE WHEN $11 THEN NOW() ELSE NULL END,
          $12,
          $13
        )
        RETURNING id, sale_number, user_id, charged_by_user_id, subtotal, discount, total, customer_id, payment_method, payment_status, sale_date
      `,
      [
        saleNumber,
        req.user.sub,
        shouldChargeNow ? req.user.sub : null,
        subtotalAmount,
        discount,
        total,
        Number(customerId) || null,
        paymentMethod,
        shouldChargeNow ? "completed" : "pending",
        notes,
        shouldChargeNow,
        openCashSessionId,
        branchId,
      ]
    );
    const sale = saleInsert.rows[0];

    for (const item of resolvedItems) {
      const saleItemInsert = await client.query(
        `
          INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            product_sku,
            presentation_id,
            presentation_name,
            units_factor,
            quantity,
            cost_historico,
            unit_price,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id
        `,
        [
          sale.id,
          item.productId,
          item.name,
          item.sku,
          item.presentationId,
          item.presentationName,
          item.unitsFactor,
          item.quantity,
          item.unitCost,
          item.unitPrice,
          item.subtotal,
        ]
      );
      const saleItemId = Number(saleItemInsert.rows[0]?.id || 0);
      if (Array.isArray(item.batchAllocations) && item.batchAllocations.length) {
        for (const alloc of item.batchAllocations) {
          await client.query("UPDATE product_batches SET quantity_current = quantity_current - $1 WHERE id = $2", [
            alloc.quantityUnits,
            alloc.batchId,
          ]);
          await client.query(
            `
              INSERT INTO sale_item_batch_allocations (sale_item_id, batch_id, quantity_units, returned_units)
              VALUES ($1, $2, $3, 0)
            `,
            [saleItemId, alloc.batchId, alloc.quantityUnits]
          );
          await client.query(
            `
              INSERT INTO product_batch_movements (
                batch_id, product_id, branch_id, movement_type, quantity, reason, sale_id, created_by_user_id
              )
              VALUES ($1, $2, $3, 'sale', $4, 'Venta POS', $5, $6)
            `,
            [alloc.batchId, item.productId, branchId, alloc.quantityUnits, sale.id, req.user.sub]
          );
        }
      }
      await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [item.stockUnits, item.productId]);
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
  const discountType = String(req.body?.discountType || "amount");
  const discountValue = req.body?.discountValue ?? null;
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
      "SELECT id FROM cash_sessions WHERE user_id = $1 AND branch_id = $2 AND status = 'open' LIMIT 1",
      [req.user.sub, req.user.branchId]
    );
    if (!openSession.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Debe abrir caja antes de cobrar" });
    }

    const saleResult = await client.query(
      `
        SELECT id, payment_status, payment_method, subtotal, discount, total
        FROM sales
        WHERE id = $1 AND branch_id = $2
        FOR UPDATE
      `,
      [saleId, req.user.branchId]
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

    let nextDiscount = Number(sale.discount || 0);
    let nextTotal = Number(sale.total || 0);
    if (discountValue !== null && discountValue !== undefined && String(discountValue).trim() !== "") {
      const discountResolved = resolveDiscount(sale.subtotal, discountType, discountValue);
      if (discountResolved.error) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: discountResolved.error });
      }
      nextDiscount = Number(discountResolved.discount || 0);
      nextTotal = Number((Number(sale.subtotal || 0) - nextDiscount).toFixed(2));
    }

    const updated = await client.query(
      `
        UPDATE sales
        SET payment_status = 'completed',
            payment_method = $1,
            customer_id = COALESCE($2, customer_id),
            discount = $3,
            total = $4,
            cash_session_id = $5,
            charged_by_user_id = $6,
            charged_at = NOW()
        WHERE id = $7
        RETURNING id, sale_number, payment_status, payment_method, discount, total, charged_by_user_id, charged_at
      `,
      [paymentMethod, Number(customerId) || null, nextDiscount, nextTotal, openSession.rows[0].id, req.user.sub, saleId]
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
  const businessSettings = await getBusinessSettings(req.user.branchId, pool);
  const modules = Array.isArray(businessSettings?.enabledModules) ? businessSettings.enabledModules : [];
  const expirationsEnabled = modules.includes("expirations");
  try {
    await client.query("BEGIN");

    const openSession = await client.query(
      "SELECT id FROM cash_sessions WHERE user_id = $1 AND branch_id = $2 AND status = 'open' LIMIT 1",
      [req.user.sub, req.user.branchId]
    );
    if (!openSession.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Debe abrir caja antes de procesar devoluciones" });
    }

    const saleResult = await client.query(
      `
        SELECT id, payment_status
        FROM sales
        WHERE id = $1 AND branch_id = $2
        FOR UPDATE
      `,
      [saleId, req.user.branchId]
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
        SELECT id, product_id, quantity, unit_price, returned_quantity, units_factor
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
      unitsFactor: Number(row.units_factor || 1),
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
        unitsFactor: baseItem.unitsFactor,
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
          branch_id,
          processed_by_user_id,
          cash_session_id,
          return_type,
          refund_method,
          total_refund,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, sale_id, return_type, refund_method, total_refund, created_at
      `,
      [saleId, req.user.branchId, req.user.sub, openSession.rows[0].id, returnType, refundMethod, totalRefund, notes]
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
        const stockUnits = item.quantity * Math.max(1, Number(item.unitsFactor || 1));
        await client.query("UPDATE products SET stock = stock + $1 WHERE id = $2", [stockUnits, item.productId]);

        if (!expirationsEnabled) {
          continue;
        }
        const allocationRows = await client.query(
          `
            SELECT id, batch_id, quantity_units, returned_units
            FROM sale_item_batch_allocations
            WHERE sale_item_id = $1
            ORDER BY id ASC
            FOR UPDATE
          `,
          [item.saleItemId]
        );

        let pendingUnits = stockUnits;
        for (const alloc of allocationRows.rows) {
          if (pendingUnits <= 0) break;
          const availableToReturn = Math.max(0, Number(alloc.quantity_units || 0) - Number(alloc.returned_units || 0));
          if (availableToReturn <= 0) continue;
          const toReturn = Math.min(availableToReturn, pendingUnits);
          await client.query(
            "UPDATE sale_item_batch_allocations SET returned_units = returned_units + $1 WHERE id = $2",
            [toReturn, alloc.id]
          );
          await client.query("UPDATE product_batches SET quantity_current = quantity_current + $1 WHERE id = $2", [
            toReturn,
            alloc.batch_id,
          ]);
          await client.query(
            `
              INSERT INTO product_batch_movements (
                batch_id, product_id, branch_id, movement_type, quantity, reason, sale_id, sale_item_id, created_by_user_id
              )
              VALUES ($1, $2, $3, 'refund', $4, 'Devolucion POS', $5, $6, $7)
            `,
            [alloc.batch_id, item.productId, req.user.branchId, toReturn, saleId, item.saleItemId, req.user.sub]
          );
          pendingUnits -= toReturn;
        }
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
      await client.query("UPDATE sales SET payment_status = 'refunded' WHERE id = $1 AND branch_id = $2", [
        saleId,
        req.user.branchId,
      ]);
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
  const branchId = req.user.branchId;
  const result = await pool.query(
    `
      SELECT id, sale_number, total, customer_id, payment_method, payment_status, sale_date
      FROM sales
      WHERE branch_id = $1
      ORDER BY sale_date DESC
      LIMIT 50
    `,
    [branchId]
  );
  return res.json(result.rows);
});

router.get("/", async (req, res) => {
  const branchId = req.user.branchId;
  const search = String(req.query.search || "").trim();
  const paymentMethod = String(req.query.paymentMethod || "all");
  const paymentStatus = String(req.query.paymentStatus || "all");
  const fromDate = String(req.query.from || "").trim();
  const toDate = String(req.query.to || "").trim();
  const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

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
  if (fromDate) {
    if (!isIsoDate(fromDate)) {
      return res.status(400).json({ message: "Parametro from invalido. Usa formato YYYY-MM-DD" });
    }
    where.push(`s.sale_date::date >= $${idx}::date`);
    values.push(fromDate);
    idx += 1;
  }
  if (toDate) {
    if (!isIsoDate(toDate)) {
      return res.status(400).json({ message: "Parametro to invalido. Usa formato YYYY-MM-DD" });
    }
    where.push(`s.sale_date::date <= $${idx}::date`);
    values.push(toDate);
    idx += 1;
  }

  where.unshift(`s.branch_id = $${idx}`);
  values.push(branchId);
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.sale_number,
        s.sale_date,
        s.subtotal,
        s.discount,
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
        s.subtotal,
        s.discount,
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
        s.subtotal,
        s.discount,
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
      WHERE s.id = $1 AND s.branch_id = $2
      LIMIT 1
    `,
    [id, req.user.branchId]
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
        presentation_id,
        presentation_name,
        units_factor,
        quantity,
        returned_quantity,
        (quantity - returned_quantity) AS refundable_quantity,
        cost_historico,
        unit_price,
        subtotal,
        (subtotal - (cost_historico * quantity))::DECIMAL(10, 2) AS utilidad
      FROM sale_items si
      WHERE sale_id = $1
      ORDER BY id ASC
    `,
    [id]
  );

  return res.json({ ...sale, items: itemsResult.rows });
});

export default router;
