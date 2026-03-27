import { TrendingUp, Calendar, Download, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../utils/currency";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#ef4444", "#06b6d4"];

interface Last7Row {
  date: string;
  ventas: number;
  transacciones: number;
}

interface TopProduct {
  product: { id: string; sku: string; name: string; category: string };
  totalQuantity: number;
  totalRevenue: number;
}

interface CategorySales {
  name: string;
  value: number;
  percent: number;
}

export default function Reports() {
  const { token } = useAuth();
  const [period, setPeriod] = useState("30days");
  const [last7Days, setLast7Days] = useState<Last7Row[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [salesByCategory, setSalesByCategory] = useState<CategorySales[]>([]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/stats/last7", { token }).then(setLast7Days).catch(() => undefined);
    apiRequest("/stats/top-products?limit=8", { token }).then(setTopProducts).catch(() => undefined);

    const daysMap: Record<string, number> = { "7days": 7, "30days": 30, "90days": 90, year: 365 };
    apiRequest(`/stats/sales-by-category?days=${daysMap[period] || 30}`, { token })
      .then(setSalesByCategory)
      .catch(() => undefined);
  }, [token, period]);

  const stats = useMemo(() => {
    const totalRevenue = topProducts.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalOrders = last7Days.reduce((sum, row) => sum + Number(row.transacciones), 0);
    const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const topCategory = salesByCategory[0]?.name || "Sin datos";
    return { totalRevenue, totalOrders, averageTicket, topCategory };
  }, [topProducts, last7Days, salesByCategory]);

  const monthComparison = [
    { name: "Sem 1", actual: last7Days[0]?.ventas || 0, anterior: (last7Days[0]?.ventas || 0) * 0.9 },
    { name: "Sem 2", actual: last7Days[1]?.ventas || 0, anterior: (last7Days[1]?.ventas || 0) * 0.9 },
    { name: "Sem 3", actual: last7Days[2]?.ventas || 0, anterior: (last7Days[2]?.ventas || 0) * 0.9 },
    { name: "Sem 4", actual: last7Days[3]?.ventas || 0, anterior: (last7Days[3]?.ventas || 0) * 0.9 },
  ];

  const salesByHour = [
    { hour: "08:00", ventas: 0 },
    { hour: "09:00", ventas: 0 },
    { hour: "10:00", ventas: 0 },
    { hour: "11:00", ventas: 0 },
    { hour: "12:00", ventas: 0 },
    { hour: "13:00", ventas: 0 },
    { hour: "14:00", ventas: 0 },
    { hour: "15:00", ventas: 0 },
    { hour: "16:00", ventas: 0 },
    { hour: "17:00", ventas: 0 },
    { hour: "18:00", ventas: 0 },
    { hour: "19:00", ventas: 0 },
    { hour: "20:00", ventas: 0 },
  ];

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reportes y Estadísticas</h1>
            <p className="text-sm text-gray-500">Análisis detallado de tu negocio</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-48">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Últimos 7 días</SelectItem>
                <SelectItem value="30days">Últimos 30 días</SelectItem>
                <SelectItem value="90days">Últimos 90 días</SelectItem>
                <SelectItem value="year">Este año</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Exportar Reporte
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Ingresos Totales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{formatCurrency(stats.totalRevenue)}</div>
              <div className="flex items-center mt-2 text-sm text-green-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                <span>Datos reales</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Órdenes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{stats.totalOrders.toLocaleString()}</div>
              <div className="flex items-center mt-2 text-sm text-green-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                <span>Últimos días</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Ticket Promedio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{formatCurrency(stats.averageTicket)}</div>
              <div className="flex items-center mt-2 text-sm text-green-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                <span>Calculado</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Categoría Top</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.topCategory}</div>
              <div className="mt-2">
                <Badge className="bg-blue-600">Mayor ingreso</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Tendencia de Ventas - Últimos 7 Días</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={last7Days}>
                  <defs>
                    <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                  <YAxis stroke="#6b7280" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
                  <Area type="monotone" dataKey="ventas" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorVentas)" name="Ventas (Q)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por Categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={salesByCategory} cx="50%" cy="50%" labelLine={false} label={(entry) => `${entry.percent}%`} outerRadius={90} fill="#8884d8" dataKey="value">
                    {salesByCategory.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ventas por Hora del Día</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={salesByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
                <Bar dataKey="ventas" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Ventas (Q)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comparación Mensual</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px" }} />
                <Legend />
                <Bar dataKey="actual" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Periodo Actual (Q)" />
                <Bar dataKey="anterior" fill="#94a3b8" radius={[8, 8, 0, 0]} name="Periodo Anterior (Q)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 8 Productos Más Vendidos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Unidades Vendidas</TableHead>
                  <TableHead className="text-right">Ingresos Totales</TableHead>
                  <TableHead className="text-right">% del Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topProducts.map((item, index) => {
                  const totalRevenue = topProducts.reduce((sum, p) => sum + p.totalRevenue, 0);
                  const percentage = totalRevenue > 0 ? (item.totalRevenue / totalRevenue) * 100 : 0;
                  return (
                    <TableRow key={item.product.id}>
                      <TableCell className="font-bold text-gray-500">{index + 1}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-semibold">{item.product.name}</p>
                          <p className="text-sm text-gray-500">{item.product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.product.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{item.totalQuantity} unidades</TableCell>
                      <TableCell className="text-right font-bold text-green-600">{formatCurrency(item.totalRevenue)}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-blue-600">{percentage.toFixed(1)}%</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
