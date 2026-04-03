import express from "express";
import { pool } from "../db/pool.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getSystemSettings } from "../services/system-settings.js";

const router = express.Router();

const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "paid",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "cancelled",
  "refunded",
];

const PAYMENT_METHODS = ["cash", "card", "transfer", "mixed", "credit", "cash_on_delivery", "online_gateway"];
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded", "cancelled"];
const FULFILLMENT_TYPES = ["pickup", "delivery"];
const SALE_PAYMENT_METHODS = ["cash", "card", "transfer", "mixed", "credit"];

const STATUS_TRANSITIONS = {
  draft: ["pending_payment", "cancelled"],
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled", "refunded", "completed"],
  preparing: ["ready_for_pickup", "out_for_delivery", "cancelled"],
  ready_for_pickup: ["completed", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

function buildOrderNumberFromId(id) {
  return `ORD-${String(id).padStart(8, "0")}`;
}

function mapOnlinePaymentToSale(paymentMethod) {
  const method = String(paymentMethod || "").trim();
  if (SALE_PAYMENT_METHODS.includes(method)) return method;
  if (method === "cash_on_delivery") return "cash";
  if (method === "online_gateway") return "card";
  return "cash";
}

async function createSaleFromOnlineOrder(client, order, changedByUserId) {
  if (order.linked_sale_id) {
    return Number(order.linked_sale_id);
  }

  const saleNumberResult = await client.query(
    "SELECT CONCAT('VENTA-', LPAD((COALESCE(MAX(id),0) + 1)::text, 6, '0')) AS sale_number FROM sales WHERE branch_id = $1",
    [Number(order.branch_id)]
  );
  const saleNumber = saleNumberResult.rows[0]?.sale_number || `VENTA-${Date.now()}`;
  const salePaymentMethod = mapOnlinePaymentToSale(order.payment_method);

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
        $5,
        $6,
        $7,
        NULL,
        $8,
        'completed',
        $9,
        COALESCE($10, NOW()),
        COALESCE($11, NOW()),
        NULL,
        $12
      )
      RETURNING id
    `,
    [
      saleNumber,
      order.created_by_user_id || changedByUserId || null,
      changedByUserId || null,
      Number(order.subtotal || 0),
      Number(order.tax || 0),
      Number(order.discount || 0),
      Number(order.total || 0),
      salePaymentMethod,
      `Venta online convertida desde pedido ${order.order_number}`,
      order.placed_at || order.created_at || null,
      order.paid_at || null,
      Number(order.branch_id),
    ]
  );
  const saleId = Number(saleInsert.rows[0].id);

  const itemsResult = await client.query(
    `
      SELECT
        product_id,
        product_name,
        product_sku,
        quantity,
        unit_price,
        subtotal
      FROM online_order_items
      WHERE order_id = $1 AND item_status = 'active'
      ORDER BY id ASC
    `,
    [Number(order.id)]
  );

  for (const item of itemsResult.rows) {
    let costHistorico = 0;
    if (item.product_id) {
      const costResult = await client.query(
        "SELECT cost FROM products WHERE id = $1 LIMIT 1",
        [Number(item.product_id)]
      );
      costHistorico = Number(costResult.rows[0]?.cost || 0);
    }

    await client.query(
      `
        INSERT INTO sale_items (
          sale_id,
          product_id,
          product_name,
          product_sku,
          quantity,
          returned_quantity,
          cost_historico,
          unit_price,
          subtotal
        )
        VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)
      `,
      [
        saleId,
        item.product_id ? Number(item.product_id) : null,
        item.product_name,
        item.product_sku,
        Number(item.quantity),
        costHistorico,
        Number(item.unit_price || 0),
        Number(item.subtotal || 0),
      ]
    );
  }

  await client.query(
    "UPDATE online_orders SET linked_sale_id = $1, updated_at = NOW() WHERE id = $2",
    [saleId, Number(order.id)]
  );

  return saleId;
}

async function resolveBranchForAuth(req, requestedBranchId) {
  const systemSettings = await getSystemSettings(pool);
  const requested = Number(requestedBranchId || 0);
  if (req.user.role === "superadmin" && systemSettings.multiBranchEnabled && requested) {
    return requested;
  }
  return Number(req.user.branchId || 1);
}

async function findOrCreateCustomer(client, rawCustomer) {
  const fullName = String(rawCustomer?.fullName || "").trim();
  const email = rawCustomer?.email ? String(rawCustomer.email).trim().toLowerCase() : null;
  const phone = rawCustomer?.phone ? String(rawCustomer.phone).trim() : null;

  if (!fullName) return null;

  if (email) {
    const existingByEmail = await client.query(
      "SELECT id FROM online_customers WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    if (existingByEmail.rows[0]) {
      await client.query(
        `
          UPDATE online_customers
          SET full_name = $1,
              phone = COALESCE($2, phone),
              active = true,
              updated_at = NOW()
          WHERE id = $3
        `,
        [fullName, phone, existingByEmail.rows[0].id]
      );
      return Number(existingByEmail.rows[0].id);
    }
  }

  if (!email && phone) {
    const existingByPhone = await client.query(
      "SELECT id FROM online_customers WHERE phone = $1 LIMIT 1",
      [phone]
    );
    if (existingByPhone.rows[0]) {
      await client.query(
        `
          UPDATE online_customers
          SET full_name = $1,
              active = true,
              updated_at = NOW()
          WHERE id = $2
        `,
        [fullName, existingByPhone.rows[0].id]
      );
      return Number(existingByPhone.rows[0].id);
    }
  }

  const created = await client.query(
    `
      INSERT INTO online_customers (full_name, email, phone, active, created_at, updated_at)
      VALUES ($1, $2, $3, true, NOW(), NOW())
      RETURNING id
    `,
    [fullName, email, phone]
  );
  return Number(created.rows[0].id);
}

async function validateBranch(client, branchId) {
  const check = await client.query("SELECT id FROM branches WHERE id = $1 AND active = true LIMIT 1", [branchId]);
  return Boolean(check.rows[0]);
}

async function getResolvedItemsForOrder(client, branchId, items) {
  const resolvedItems = [];
  let subtotal = 0;

  for (const rawItem of items) {
    const productId = Number(rawItem?.productId);
    const quantity = Number(rawItem?.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Cada item requiere productId y quantity > 0");
    }

    const productResult = await client.query(
      `
        SELECT
          p.id,
          p.sku,
          p.name,
          p.image_url,
          p.price,
          p.stock,
          p.active,
          CASE
            WHEN apd.discount_type = 'percent' THEN GREATEST(0, ROUND((p.price - ((p.price * apd.discount_value) / 100.0))::numeric, 2))
            WHEN apd.discount_type = 'amount' THEN GREATEST(0, ROUND((p.price - apd.discount_value)::numeric, 2))
            ELSE p.price
          END AS discounted_price,
          apd.discount_type AS active_discount_type,
          apd.discount_value AS active_discount_value,
          apd.start_at AS active_discount_start_at,
          apd.end_at AS active_discount_end_at
        FROM products
        p
        LEFT JOIN LATERAL (
          SELECT discount_type, discount_value, start_at, end_at
          FROM product_discounts pd
          WHERE pd.product_id = p.id
            AND pd.branch_id = p.branch_id
            AND pd.active = true
            AND NOW() BETWEEN pd.start_at AND pd.end_at
          ORDER BY pd.start_at DESC, pd.id DESC
          LIMIT 1
        ) apd ON true
        WHERE p.id = $1 AND p.branch_id = $2
        LIMIT 1
      `,
      [productId, branchId]
    );
    const product = productResult.rows[0];
    if (!product || !product.active) {
      throw new Error(`Producto ${productId} no disponible en la sucursal`);
    }
    if (Number(product.stock) < quantity) {
      throw new Error(`Stock insuficiente para ${product.name}`);
    }

    const unitPrice = Number(product.discounted_price ?? product.price);
    const lineSubtotal = Number((unitPrice * quantity).toFixed(2));
    subtotal = Number((subtotal + lineSubtotal).toFixed(2));

    resolvedItems.push({
      productId: Number(product.id),
      productSku: product.sku,
      productName: product.name,
      productImageUrl: product.image_url || null,
      quantity,
      unitPrice,
      subtotal: lineSubtotal,
      hasActiveDiscount: Boolean(product.active_discount_type),
      activeDiscountType: product.active_discount_type || null,
      activeDiscountValue: product.active_discount_value !== null ? Number(product.active_discount_value || 0) : null,
      activeDiscountStartAt: product.active_discount_start_at || null,
      activeDiscountEndAt: product.active_discount_end_at || null,
    });
  }

  return { resolvedItems, subtotal };
}

router.post("/public-checkout", async (req, res) => {
  const branchId = Number(req.body?.branchId || 0);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const customer = req.body?.customer || {};
  const fulfillmentType = String(req.body?.fulfillmentType || "pickup");
  const paymentMethod = String(req.body?.paymentMethod || "cash_on_delivery");
  const paymentReference = req.body?.paymentReference ? String(req.body.paymentReference).trim() : null;
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;
  const deliveryAddress = req.body?.deliveryAddress ? String(req.body.deliveryAddress).trim() : null;
  const deliveryReference = req.body?.deliveryReference ? String(req.body.deliveryReference).trim() : null;
  const deliveryNotes = req.body?.deliveryNotes ? String(req.body.deliveryNotes).trim() : null;
  const shippingFee = Number(req.body?.shippingFee || 0);

  if (!branchId) return res.status(400).json({ message: "branchId invalido" });
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "items es requerido y debe contener productos" });
  }
  if (!FULFILLMENT_TYPES.includes(fulfillmentType)) {
    return res.status(400).json({ message: "fulfillmentType invalido" });
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ message: "paymentMethod invalido" });
  }
  if (fulfillmentType === "delivery" && !deliveryAddress) {
    return res.status(400).json({ message: "deliveryAddress es requerido para delivery" });
  }
  if (Number.isNaN(shippingFee) || shippingFee < 0) {
    return res.status(400).json({ message: "shippingFee invalido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const validBranch = await validateBranch(client, branchId);
    if (!validBranch) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Sucursal invalida" });
    }

    const customerId = await findOrCreateCustomer(client, customer);
    const { resolvedItems, subtotal } = await getResolvedItemsForOrder(client, branchId, items);

    const tax = 0;
    const discount = 0;
    const total = Number((subtotal + tax + shippingFee - discount).toFixed(2));

    const inserted = await client.query(
      `
        INSERT INTO online_orders (
          order_number,
          branch_id,
          customer_id,
          sales_channel,
          fulfillment_type,
          order_status,
          payment_method,
          payment_status,
          payment_reference,
          currency_code,
          subtotal,
          tax,
          discount,
          shipping_fee,
          total,
          customer_name_snapshot,
          customer_email_snapshot,
          customer_phone_snapshot,
          delivery_address,
          delivery_reference,
          delivery_notes,
          internal_notes,
          placed_at,
          created_at,
          updated_at
        )
        VALUES (
          'TMP-ORDER',
          $1,
          $2,
          'web',
          $3,
          'pending_payment',
          $4,
          'pending',
          $5,
          'GTQ',
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          NOW(),
          NOW(),
          NOW()
        )
        RETURNING id
      `,
      [
        branchId,
        customerId,
        fulfillmentType,
        paymentMethod,
        paymentReference,
        subtotal,
        tax,
        discount,
        shippingFee,
        total,
        customer?.fullName ? String(customer.fullName).trim() : null,
        customer?.email ? String(customer.email).trim() : null,
        customer?.phone ? String(customer.phone).trim() : null,
        deliveryAddress,
        deliveryReference,
        deliveryNotes,
        notes,
      ]
    );

    const orderId = Number(inserted.rows[0].id);
    const orderNumber = buildOrderNumberFromId(orderId);
    await client.query("UPDATE online_orders SET order_number = $1 WHERE id = $2", [orderNumber, orderId]);

    for (const item of resolvedItems) {
      await client.query(
        `
          INSERT INTO online_order_items (
            order_id,
            product_id,
            product_name,
            product_sku,
            product_image_url,
            quantity,
            unit_price,
            subtotal
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          orderId,
          item.productId,
          item.productName,
          item.productSku,
          item.productImageUrl,
          item.quantity,
          item.unitPrice,
          item.subtotal,
        ]
      );
    }

    await client.query(
      `
        INSERT INTO online_order_status_history (order_id, from_status, to_status, change_reason, created_at)
        VALUES ($1, NULL, 'pending_payment', $2, NOW())
      `,
      [orderId, "Pedido creado desde checkout publico"]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      order: {
        id: orderId,
        orderNumber,
        branchId,
        orderStatus: "pending_payment",
        paymentStatus: "pending",
        subtotal,
        shippingFee,
        total,
      },
      items: resolvedItems,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(400).json({ message: error?.message || "No se pudo crear el pedido online" });
  } finally {
    client.release();
  }
});

router.get("/public-catalog", async (req, res) => {
  const branchId = Number(req.query.branchId || 0);
  const search = String(req.query.search || "").trim();
  if (!branchId) return res.status(400).json({ message: "branchId invalido" });

  const branchCheck = await pool.query("SELECT id, name FROM branches WHERE id = $1 AND active = true LIMIT 1", [branchId]);
  if (!branchCheck.rows[0]) {
    return res.status(404).json({ message: "Sucursal no encontrada" });
  }

  const values = [branchId];
  let whereSearch = "";
  if (search) {
    values.push(`%${search}%`);
    whereSearch = `AND (p.name ILIKE $2 OR p.sku ILIKE $2 OR COALESCE(p.barcode, '') ILIKE $2)`;
  }

  const result = await pool.query(
    `
      SELECT
        p.id,
        p.name,
        p.brand,
        p.sku,
        p.barcode,
        p.price,
        CASE
          WHEN apd.discount_type = 'percent' THEN GREATEST(0, ROUND((p.price - ((p.price * apd.discount_value) / 100.0))::numeric, 2))
          WHEN apd.discount_type = 'amount' THEN GREATEST(0, ROUND((p.price - apd.discount_value)::numeric, 2))
          ELSE p.price
        END AS discounted_price,
        apd.discount_type AS active_discount_type,
        apd.discount_value AS active_discount_value,
        apd.start_at AS active_discount_start_at,
        apd.end_at AS active_discount_end_at,
        p.stock,
        p.image_url,
        c.name AS category
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN LATERAL (
        SELECT discount_type, discount_value, start_at, end_at
        FROM product_discounts pd
        WHERE pd.product_id = p.id
          AND pd.branch_id = p.branch_id
          AND pd.active = true
          AND NOW() BETWEEN pd.start_at AND pd.end_at
        ORDER BY pd.start_at DESC, pd.id DESC
        LIMIT 1
      ) apd ON true
      WHERE p.branch_id = $1
        AND p.active = true
        AND p.stock > 0
        ${whereSearch}
      ORDER BY p.name ASC
      LIMIT 500
    `,
    values
  );

  return res.json({
    branch: {
      id: Number(branchCheck.rows[0].id),
      name: branchCheck.rows[0].name,
    },
    products: result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      brand: row.brand || "",
      sku: row.sku,
      barcode: row.barcode || "",
      price: Number(row.price || 0),
      discountedPrice: Number(row.discounted_price || row.price || 0),
      hasActiveDiscount: Boolean(row.active_discount_type),
      activeDiscountType: row.active_discount_type || null,
      activeDiscountValue: row.active_discount_value !== null ? Number(row.active_discount_value || 0) : null,
      activeDiscountStartAt: row.active_discount_start_at || null,
      activeDiscountEndAt: row.active_discount_end_at || null,
      stock: Number(row.stock || 0),
      imageUrl: row.image_url || "",
      category: row.category || "Otros",
    })),
  });
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  const branchId = await resolveBranchForAuth(req, req.query.branchId);
  const search = String(req.query.search || "").trim();
  const orderStatus = String(req.query.orderStatus || "all");
  const paymentStatus = String(req.query.paymentStatus || "all");

  const values = [];
  const where = [];
  let idx = 1;

  if (search) {
    where.push(`(o.order_number ILIKE $${idx} OR o.customer_name_snapshot ILIKE $${idx} OR o.customer_phone_snapshot ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx += 1;
  }
  if (orderStatus !== "all") {
    where.push(`o.order_status = $${idx}`);
    values.push(orderStatus);
    idx += 1;
  }
  if (paymentStatus !== "all") {
    where.push(`o.payment_status = $${idx}`);
    values.push(paymentStatus);
    idx += 1;
  }

  where.unshift(`o.branch_id = $${idx}`);
  values.push(branchId);

  const result = await pool.query(
    `
      SELECT
        o.id,
        o.order_number,
        o.branch_id,
        o.customer_name_snapshot,
        o.customer_phone_snapshot,
        o.order_status,
        o.payment_method,
        o.payment_status,
        o.fulfillment_type,
        o.subtotal,
        o.shipping_fee,
        o.total,
        o.placed_at,
        o.created_at,
        o.updated_at,
        COALESCE(SUM(oi.quantity), 0) AS items_count
      FROM online_orders o
      LEFT JOIN online_order_items oi ON oi.order_id = o.id
      WHERE ${where.join(" AND ")}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 300
    `,
    values
  );

  return res.json(result.rows);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID invalido" });

  const branchId = await resolveBranchForAuth(req, req.query.branchId);
  const orderResult = await pool.query(
    `
      SELECT *
      FROM online_orders
      WHERE id = $1 AND branch_id = $2
      LIMIT 1
    `,
    [id, branchId]
  );
  const order = orderResult.rows[0];
  if (!order) return res.status(404).json({ message: "Pedido no encontrado" });

  const itemsResult = await pool.query(
    `
      SELECT
        id,
        product_id,
        product_name,
        product_sku,
        product_image_url,
        quantity,
        unit_price,
        subtotal,
        item_status
      FROM online_order_items
      WHERE order_id = $1
      ORDER BY id ASC
    `,
    [id]
  );

  const historyResult = await pool.query(
    `
      SELECT
        h.id,
        h.from_status,
        h.to_status,
        h.change_reason,
        h.created_at,
        u.full_name AS changed_by
      FROM online_order_status_history h
      LEFT JOIN users u ON u.id = h.changed_by_user_id
      WHERE h.order_id = $1
      ORDER BY h.created_at ASC
    `,
    [id]
  );

  return res.json({ ...order, items: itemsResult.rows, history: historyResult.rows });
});

router.patch("/:id/status", requireRole("superadmin", "admin", "manager"), async (req, res) => {
  const id = Number(req.params.id);
  const toStatus = String(req.body?.toStatus || "").trim();
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;
  if (!id) return res.status(400).json({ message: "ID invalido" });
  if (!ORDER_STATUSES.includes(toStatus)) {
    return res.status(400).json({ message: "Estado destino invalido" });
  }

  const branchId = await resolveBranchForAuth(req, req.body?.branchId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `
        SELECT
          id,
          order_number,
          order_status,
          payment_status,
          payment_method,
          branch_id,
          linked_sale_id,
          created_by_user_id,
          subtotal,
          tax,
          discount,
          total,
          created_at,
          placed_at,
          paid_at
        FROM online_orders
        WHERE id = $1 AND branch_id = $2
        FOR UPDATE
      `,
      [id, branchId]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const fromStatus = String(order.order_status);
    const allowed = STATUS_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Transicion no permitida: ${fromStatus} -> ${toStatus}` });
    }

    const shouldMarkAsPaid = fromStatus !== "paid" && toStatus === "paid";
    if (shouldMarkAsPaid) {
      const itemsResult = await client.query(
        `
          SELECT product_id, quantity
          FROM online_order_items
          WHERE order_id = $1 AND item_status = 'active'
          FOR UPDATE
        `,
        [id]
      );
      for (const item of itemsResult.rows) {
        if (!item.product_id) continue;
        const stockResult = await client.query(
          "SELECT id, name, stock FROM products WHERE id = $1 AND branch_id = $2 FOR UPDATE",
          [item.product_id, branchId]
        );
        const product = stockResult.rows[0];
        if (!product) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: `Producto ${item.product_id} ya no existe en sucursal` });
        }
        if (Number(product.stock) < Number(item.quantity)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: `Stock insuficiente para ${product.name}` });
        }
      }
      for (const item of itemsResult.rows) {
        if (!item.product_id) continue;
        await client.query("UPDATE products SET stock = stock - $1 WHERE id = $2", [Number(item.quantity), item.product_id]);
      }
    }

    let paymentStatus = order.payment_status;
    if (toStatus === "paid") paymentStatus = "paid";
    if (toStatus === "cancelled") paymentStatus = paymentStatus === "paid" ? "refunded" : "cancelled";
    if (toStatus === "refunded") paymentStatus = "refunded";
    if (!PAYMENT_STATUSES.includes(paymentStatus)) paymentStatus = "pending";

    const updated = await client.query(
      `
        UPDATE online_orders
        SET
          order_status = $1,
          payment_status = $2,
          updated_by_user_id = $3,
          paid_at = CASE WHEN $1 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
          completed_at = CASE WHEN $1 = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
          cancelled_at = CASE WHEN $1 = 'cancelled' AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END,
          updated_at = NOW()
        WHERE id = $4
        RETURNING id, order_number, order_status, payment_status, paid_at, completed_at, cancelled_at, updated_at, linked_sale_id
      `,
      [toStatus, paymentStatus, req.user.sub, id]
    );

    let linkedSaleId = Number(order.linked_sale_id || 0) || null;
    if (toStatus === "completed") {
      linkedSaleId = await createSaleFromOnlineOrder(client, order, req.user.sub);
      await client.query(
        "UPDATE online_orders SET linked_sale_id = $1, updated_at = NOW() WHERE id = $2",
        [linkedSaleId, id]
      );
    }

    await client.query(
      `
        INSERT INTO online_order_status_history (order_id, from_status, to_status, changed_by_user_id, change_reason, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [id, fromStatus, toStatus, req.user.sub, reason]
    );

    await client.query("COMMIT");
    return res.json({
      order: {
        ...updated.rows[0],
        linked_sale_id: linkedSaleId || updated.rows[0]?.linked_sale_id || null,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: error?.message || "No se pudo actualizar estado del pedido" });
  } finally {
    client.release();
  }
});

export default router;
