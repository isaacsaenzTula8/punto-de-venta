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

export default function Dashboard() {
  const { token } = useAuth();
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

  useEffect(() => {
    if (!token) return;
    apiRequest("/stats/dashboard", { token }).then(setDailySummary).catch(() => undefined);
    apiRequest("/stats/last7", { token }).then(setLast7Days).catch(() => undefined);
    apiRequest("/stats/top-products?limit=6", { token }).then(setTopProducts).catch(() => undefined);
  }, [token]);

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
      </div>
    </div>
  );
}
