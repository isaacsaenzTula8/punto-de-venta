import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  Eye,
  Download,
  Calendar,
  DollarSign,
  CreditCard,
  Smartphone,
  Receipt,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { ScrollArea } from "../components/ui/scroll-area";
import { formatCurrency } from "../utils/currency";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";

interface SaleRow {
  id: number;
  sale_number: string;
  sale_date: string;
  subtotal?: number;
  discount?: number;
  total: number;
  payment_method: "cash" | "card" | "transfer" | "mixed" | "credit";
  payment_status: "completed" | "pending" | "cancelled" | "refunded";
  cashier: string;
  taken_by?: string | null;
  charged_by?: string | null;
  items_count: number;
}

interface SaleDetailItem {
  sale_item_id?: number;
  product_id: number | null;
  product_name: string;
  product_sku: string;
  quantity: number;
  returned_quantity?: number;
  refundable_quantity?: number;
  unit_price: number;
  subtotal: number;
}

interface SaleDetail {
  id: number;
  sale_number: string;
  sale_date: string;
  subtotal?: number;
  discount?: number;
  total: number;
  payment_method: "cash" | "card" | "transfer" | "mixed" | "credit";
  payment_status: "completed" | "pending" | "cancelled" | "refunded";
  cashier: string;
  taken_by?: string | null;
  charged_by?: string | null;
  items: SaleDetailItem[];
}

function toIsoDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getTodayIso() {
  return toIsoDate(new Date());
}

function getDaysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toIsoDate(d);
}

function getStartOfMonthIso(baseDate: Date = new Date()) {
  return toIsoDate(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
}

function getEndOfMonthIso(baseDate: Date = new Date()) {
  return toIsoDate(new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0));
}

export default function Sales() {
  const { token } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(getDaysAgoIso(6));
  const [toDate, setToDate] = useState<string>(getTodayIso());
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "transfer" | "mixed" | "credit">("cash");
  const [refundQtyByItem, setRefundQtyByItem] = useState<Record<number, number>>({});

  const fetchSales = async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (filterMethod !== "all") params.set("paymentMethod", filterMethod);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const data = await apiRequest(`/sales?${params.toString()}`, { token });
      setSales(data);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar historial de ventas");
    }
  };

  useEffect(() => {
    fetchSales();
  }, [token, searchQuery, filterMethod, fromDate, toDate]);

  const viewDetail = async (saleId: number) => {
    if (!token) return;
    try {
      const data = await apiRequest(`/sales/${saleId}`, { token });
      setSelectedSale(data);
      setShowDetailDialog(true);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar detalle de venta");
    }
  };

  const openRefundDialog = async (saleId: number) => {
    if (!token) return;
    try {
      const data = await apiRequest(`/sales/${saleId}`, { token });
      setSelectedSale(data);
      setRefundMethod("cash");
      setRefundQtyByItem({});
      setShowRefundDialog(true);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar ticket para devolucion");
    }
  };

  const setRefundQuantity = (saleItemId: number, value: number) => {
    setRefundQtyByItem((prev) => ({
      ...prev,
      [saleItemId]: Math.max(0, Math.floor(value || 0)),
    }));
  };

  const processRefund = async (returnAll: boolean) => {
    if (!token || !selectedSale) return;

    try {
      const items = returnAll
        ? []
        : selectedSale.items
            .map((item) => ({
              saleItemId: Number(item.sale_item_id),
              quantity: Number(refundQtyByItem[Number(item.sale_item_id)] || 0),
            }))
            .filter((item) => item.saleItemId && item.quantity > 0);

      await apiRequest(`/sales/${selectedSale.id}/refund`, {
        method: "POST",
        token,
        body: JSON.stringify({
          refundMethod,
          returnAll,
          items,
        }),
      });

      toast.success(returnAll ? "Devolucion total registrada" : "Devolucion parcial registrada");
      setShowRefundDialog(false);
      fetchSales();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo procesar la devolucion");
    }
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case "cash":
        return <DollarSign className="h-4 w-4" />;
      case "card":
        return <CreditCard className="h-4 w-4" />;
      case "transfer":
        return <Smartphone className="h-4 w-4" />;
      case "credit":
        return <CreditCard className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getPaymentName = (method: string) => {
    switch (method) {
      case "cash":
        return "Efectivo";
      case "card":
        return "Tarjeta";
      case "transfer":
        return "Transferencia";
      case "mixed":
        return "Mixto";
      case "credit":
        return "Crédito";
      default:
        return method;
    }
  };

  const totalSales = useMemo(() => sales.reduce((sum, s) => sum + Number(s.total), 0), [sales]);
  const totalDiscounts = useMemo(() => sales.reduce((sum, s) => sum + Number(s.discount || 0), 0), [sales]);
  const todaySales = useMemo(
    () =>
      sales.filter((s) => {
        const today = new Date();
        const saleDate = new Date(s.sale_date);
        return today.toDateString() === saleDate.toDateString();
      }).length,
    [sales]
  );

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-4 py-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Historial de Ventas</h1>
            <p className="text-sm text-gray-500">Consulta todas las transacciones realizadas</p>
            <p className="text-xs text-amber-700 mt-1">Los tickets pendientes se cobran desde Punto de Venta, pestaña Tickets.</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por ID de venta o cajero..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>

          <Select value={filterMethod} onValueChange={setFilterMethod}>
            <SelectTrigger className="h-11 w-full md:w-48">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los metodos</SelectItem>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="credit">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[200px_200px_auto]">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const today = getTodayIso();
                setFromDate(today);
                setToDate(today);
              }}
            >
              Hoy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const now = new Date();
                setFromDate(getStartOfMonthIso(now));
                setToDate(getEndOfMonthIso(now));
              }}
            >
              Este mes
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const now = new Date();
                const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                setFromDate(getStartOfMonthIso(previousMonth));
                setToDate(getEndOfMonthIso(previousMonth));
              }}
            >
              Mes pasado
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFromDate(getDaysAgoIso(6));
                setToDate(getTodayIso());
              }}
            >
              Ultimos 7 dias
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
            >
              Todo
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          <Card className="section-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Ventas</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{sales.length}</p>
              </div>
              <Receipt className="h-12 w-12 text-blue-600" />
            </div>
          </Card>

          <Card className="section-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Ventas Hoy</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{todaySales}</p>
              </div>
              <Calendar className="h-12 w-12 text-green-600" />
            </div>
          </Card>

          <Card className="section-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Monto Total</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{formatCurrency(totalSales)}</p>
              </div>
              <DollarSign className="h-12 w-12 text-purple-600" />
            </div>
          </Card>

          <Card className="section-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Descuentos</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{formatCurrency(totalDiscounts)}</p>
              </div>
              <Receipt className="h-12 w-12 text-orange-600" />
            </div>
          </Card>
        </div>

        <Card className="section-card">
          <div className="space-y-3 p-3 md:hidden">
            {sales.map((sale) => (
              <Card key={sale.id} className="section-card p-3">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold">{sale.sale_number}</p>
                      <p className="text-xs text-gray-500">{new Date(sale.sale_date).toLocaleString("es-GT")}</p>
                    </div>
                    <Badge
                      variant="default"
                      className={
                        sale.payment_status === "completed"
                          ? "bg-green-600"
                          : sale.payment_status === "pending"
                          ? "bg-orange-600"
                          : "bg-red-600"
                      }
                    >
                      {sale.payment_status === "completed"
                        ? "Completada"
                        : sale.payment_status === "pending"
                        ? "Pendiente"
                        : sale.payment_status === "refunded"
                        ? "Reembolsada"
                        : "Cancelada"}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700">Cajero: {sale.cashier}</p>
                  <div className="text-xs text-gray-600">
                    <p>Subtotal: {formatCurrency(Number(sale.subtotal || sale.total || 0))}</p>
                    <p>Descuento: {formatCurrency(Number(sale.discount || 0))}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      {getPaymentIcon(sale.payment_method)}
                      <span>{getPaymentName(sale.payment_method)}</span>
                    </div>
                    <span className="font-bold text-green-600">{formatCurrency(Number(sale.total))}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {sale.payment_status === "completed" && (
                      <Button variant="outline" size="sm" onClick={() => openRefundDialog(sale.id)}>
                        Devolver
                      </Button>
                    )}
                    {sale.payment_status === "pending" && (
                      <Badge variant="secondary" className="text-xs">
                        Cobrar en Punto de Venta
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => viewDetail(sale.id)}>
                      <Eye className="mr-1 h-4 w-4" />
                      Ver
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Venta</TableHead>
                  <TableHead>Fecha y Hora</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead className="text-center">Articulos</TableHead>
                  <TableHead>Metodo de Pago</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Descuento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-mono font-semibold text-sm">{sale.sale_number}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{new Date(sale.sale_date).toLocaleDateString("es-GT")}</p>
                        <p className="text-gray-500">{new Date(sale.sale_date).toLocaleTimeString("es-GT")}</p>
                      </div>
                    </TableCell>
                    <TableCell>{sale.cashier}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{sale.items_count} items</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPaymentIcon(sale.payment_method)}
                        <span>{getPaymentName(sale.payment_method)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(sale.subtotal || sale.total || 0))}</TableCell>
                    <TableCell className="text-right text-orange-700">{formatCurrency(Number(sale.discount || 0))}</TableCell>
                    <TableCell className="text-right font-bold text-green-600">{formatCurrency(Number(sale.total))}</TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="default"
                        className={
                          sale.payment_status === "completed"
                            ? "bg-green-600"
                            : sale.payment_status === "pending"
                            ? "bg-orange-600"
                            : "bg-red-600"
                        }
                      >
                        {sale.payment_status === "completed"
                          ? "Completada"
                          : sale.payment_status === "pending"
                          ? "Pendiente"
                          : sale.payment_status === "refunded"
                          ? "Reembolsada"
                          : "Cancelada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {sale.payment_status === "completed" && (
                          <Button variant="outline" size="sm" onClick={() => openRefundDialog(sale.id)}>
                            Devolver
                          </Button>
                        )}
                        {sale.payment_status === "pending" && (
                          <Badge variant="secondary">Cobrar en Punto de Venta</Badge>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => viewDetail(sale.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {sales.length === 0 && (
            <div className="text-center py-12">
              <Receipt className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No se encontraron ventas</p>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-gray-600">ID Venta</p>
                  <p className="font-mono font-semibold">{selectedSale.sale_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Fecha y Hora</p>
                  <p className="font-semibold">{new Date(selectedSale.sale_date).toLocaleString("es-GT")}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cajero</p>
                  <p className="font-semibold">{selectedSale.cashier}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Tomo pedido</p>
                  <p className="font-semibold">{selectedSale.taken_by || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Cobro</p>
                  <p className="font-semibold">{selectedSale.charged_by || "Pendiente"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Metodo de Pago</p>
                  <div className="flex items-center gap-2 font-semibold">
                    {getPaymentIcon(selectedSale.payment_method)}
                    {getPaymentName(selectedSale.payment_method)}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Productos</h3>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {selectedSale.items.map((item, index) => (
                      <Card key={index} className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">{item.product_name}</p>
                            <p className="text-sm text-gray-500">{item.product_sku}</p>
                            <p className="text-sm text-gray-600 mt-1">
                              {formatCurrency(Number(item.unit_price))} x {item.quantity}
                            </p>
                          </div>
                          <p className="font-bold text-blue-600">{formatCurrency(Number(item.subtotal))}</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-semibold">{formatCurrency(Number(selectedSale.subtotal || selectedSale.total || 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Descuento:</span>
                  <span className="font-semibold text-orange-700">{formatCurrency(Number(selectedSale.discount || 0))}</span>
                </div>
                <div className="flex justify-between text-lg border-t pt-2">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(Number(selectedSale.total))}</span>
                </div>
              </div>

              <Button className="w-full" variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Descargar Ticket
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Procesar Devolucion</DialogTitle>
          </DialogHeader>

          {selectedSale && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-gray-50 p-4 text-sm">
                <p className="font-semibold">{selectedSale.sale_number}</p>
                <p className="text-gray-600">
                  Cajero: {selectedSale.cashier} · {new Date(selectedSale.sale_date).toLocaleString("es-GT")}
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Metodo de devolucion</p>
                <Select value={refundMethod} onValueChange={(value) => setRefundMethod(value as typeof refundMethod)}>
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="mixed">Mixto</SelectItem>
                    <SelectItem value="credit">Credito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {selectedSale.items.map((item) => {
                  const saleItemId = Number(item.sale_item_id || 0);
                  const refundable = Number(item.refundable_quantity ?? item.quantity);
                  return (
                    <Card key={`${saleItemId}-${item.product_sku}`} className="p-3">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <p className="font-semibold">{item.product_name}</p>
                          <p className="text-xs text-gray-500">{item.product_sku}</p>
                          <p className="text-xs text-gray-500">
                            Vendido: {item.quantity} · Devuelto: {item.returned_quantity || 0} · Disponible para devolver: {refundable}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min="0"
                          max={String(Math.max(0, refundable))}
                          value={String(refundQtyByItem[saleItemId] || 0)}
                          onChange={(e) => {
                            const requested = Number(e.target.value || 0);
                            setRefundQuantity(saleItemId, Math.min(Math.max(0, requested), Math.max(0, refundable)));
                          }}
                          className="w-28"
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => processRefund(false)}>
                  Devolucion Parcial
                </Button>
                <Button variant="destructive" onClick={() => processRefund(true)}>
                  Devolucion Total
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
