import { useEffect, useMemo, useState } from "react";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../components/ui/dialog";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";

interface BranchRow {
  id: number;
  name: string;
  active: boolean;
}

interface OrderRow {
  id: number;
  order_number: string;
  branch_id: number;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  order_status: string;
  payment_method: string;
  payment_status: string;
  fulfillment_type: string;
  total: number;
  created_at: string;
  items_count: number;
}

interface OrderDetail extends OrderRow {
  items: Array<{
    id: number;
    product_id: number | null;
    product_name: string;
    product_sku: string;
    product_image_url: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  history: Array<{
    id: number;
    from_status: string | null;
    to_status: string;
    change_reason: string | null;
    changed_by: string | null;
    created_at: string;
  }>;
}

const STATUS_OPTIONS = [
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

export default function OnlineOrders() {
  const { token, user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState(String(user?.branchId || 1));
  const [multiBranchEnabled, setMultiBranchEnabled] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [statusToApply, setStatusToApply] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusReason, setStatusReason] = useState("");

  const canManage = ["superadmin", "admin", "manager"].includes(user?.role || "");
  const canSelectBranch = Boolean(user?.role === "superadmin" && multiBranchEnabled);

  const loadSystem = async () => {
    if (!token) return;
    try {
      const system = await apiRequest("/settings/system", { token });
      const enabled = Boolean(system?.multiBranchEnabled);
      setMultiBranchEnabled(enabled);
      if (enabled && user?.role === "superadmin") {
        const data = await apiRequest("/branches", { token });
        setBranches((Array.isArray(data) ? data : []).filter((b: BranchRow) => b.active));
      } else {
        setBranches([]);
      }
    } catch {
      setMultiBranchEnabled(false);
      setBranches([]);
    }
  };

  const loadOrders = async () => {
    if (!token || !canManage) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (orderStatusFilter !== "all") params.set("orderStatus", orderStatusFilter);
      if (paymentStatusFilter !== "all") params.set("paymentStatus", paymentStatusFilter);
      if (canSelectBranch) params.set("branchId", selectedBranchId);
      const data = await apiRequest(`/online-orders?${params.toString()}`, { token });
      setOrders(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron cargar pedidos online");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (orderId: number) => {
    if (!token) return;
    try {
      const query = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      const detail = await apiRequest(`/online-orders/${orderId}${query}`, { token });
      setSelectedOrder(detail);
      setStatusToApply(detail?.order_status || "");
      setStatusReason("");
      setShowDetail(true);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar detalle");
    }
  };

  const applyStatus = async () => {
    if (!token || !selectedOrder || !statusToApply || statusToApply === selectedOrder.order_status) return;
    setUpdatingStatus(true);
    try {
      await apiRequest(`/online-orders/${selectedOrder.id}/status`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          toStatus: statusToApply,
          reason: statusReason || null,
          branchId: canSelectBranch ? Number(selectedBranchId) : undefined,
        }),
      });
      toast.success("Estado actualizado");
      await openDetail(selectedOrder.id);
      await loadOrders();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar estado");
    } finally {
      setUpdatingStatus(false);
    }
  };

  useEffect(() => {
    loadSystem();
  }, [token, user?.role]);

  useEffect(() => {
    loadOrders();
  }, [token, search, orderStatusFilter, paymentStatusFilter, selectedBranchId, multiBranchEnabled]);

  const summary = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.order_status === "pending_payment").length;
    const paid = orders.filter((o) => o.payment_status === "paid").length;
    const amount = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    return { total, pending, paid, amount };
  }, [orders]);

  if (!canManage) {
    return (
      <div className="p-6">
        <Card className="section-card p-6">
          <p className="text-sm text-gray-600">No tienes permisos para gestionar pedidos online.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <div className="themed-page-header border-b px-4 py-4 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Pedidos Online</h1>
        <p className="themed-page-header-muted text-sm">Monitoreo y gestion de pedidos web/app por sucursal</p>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Card className="section-card p-4">
            <p className="text-sm text-gray-600">Total pedidos</p>
            <p className="text-2xl font-bold">{summary.total}</p>
          </Card>
          <Card className="section-card p-4">
            <p className="text-sm text-gray-600">Pendientes pago</p>
            <p className="text-2xl font-bold text-amber-600">{summary.pending}</p>
          </Card>
          <Card className="section-card p-4">
            <p className="text-sm text-gray-600">Pagados</p>
            <p className="text-2xl font-bold text-green-600">{summary.paid}</p>
          </Card>
          <Card className="section-card p-4">
            <p className="text-sm text-gray-600">Monto total</p>
            <p className="text-2xl font-bold text-blue-700">Q {summary.amount.toFixed(2)}</p>
          </Card>
        </div>

        <Card className="section-card p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por numero, cliente o telefono"
            />
            <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Estado pedido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estado pedido: todos</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Estado pago" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Estado pago: todos</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="paid">paid</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
                <SelectItem value="refunded">refunded</SelectItem>
                <SelectItem value="cancelled">cancelled</SelectItem>
              </SelectContent>
            </Select>
            {canSelectBranch ? (
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger><SelectValue placeholder="Sucursal" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Button variant="outline" onClick={loadOrders} disabled={loading}>Actualizar</Button>
            )}
          </div>
        </Card>

        <Card className="section-card p-4">
          {loading ? (
            <p className="text-sm text-gray-600">Cargando pedidos...</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-gray-600">No hay pedidos con esos filtros.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Card key={order.id} className="section-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-semibold">{order.order_number}</p>
                      <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString("es-GT")}</p>
                      <p className="text-sm text-gray-700">
                        Cliente: {order.customer_name_snapshot || "Consumidor final"} · {order.customer_phone_snapshot || "Sin telefono"}
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <Badge variant="secondary">{order.order_status}</Badge>
                      <p className="text-xs text-gray-600">Pago: {order.payment_status}</p>
                      <p className="font-bold text-blue-700">Q {Number(order.total || 0).toFixed(2)}</p>
                      <Button size="sm" variant="outline" onClick={() => openDetail(order.id)}>Ver detalle</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle pedido online</DialogTitle>
            <DialogDescription>Gestiona estado, revisa items e historial del pedido.</DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              <Card className="section-card p-3">
                <p className="font-semibold">{selectedOrder.order_number}</p>
                <p className="text-sm text-gray-600">
                  Cliente: {selectedOrder.customer_name_snapshot || "Consumidor final"} · {selectedOrder.customer_phone_snapshot || "Sin telefono"}
                </p>
              </Card>

              <div className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <Card key={item.id} className="section-card p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold">{item.product_name}</p>
                        <p className="text-xs text-gray-500">{item.product_sku}</p>
                        <p className="text-xs text-gray-600">{item.quantity} x Q {Number(item.unit_price).toFixed(2)}</p>
                      </div>
                      <p className="font-semibold">Q {Number(item.subtotal).toFixed(2)}</p>
                    </div>
                  </Card>
                ))}
              </div>

              <Card className="section-card p-3 space-y-2">
                <p className="text-sm font-medium">Cambio de estado</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Select value={statusToApply} onValueChange={setStatusToApply}>
                    <SelectTrigger><SelectValue placeholder="Nuevo estado" /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Motivo (opcional)"
                  />
                </div>
              </Card>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDetail(false)}>Cerrar</Button>
            <Button onClick={applyStatus} disabled={!selectedOrder || updatingStatus || !statusToApply}>
              {updatingStatus ? "Actualizando..." : "Aplicar estado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

