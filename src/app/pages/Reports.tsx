import { useEffect, useMemo, useState } from "react";
import { Calendar, Download, TrendingUp, Wallet, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Input } from "../components/ui/input";
import { formatCurrency } from "../utils/currency";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";
import { downloadCsv, printHtmlAsPdf } from "../utils/export";

type Period = "daily" | "weekly" | "monthly" | "range";

interface CutoffSummary {
  totalSales: number;
  totalTransactions: number;
  averageTicket: number;
  totalCost: number;
  grossProfit: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  mixedSales: number;
  creditSales: number;
  otherSales: number;
  openingCash: number;
  cashEntries: number;
  cashExits: number;
  cashRefunds: number;
  expectedCash: number;
  declaredClosingCash: number;
  cashDifference: number;
}

interface DepartmentRow {
  departmentName: string;
  unitsSold: number;
  totalSales: number;
  totalCost: number;
  grossProfit: number;
}

interface DayRow {
  day: string;
  totalTransactions: number;
  totalSales: number;
  cashSales: number;
  otherSales: number;
  totalCost: number;
  grossProfit: number;
}

interface CutoffResponse {
  period: Period;
  from: string;
  to: string;
  summary: CutoffSummary;
  salesByDepartment: DepartmentRow[];
  salesByDay: DayRow[];
}

interface ExpirationSummary {
  expiredUnits: number;
  due30Units: number;
  due60Units: number;
  due90Units: number;
}

interface ExpirationItem {
  id: number;
  batchCode: string;
  expirationDate: string;
  quantityCurrent: number;
  product: {
    id: string;
    name: string;
    sku: string;
    brand?: string;
  };
}

interface CashMovementRow {
  id: number;
  movementType: "in" | "out";
  amount: number;
  reason: string;
  notes: string;
  createdAt: string;
  createdBy: string;
}

const defaultSummary: CutoffSummary = {
  totalSales: 0,
  totalTransactions: 0,
  averageTicket: 0,
  totalCost: 0,
  grossProfit: 0,
  cashSales: 0,
  cardSales: 0,
  transferSales: 0,
  mixedSales: 0,
  creditSales: 0,
  otherSales: 0,
  openingCash: 0,
  cashEntries: 0,
  cashExits: 0,
  cashRefunds: 0,
  expectedCash: 0,
  declaredClosingCash: 0,
  cashDifference: 0,
};

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Reports() {
  const { token, businessSettings } = useAuth();
  const expirationsEnabled = Boolean(businessSettings?.enabledModules?.includes("expirations"));
  const [period, setPeriod] = useState<Period>("daily");
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [loading, setLoading] = useState(false);
  const [cutoff, setCutoff] = useState<CutoffResponse>({
    period: "daily",
    from: todayIso(),
    to: todayIso(),
    summary: defaultSummary,
    salesByDepartment: [],
    salesByDay: [],
  });

  const [movements, setMovements] = useState<CashMovementRow[]>([]);
  const [expirationSummary, setExpirationSummary] = useState<ExpirationSummary>({
    expiredUnits: 0,
    due30Units: 0,
    due60Units: 0,
    due90Units: 0,
  });
  const [expirationItems, setExpirationItems] = useState<ExpirationItem[]>([]);

  const loadCutoff = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const query =
        period === "range"
          ? `/stats/cutoff?period=range&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`
          : `/stats/cutoff?period=${period}`;
      const data = await apiRequest(query, { token });
      setCutoff(data);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar el corte");
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    if (!token) return;
    try {
      const data = await apiRequest(
        `/cash/movements?from=${encodeURIComponent(cutoff.from)}&to=${encodeURIComponent(cutoff.to)}`,
        { token }
      );
      setMovements(Array.isArray(data) ? data : []);
    } catch (error: any) {
      if (String(error?.message || "").includes("Falta migracion")) {
        toast.warning("Para entradas/salidas ejecuta la migracion 015_cash_movements_and_cutoff_support.sql");
      }
      setMovements([]);
    }
  };

  const loadExpirations = async () => {
    if (!token) return;
    try {
      const data = await apiRequest("/stats/expirations?days=90&limit=40", { token });
      setExpirationSummary(data?.summary || { expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 });
      setExpirationItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setExpirationSummary({ expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 });
      setExpirationItems([]);
    }
  };

  useEffect(() => {
    loadCutoff();
  }, [token, period]);

  useEffect(() => {
    if (period !== "range") return;
    loadCutoff();
  }, [token, period, fromDate, toDate]);

  useEffect(() => {
    if (!token) return;
    loadMovements();
  }, [token, cutoff.from, cutoff.to]);

  useEffect(() => {
    if (!token) return;
    if (expirationsEnabled) {
      loadExpirations();
    } else {
      setExpirationSummary({ expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 });
      setExpirationItems([]);
    }
  }, [token, expirationsEnabled]);

  const summaryCards = useMemo(
    () => [
      { title: "Ventas Totales", value: formatCurrency(cutoff.summary.totalSales), icon: TrendingUp, color: "text-blue-600" },
      { title: "Ganancia Bruta", value: formatCurrency(cutoff.summary.grossProfit), icon: TrendingUp, color: "text-green-600" },
      { title: "Dinero en Caja (estimado)", value: formatCurrency(cutoff.summary.expectedCash), icon: Wallet, color: "text-emerald-600" },
      { title: "Ticket Promedio", value: formatCurrency(cutoff.summary.averageTicket), icon: Calendar, color: "text-indigo-600" },
    ],
    [cutoff.summary]
  );

  const exportCutoffCsv = () => {
    const rows: Array<Array<unknown>> = [];
    rows.push(["CORTE", cutoff.period.toUpperCase()]);
    rows.push(["DESDE", cutoff.from, "HASTA", cutoff.to]);
    rows.push([]);
    rows.push(["RESUMEN"]);
    rows.push(["Ventas Totales", cutoff.summary.totalSales]);
    rows.push(["Transacciones", cutoff.summary.totalTransactions]);
    rows.push(["Ticket Promedio", cutoff.summary.averageTicket]);
    rows.push(["Costo Total", cutoff.summary.totalCost]);
    rows.push(["Ganancia Bruta", cutoff.summary.grossProfit]);
    rows.push(["Contado", cutoff.summary.cashSales]);
    rows.push(["Otros Metodos", cutoff.summary.otherSales]);
    rows.push(["Entradas Efectivo", cutoff.summary.cashEntries]);
    rows.push(["Salidas Efectivo", cutoff.summary.cashExits]);
    rows.push(["Devoluciones Efectivo", cutoff.summary.cashRefunds]);
    rows.push(["Caja Esperada", cutoff.summary.expectedCash]);
    rows.push(["Cierre Declarado", cutoff.summary.declaredClosingCash]);
    rows.push(["Diferencia", cutoff.summary.cashDifference]);
    rows.push([]);
    rows.push(["VENTAS POR DEPARTAMENTO"]);
    rows.push(["Departamento", "Unidades", "Ventas", "Costo", "Ganancia"]);
    cutoff.salesByDepartment.forEach((d) => rows.push([d.departmentName, d.unitsSold, d.totalSales, d.totalCost, d.grossProfit]));
    rows.push([]);
    rows.push(["DETALLE POR FECHA"]);
    rows.push(["Fecha", "Transacciones", "Ventas", "Contado", "Otros", "Costo", "Ganancia"]);
    cutoff.salesByDay.forEach((d) => rows.push([String(d.day).slice(0, 10), d.totalTransactions, d.totalSales, d.cashSales, d.otherSales, d.totalCost, d.grossProfit]));
    rows.push([]);
    rows.push(["MOVIMIENTOS DE CAJA"]);
    rows.push(["Fecha", "Tipo", "Motivo", "Usuario", "Monto"]);
    movements.forEach((m) => rows.push([new Date(m.createdAt).toLocaleString("es-GT"), m.movementType === "in" ? "Entrada" : "Salida", m.reason, m.createdBy, m.amount]));
    if (expirationsEnabled) {
      rows.push([]);
      rows.push(["CADUCIDADES"]);
      rows.push(["Vencidos", expirationSummary.expiredUnits]);
      rows.push(["Vence <=30 dias", expirationSummary.due30Units]);
      rows.push(["Vence <=60 dias", expirationSummary.due60Units]);
      rows.push(["Vence <=90 dias", expirationSummary.due90Units]);
      rows.push([]);
      rows.push(["DETALLE LOTES PROXIMOS"]);
      rows.push(["Producto", "SKU", "Lote", "Caducidad", "Stock"]);
      expirationItems.forEach((item) =>
        rows.push([item.product.name, item.product.sku || "", item.batchCode, String(item.expirationDate).slice(0, 10), item.quantityCurrent])
      );
    }
    downloadCsv(`corte_${cutoff.from}_${cutoff.to}.csv`, rows);
    toast.success("Corte exportado a Excel (CSV)");
  };

  const exportCutoffPdf = () => {
    const summaryRows = `
      <tr><td>Ventas Totales</td><td>${formatCurrency(cutoff.summary.totalSales)}</td></tr>
      <tr><td>Transacciones</td><td>${cutoff.summary.totalTransactions}</td></tr>
      <tr><td>Ticket Promedio</td><td>${formatCurrency(cutoff.summary.averageTicket)}</td></tr>
      <tr><td>Costo Total</td><td>${formatCurrency(cutoff.summary.totalCost)}</td></tr>
      <tr><td>Ganancia Bruta</td><td>${formatCurrency(cutoff.summary.grossProfit)}</td></tr>
      <tr><td>Caja Esperada</td><td>${formatCurrency(cutoff.summary.expectedCash)}</td></tr>
      <tr><td>Cierre Declarado</td><td>${formatCurrency(cutoff.summary.declaredClosingCash)}</td></tr>
      <tr><td>Diferencia</td><td>${formatCurrency(cutoff.summary.cashDifference)}</td></tr>
    `;
    const deptRows = cutoff.salesByDepartment
      .map(
        (d) =>
          `<tr><td>${d.departmentName}</td><td>${d.unitsSold}</td><td>${formatCurrency(d.totalSales)}</td><td>${formatCurrency(
            d.totalCost
          )}</td><td>${formatCurrency(d.grossProfit)}</td></tr>`
      )
      .join("");
    const dayRows = cutoff.salesByDay
      .map(
        (d) =>
          `<tr><td>${String(d.day).slice(0, 10)}</td><td>${d.totalTransactions}</td><td>${formatCurrency(d.totalSales)}</td><td>${formatCurrency(
            d.cashSales
          )}</td><td>${formatCurrency(d.otherSales)}</td><td>${formatCurrency(d.totalCost)}</td><td>${formatCurrency(d.grossProfit)}</td></tr>`
      )
      .join("");
    const movementRows = movements
      .map(
        (m) =>
          `<tr><td>${new Date(m.createdAt).toLocaleString("es-GT")}</td><td>${m.movementType === "in" ? "Entrada" : "Salida"}</td><td>${
            m.reason
          }</td><td>${m.createdBy}</td><td>${formatCurrency(m.amount)}</td></tr>`
      )
      .join("");
    const expirationRows = expirationItems
      .map(
        (item) =>
          `<tr><td>${item.product.name}</td><td>${item.product.sku || "-"}</td><td>${item.batchCode}</td><td>${String(item.expirationDate).slice(
            0,
            10
          )}</td><td>${item.quantityCurrent}</td></tr>`
      )
      .join("");

    const ok = printHtmlAsPdf(
      `Corte ${cutoff.from} - ${cutoff.to}`,
      `
      <h1>Corte ${cutoff.period.toUpperCase()}</h1>
      <p class="meta">Desde ${cutoff.from} hasta ${cutoff.to}</p>
      <h2>Resumen</h2>
      <table><tbody>${summaryRows}</tbody></table>
      <h2>Ventas por Departamento</h2>
      <table><thead><tr><th>Departamento</th><th>Unidades</th><th>Ventas</th><th>Costo</th><th>Ganancia</th></tr></thead><tbody>${deptRows}</tbody></table>
      <h2>Detalle por Fecha</h2>
      <table><thead><tr><th>Fecha</th><th>Trans.</th><th>Ventas</th><th>Contado</th><th>Otros</th><th>Costo</th><th>Ganancia</th></tr></thead><tbody>${dayRows}</tbody></table>
      <h2>Movimientos de Caja</h2>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Usuario</th><th>Monto</th></tr></thead><tbody>${movementRows}</tbody></table>
      ${
        expirationsEnabled
          ? `<h2>Caducidades</h2>
      <table><tbody>
        <tr><td>Vencidos</td><td>${expirationSummary.expiredUnits}</td></tr>
        <tr><td>Vence <=30 dias</td><td>${expirationSummary.due30Units}</td></tr>
        <tr><td>Vence <=60 dias</td><td>${expirationSummary.due60Units}</td></tr>
        <tr><td>Vence <=90 dias</td><td>${expirationSummary.due90Units}</td></tr>
      </tbody></table>
      <h2>Detalle Lotes Próximos</h2>
      <table><thead><tr><th>Producto</th><th>SKU</th><th>Lote</th><th>Caducidad</th><th>Stock</th></tr></thead><tbody>${expirationRows}</tbody></table>`
          : ""
      }
    `
    );
    if (!ok) {
      toast.error("El navegador bloqueó la ventana para imprimir PDF");
      return;
    }
    toast.success("Se abrió vista para guardar PDF");
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Corte y Reportes</h1>
            <p className="text-sm text-gray-500">
              Desde {cutoff.from} hasta {cutoff.to}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
              <SelectTrigger className="w-48">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Corte diario</SelectItem>
                <SelectItem value="weekly">Corte semanal</SelectItem>
                <SelectItem value="monthly">Corte mensual</SelectItem>
                <SelectItem value="range">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={loadCutoff} disabled={loading}>
              <Download className="h-4 w-4" />
              Actualizar
            </Button>
            <Button variant="outline" onClick={exportCutoffCsv}>
              Exportar Excel
            </Button>
            <Button onClick={exportCutoffPdf}>Exportar PDF</Button>
          </div>
        </div>

        {period === "range" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input type="date" className="w-44" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input type="date" className="w-44" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Button size="sm" onClick={loadCutoff} disabled={loading}>
              Aplicar rango
            </Button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title}>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">{card.title}</CardTitle>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen Financiero</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Total ventas</span><span className="font-semibold">{formatCurrency(cutoff.summary.totalSales)}</span></div>
              <div className="flex justify-between"><span>Costo total</span><span className="font-semibold">{formatCurrency(cutoff.summary.totalCost)}</span></div>
              <div className="flex justify-between"><span>Ganancia bruta</span><span className="font-semibold text-green-700">{formatCurrency(cutoff.summary.grossProfit)}</span></div>
              <div className="flex justify-between"><span>Transacciones</span><span className="font-semibold">{cutoff.summary.totalTransactions}</span></div>
              <div className="flex justify-between"><span>Contado (efectivo)</span><span className="font-semibold">{formatCurrency(cutoff.summary.cashSales)}</span></div>
              <div className="flex justify-between"><span>Otros métodos</span><span className="font-semibold">{formatCurrency(cutoff.summary.otherSales)}</span></div>
              <div className="flex justify-between"><span>Tarjeta</span><span className="font-semibold">{formatCurrency(cutoff.summary.cardSales)}</span></div>
              <div className="flex justify-between"><span>Transferencia</span><span className="font-semibold">{formatCurrency(cutoff.summary.transferSales)}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Caja</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Aperturas de caja</span><span className="font-semibold">{formatCurrency(cutoff.summary.openingCash)}</span></div>
              <div className="flex justify-between"><span>Entradas de efectivo</span><span className="font-semibold text-green-700">{formatCurrency(cutoff.summary.cashEntries)}</span></div>
              <div className="flex justify-between"><span>Salidas de efectivo</span><span className="font-semibold text-red-700">{formatCurrency(cutoff.summary.cashExits)}</span></div>
              <div className="flex justify-between"><span>Devoluciones en efectivo</span><span className="font-semibold text-red-700">{formatCurrency(cutoff.summary.cashRefunds)}</span></div>
              <div className="flex justify-between"><span>Caja esperada</span><span className="font-semibold">{formatCurrency(cutoff.summary.expectedCash)}</span></div>
              <div className="flex justify-between"><span>Cierre declarado</span><span className="font-semibold">{formatCurrency(cutoff.summary.declaredClosingCash)}</span></div>
              <div className="flex justify-between">
                <span>Diferencia</span>
                <span className={`font-semibold ${cutoff.summary.cashDifference >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {formatCurrency(cutoff.summary.cashDifference)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ventas por Departamento</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departamento</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cutoff.salesByDepartment.map((row) => (
                  <TableRow key={row.departmentName}>
                    <TableCell className="font-medium">{row.departmentName}</TableCell>
                    <TableCell className="text-right">{row.unitsSold}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.totalSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.totalCost)}</TableCell>
                    <TableCell className="text-right text-green-700 font-semibold">{formatCurrency(row.grossProfit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalle por Fecha</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Transacciones</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Otros</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cutoff.salesByDay.map((row) => (
                  <TableRow key={row.day}>
                    <TableCell>{String(row.day).slice(0, 10)}</TableCell>
                    <TableCell className="text-right">{row.totalTransactions}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.totalSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.cashSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.otherSales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.totalCost)}</TableCell>
                    <TableCell className="text-right text-green-700 font-semibold">{formatCurrency(row.grossProfit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {expirationsEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Caducidades (lotes)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded border p-3 bg-red-50">
                  <p className="text-xs text-gray-600">Vencidos</p>
                  <p className="text-xl font-bold text-red-700">{expirationSummary.expiredUnits}</p>
                </div>
                <div className="rounded border p-3 bg-amber-50">
                  <p className="text-xs text-gray-600">Vence en 30 días</p>
                  <p className="text-xl font-bold text-amber-700">{expirationSummary.due30Units}</p>
                </div>
                <div className="rounded border p-3 bg-yellow-50">
                  <p className="text-xs text-gray-600">Vence en 60 días</p>
                  <p className="text-xl font-bold text-yellow-700">{expirationSummary.due60Units}</p>
                </div>
                <div className="rounded border p-3 bg-blue-50">
                  <p className="text-xs text-gray-600">Vence en 90 días</p>
                  <p className="text-xl font-bold text-blue-700">{expirationSummary.due90Units}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Caducidad</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expirationItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product.name}</TableCell>
                      <TableCell>{item.product.sku || "-"}</TableCell>
                      <TableCell>{item.batchCode}</TableCell>
                      <TableCell>{String(item.expirationDate).slice(0, 10)}</TableCell>
                      <TableCell className="text-right font-semibold">{item.quantityCurrent}</TableCell>
                    </TableRow>
                  ))}
                  {expirationItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-6">
                        Sin lotes próximos a vencer.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Movimientos de Caja del Periodo</CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline" className="gap-1"><ArrowDownCircle className="h-3.5 w-3.5 text-green-600" /> Entradas</Badge>
              <Badge variant="outline" className="gap-1"><ArrowUpCircle className="h-3.5 w-3.5 text-red-600" /> Salidas</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{new Date(row.createdAt).toLocaleString("es-GT")}</TableCell>
                    <TableCell>
                      <Badge className={row.movementType === "in" ? "bg-green-600" : "bg-red-600"}>
                        {row.movementType === "in" ? "Entrada" : "Salida"}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{row.createdBy}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.amount)}</TableCell>
                  </TableRow>
                ))}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-6">
                      Sin movimientos de caja para el rango seleccionado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
