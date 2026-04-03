import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  CreditCard,
  Smartphone,
  Users,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Link } from "react-router";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "../utils/currency";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { useEffect, useState } from "react";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1"];

interface DashboardSummary {
  totalSales: number;
  totalTransactions: number;
  averageTicket: number;
  cashSales: number;
  cardSales: number;
  transferSales: number;
  activeProducts: number;
}

interface Last7Row {
  date: string;
  ventas: number;
  transacciones: number;
}

interface TopProduct {
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
  };
  totalQuantity: number;
  totalRevenue: number;
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

export default function Dashboard() {
  const { token, businessSettings } = useAuth();
  const expirationsEnabled = Boolean(businessSettings?.enabledModules?.includes("expirations"));
  const [dailySummary, setDailySummary] = useState<DashboardSummary>({
    totalSales: 0,
    totalTransactions: 0,
    averageTicket: 0,
    cashSales: 0,
    cardSales: 0,
    transferSales: 0,
    activeProducts: 0,
  });
  const [last7Days, setLast7Days] = useState<Last7Row[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [expirationSummary, setExpirationSummary] = useState<ExpirationSummary>({
    expiredUnits: 0,
    due30Units: 0,
    due60Units: 0,
    due90Units: 0,
  });
  const [expirationItems, setExpirationItems] = useState<ExpirationItem[]>([]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/stats/dashboard", { token }).then(setDailySummary).catch(() => undefined);
    apiRequest("/stats/last7", { token }).then(setLast7Days).catch(() => undefined);
    apiRequest("/stats/top-products?limit=6", { token }).then(setTopProducts).catch(() => undefined);
    if (expirationsEnabled) {
      apiRequest("/stats/expirations?days=90&limit=10", { token })
        .then((data) => {
          setExpirationSummary(data?.summary || { expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 });
          setExpirationItems(Array.isArray(data?.items) ? data.items : []);
        })
        .catch(() => undefined);
    } else {
      setExpirationSummary({ expiredUnits: 0, due30Units: 0, due60Units: 0, due90Units: 0 });
      setExpirationItems([]);
    }
  }, [token, expirationsEnabled]);

  const paymentMethodsData = [
    { name: "Efectivo", value: dailySummary.cashSales, color: "#3b82f6", id: "cash" },
    { name: "Tarjeta", value: dailySummary.cardSales, color: "#8b5cf6", id: "card" },
    { name: "Transferencia", value: dailySummary.transferSales, color: "#ec4899", id: "transfer" },
  ].filter((item) => item.value > 0);

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel</h1>
            <p className="text-sm text-gray-500">
              Resumen de operaciones del día {new Date().toLocaleDateString("es-GT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <Link to="/pos">
            <Button size="lg" className="gap-2">
              <ShoppingCart className="h-5 w-5" />
              Abrir Punto de Venta
            </Button>
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Ventas del Día</CardTitle>
              <DollarSign className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{formatCurrency(dailySummary.totalSales)}</div>
              <div className="flex items-center mt-2 text-sm">
                <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
                <span className="text-green-600 font-medium">Actual</span>
                <span className="text-gray-500 ml-2">día</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Transacciones</CardTitle>
              <ShoppingCart className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{dailySummary.totalTransactions}</div>
              <div className="flex items-center mt-2 text-sm">
                <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
                <span className="text-green-600 font-medium">Actual</span>
                <span className="text-gray-500 ml-2">día</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Ticket Promedio</CardTitle>
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{formatCurrency(dailySummary.averageTicket)}</div>
              <div className="flex items-center mt-2 text-sm">
                <ArrowDownRight className="h-4 w-4 text-red-600 mr-1" />
                <span className="text-red-600 font-medium">Día</span>
                <span className="text-gray-500 ml-2">actual</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Productos Activos</CardTitle>
              <Package className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{dailySummary.activeProducts}</div>
              <div className="flex items-center mt-2 text-sm">
                <Badge variant="secondary" className="text-xs">
                  En existencia
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Ventas Últimos 7 Días</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={last7Days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
                  <Legend />
                  <Line type="monotone" dataKey="ventas" stroke="#3b82f6" strokeWidth={3} name="Ventas (Q)" />
                  <Line type="monotone" dataKey="transacciones" stroke="#8b5cf6" strokeWidth={3} name="Transacciones" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Métodos de Pago Hoy</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={paymentMethodsData} cx="50%" cy="50%" labelLine={false} label={(entry) => formatCurrency(entry.value)} outerRadius={80} fill="#8884d8" dataKey="value">
                    {paymentMethodsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-blue-600" />
                    <span>Efectivo</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(dailySummary.cashSales)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-purple-600" />
                    <span>Tarjeta</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(dailySummary.cardSales)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-pink-600" />
                    <span>Transferencia</span>
                  </div>
                  <span className="font-semibold">{formatCurrency(dailySummary.transferSales)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Productos Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="product.name" stroke="#6b7280" fontSize={12} angle={-45} textAnchor="end" height={80} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
                <Bar dataKey="totalRevenue" fill="#3b82f6" name="Ingresos (Q)" radius={[8, 8, 0, 0]}>
                  {topProducts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accesos Rápidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link to="/pos">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <ShoppingCart className="h-8 w-8" />
                  <span>Nueva Venta</span>
                </Button>
              </Link>
              <Link to="/products">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <Package className="h-8 w-8" />
                  <span>Productos</span>
                </Button>
              </Link>
              <Link to="/sales">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <Users className="h-8 w-8" />
                  <span>Historial</span>
                </Button>
              </Link>
              <Link to="/reports">
                <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                  <TrendingUp className="h-8 w-8" />
                  <span>Reportes</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {expirationsEnabled && (
          <Card>
            <CardHeader>
              <CardTitle>Alertas de Caducidad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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

              <div className="space-y-2">
                {expirationItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="rounded border p-2 text-sm flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-xs text-gray-500">
                        Lote: {item.batchCode} · Caduca: {String(item.expirationDate).slice(0, 10)}
                      </p>
                    </div>
                    <Badge variant="outline">Stock: {item.quantityCurrent}</Badge>
                  </div>
                ))}
                {expirationItems.length === 0 && (
                  <p className="text-sm text-gray-500">Sin lotes próximos a vencer.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
