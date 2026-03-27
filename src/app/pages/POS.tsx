import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, CreditCard, DollarSign, Smartphone, Package, ShoppingCart, Eye } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { type Product, type CartItem } from "../store/data";
import { toast } from "sonner";
import { formatCurrency } from "../utils/currency";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";

interface CategoryRow {
  id: number;
  name: string;
  active: boolean;
}

interface PendingTicketRow {
  id: number;
  sale_number: string;
  sale_date: string;
  total: number;
  payment_status: "pending" | "completed" | "cancelled" | "refunded";
  taken_by?: string | null;
}

interface PendingTicketItem {
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface PendingTicketDetail {
  id: number;
  sale_number: string;
  sale_date: string;
  total: number;
  payment_status: "pending" | "completed" | "cancelled" | "refunded";
  taken_by?: string | null;
  items: PendingTicketItem[];
}

export default function POS() {
  const creditEnabled = false; // Habilitar cuando exista módulo de clientes y selector de cliente.
  const { token, user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(["Todos"]);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "credit">("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [hasOpenCashSession, setHasOpenCashSession] = useState(false);
  const [pendingTickets, setPendingTickets] = useState<PendingTicketRow[]>([]);
  const [loadingPendingTickets, setLoadingPendingTickets] = useState(false);
  const [showPendingTicketDialog, setShowPendingTicketDialog] = useState(false);
  const [selectedPendingTicket, setSelectedPendingTicket] = useState<PendingTicketDetail | null>(null);
  const [pendingTicketPaymentMethod, setPendingTicketPaymentMethod] = useState<"cash" | "card" | "transfer" | "credit">("cash");
  const canChargeSales = Boolean(user?.permissions?.salesCharge);

  const fetchProducts = async () => {
    if (!token) return;
    apiRequest("/products", { token })
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {
        setProducts([]);
        toast.error("No se pudieron cargar productos desde base de datos");
      });
  };

  const fetchPendingTickets = async () => {
    if (!token || !canChargeSales) {
      setPendingTickets([]);
      return;
    }
    setLoadingPendingTickets(true);
    try {
      const data = await apiRequest("/sales?paymentStatus=pending", { token });
      setPendingTickets(Array.isArray(data) ? data : []);
    } catch {
      setPendingTickets([]);
    } finally {
      setLoadingPendingTickets(false);
    }
  };

  useEffect(() => {
    if (!token) return;

    fetchProducts();
    apiRequest("/categories", { token })
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        const backendCategories = rows
          .filter((c: CategoryRow) => c.active)
          .map((c: CategoryRow) => c.name);
        setCategories(["Todos", ...backendCategories]);
      })
      .catch(() => {
        setCategories(["Todos"]);
        toast.error("No se pudieron cargar categorias desde base de datos");
      });

    apiRequest("/cash/current", { token })
      .then((data) => setHasOpenCashSession(Boolean(data?.session)))
      .catch(() => setHasOpenCashSession(false));
  }, [token]);

  useEffect(() => {
    fetchPendingTickets();
  }, [token, canChargeSales]);

  const hasSearchQuery = searchQuery.trim().length > 0;

  const filteredProducts = useMemo(() => {
    if (!hasSearchQuery) return [];
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "Todos" || product.category === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery, hasSearchQuery]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.subtotal, 0), [cart]);
  const receivedAmount = Number(cashReceived || 0);
  const cashChange = Math.max(0, receivedAmount - cartTotal);
  const missingAmount = Math.max(0, cartTotal - receivedAmount);

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product.id === product.id);
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * product.price }
            : item
        )
      );
    } else {
      setCart([...cart, { product, quantity: 1, subtotal: product.price }]);
    }
    toast.success(`${product.name} agregado al carrito`);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(
      cart.map((item) => {
        if (item.product.id === productId) {
          const newQuantity = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQuantity, subtotal: newQuantity * item.product.price };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId));
    toast.info("Producto eliminado del carrito");
  };

  const openCashSession = async () => {
    if (!token) return;
    const raw = window.prompt("Monto inicial de caja:", "0");
    if (raw === null) return;
    const openingAmount = Number(raw);
    if (Number.isNaN(openingAmount) || openingAmount < 0) return toast.error("Monto inicial invalido");
    try {
      await apiRequest("/cash/open", { method: "POST", token, body: JSON.stringify({ openingAmount }) });
      setHasOpenCashSession(true);
      toast.success("Caja abierta correctamente");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo abrir caja");
    }
  };

  const processPayment = async (chargeNow: boolean) => {
    if (cart.length === 0) return toast.error("El carrito esta vacio");
    if (!token) return toast.error("Sesion no valida");

    try {
      await apiRequest("/sales", {
        method: "POST",
        token,
        body: JSON.stringify({
          chargeNow,
          paymentMethod,
          items: cart.map((item) => ({ productId: Number(item.product.id), quantity: item.quantity })),
        }),
      });

      setProducts((prev) =>
        prev.map((p) => {
          const sold = cart.find((i) => i.product.id === p.id);
          return sold ? { ...p, stock: Math.max(0, p.stock - sold.quantity) } : p;
        })
      );

      if (chargeNow) {
        toast.success(`Venta completada por ${formatCurrency(cartTotal)} - ${paymentMethod.toUpperCase()}`);
      } else {
        toast.success("Pedido registrado en estado pendiente de cobro");
        fetchPendingTickets();
      }
      setCart([]);
      setShowPaymentDialog(false);
      setPaymentMethod("cash");
      setCashReceived("");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo completar la venta");
    }
  };

  const openPendingTicket = async (saleId: number) => {
    if (!token) return;
    try {
      const detail = await apiRequest(`/sales/${saleId}`, { token });
      setSelectedPendingTicket(detail);
      setPendingTicketPaymentMethod("cash");
      setShowPendingTicketDialog(true);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar el detalle del ticket");
    }
  };

  const chargePendingTicket = async () => {
    if (!token || !selectedPendingTicket) return;
    if (!hasOpenCashSession) {
      toast.error("Debes abrir caja para cobrar un ticket pendiente");
      return;
    }

    try {
      await apiRequest(`/sales/${selectedPendingTicket.id}/charge`, {
        method: "POST",
        token,
        body: JSON.stringify({ paymentMethod: pendingTicketPaymentMethod }),
      });
      toast.success(`Ticket ${selectedPendingTicket.sale_number} cobrado`);
      setShowPendingTicketDialog(false);
      setSelectedPendingTicket(null);
      fetchPendingTickets();
      fetchProducts();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cobrar el ticket");
    }
  };

  return (
    <div className="h-full flex bg-gray-50">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Punto de Venta</h1>
              <p className="text-sm text-gray-500">
                Carrito activo con {cart.length} producto{cart.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canChargeSales && !hasOpenCashSession && (
                <Button variant="outline" onClick={openCashSession}>
                  Abrir Caja
                </Button>
              )}
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Total parcial: {formatCurrency(cartTotal)}
              </Badge>
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          {cart.length === 0 ? (
            <div className="text-center py-14">
              <ShoppingCart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">El carrito esta vacio</p>
              <p className="text-sm text-gray-400 mt-2">Busca un producto en el panel derecho para empezar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <Card key={item.product.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h4 className="font-semibold">{item.product.name}</h4>
                      <p className="text-sm text-gray-500">{item.product.sku}</p>
                      <p className="text-sm text-gray-500">{formatCurrency(item.product.price)} por unidad</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFromCart(item.product.id)}
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.product.id, -1)} className="h-8 w-8">
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-10 text-center font-semibold">{item.quantity}</span>
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.product.id, 1)} className="h-8 w-8">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="font-bold text-blue-600">{formatCurrency(item.subtotal)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {canChargeSales && (
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Tickets Pendientes</h3>
                <Button variant="outline" size="sm" onClick={fetchPendingTickets}>
                  Actualizar
                </Button>
              </div>

              {loadingPendingTickets ? (
                <Card className="p-4">
                  <p className="text-sm text-gray-500">Cargando tickets pendientes...</p>
                </Card>
              ) : pendingTickets.length === 0 ? (
                <Card className="p-4">
                  <p className="text-sm text-gray-500">No hay tickets pendientes por cobrar.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {pendingTickets.map((ticket) => (
                    <Card key={ticket.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{ticket.sale_number}</p>
                          <p className="text-xs text-gray-500">
                            Enviado por: {ticket.taken_by || "Usuario"} · {new Date(ticket.sale_date).toLocaleString("es-GT")}
                          </p>
                          <p className="mt-2 text-sm font-bold text-blue-600">{formatCurrency(Number(ticket.total))}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openPendingTicket(ticket.id)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver Ticket
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-4 space-y-4 bg-gray-50">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Total:</span>
            <span className="font-semibold">{formatCurrency(cartTotal)}</span>
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => {
                if (canChargeSales) {
                  setCashReceived("");
                  setShowPaymentDialog(true);
                  return;
                }
                processPayment(false);
              }}
              disabled={cart.length === 0 || (canChargeSales && !hasOpenCashSession)}
              className="w-full h-12 text-base font-semibold"
              size="lg"
            >
              <CreditCard className="mr-2 h-5 w-5" />
              {canChargeSales ? "Procesar Pago" : "Guardar Pedido"}
            </Button>
            {canChargeSales && !hasOpenCashSession && (
              <p className="text-xs text-amber-700">Debes abrir caja para poder cobrar.</p>
            )}
            {!canChargeSales && (
              <p className="text-xs text-gray-600">Tu rol puede tomar pedidos, pero el cobro lo realiza administracion.</p>
            )}
            <Button onClick={() => setCart([])} disabled={cart.length === 0} variant="outline" className="w-full">
              Limpiar Carrito
            </Button>
          </div>
        </div>
      </div>

      <aside className="w-[420px] bg-white border-l flex flex-col shadow-xl">
        <div className="bg-slate-900 text-white px-6 py-4">
          <h2 className="text-xl font-bold">Buscar Productos</h2>
          <p className="text-sm text-gray-300">Encuentra por nombre, SKU o código de barras y agrégalos al carrito</p>
        </div>
        <div className="p-4 border-b space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input type="text" placeholder="Buscar productos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-11" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((category) => (
              <Button key={category} variant={selectedCategory === category ? "default" : "outline"} onClick={() => setSelectedCategory(category)} className="whitespace-nowrap" size="sm">
                {category}
              </Button>
            ))}
          </div>
        </div>
        <ScrollArea className="flex-1 p-4">
          {!hasSearchQuery ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Escribe para buscar productos</p>
              <p className="text-xs text-gray-400 mt-2">No se mostrara todo el catalogo por defecto</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay resultados para esta busqueda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProducts.map((product) => (
                <Card key={product.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{product.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{product.sku}</p>
                      <p className="text-sm font-bold text-blue-600 mt-2">{formatCurrency(product.price)}</p>
                    </div>
                    <Button size="sm" onClick={() => addToCart(product)}>
                      Agregar
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs">
                      {product.category}
                    </Badge>
                    <span className="text-xs text-gray-500">Stock: {product.stock}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center p-6 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Total a pagar</p>
              <p className="text-3xl font-bold text-blue-600">{formatCurrency(cartTotal)}</p>
            </div>
            <div>
              <p className="text-sm font-medium mb-3">Metodo de pago:</p>
              <div className="grid grid-cols-4 gap-3">
                <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className="flex flex-col h-auto py-4">
                  <DollarSign className="h-6 w-6 mb-2" />
                  <span className="text-xs">Efectivo</span>
                </Button>
                <Button variant={paymentMethod === "card" ? "default" : "outline"} onClick={() => setPaymentMethod("card")} className="flex flex-col h-auto py-4">
                  <CreditCard className="h-6 w-6 mb-2" />
                  <span className="text-xs">Tarjeta</span>
                </Button>
                <Button variant={paymentMethod === "transfer" ? "default" : "outline"} onClick={() => setPaymentMethod("transfer")} className="flex flex-col h-auto py-4">
                  <Smartphone className="h-6 w-6 mb-2" />
                  <span className="text-xs">Transfer.</span>
                </Button>
                <Button
                  variant={paymentMethod === "credit" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("credit")}
                  className="flex flex-col h-auto py-4"
                  disabled={!creditEnabled}
                >
                  <CreditCard className="h-6 w-6 mb-2" />
                  <span className="text-xs">Credito</span>
                </Button>
              </div>
              {!creditEnabled && <p className="text-xs text-gray-500 mt-2">Cobro a crédito se habilitará al activar módulo de clientes.</p>}
            </div>
            {paymentMethod === "cash" && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-2">Monto recibido</p>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="rounded-md border bg-gray-50 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Recibido:</span>
                    <span className="font-semibold">{formatCurrency(receivedAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cambio:</span>
                    <span className="font-bold text-green-700">{formatCurrency(cashChange)}</span>
                  </div>
                  {missingAmount > 0 && (
                    <p className="text-xs text-red-600">Faltan {formatCurrency(missingAmount)} para completar el pago.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => processPayment(true)} disabled={paymentMethod === "cash" && receivedAmount < cartTotal}>
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPendingTicketDialog} onOpenChange={setShowPendingTicketDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ticket Pendiente</DialogTitle>
          </DialogHeader>

          {selectedPendingTicket && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-gray-50 p-3 text-sm">
                <p className="font-semibold">{selectedPendingTicket.sale_number}</p>
                <p className="text-gray-600">
                  Enviado por: {selectedPendingTicket.taken_by || "Usuario"} ·{" "}
                  {new Date(selectedPendingTicket.sale_date).toLocaleString("es-GT")}
                </p>
              </div>

              <div className="space-y-2">
                {selectedPendingTicket.items.map((item, index) => (
                  <Card key={`${item.product_sku}-${index}`} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{item.product_name}</p>
                        <p className="text-xs text-gray-500">{item.product_sku}</p>
                        <p className="text-xs text-gray-500">
                          {item.quantity} x {formatCurrency(Number(item.unit_price))}
                        </p>
                      </div>
                      <p className="font-semibold text-blue-600">{formatCurrency(Number(item.subtotal))}</p>
                    </div>
                  </Card>
                ))}
              </div>

              <div className="rounded-md border p-3">
                <div className="flex justify-between">
                  <span className="font-semibold">Total ticket:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(Number(selectedPendingTicket.total))}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Metodo de cobro:</p>
                <div className="grid grid-cols-4 gap-2">
                  <Button variant={pendingTicketPaymentMethod === "cash" ? "default" : "outline"} onClick={() => setPendingTicketPaymentMethod("cash")} className="h-auto py-3 text-xs">
                    Efectivo
                  </Button>
                  <Button variant={pendingTicketPaymentMethod === "card" ? "default" : "outline"} onClick={() => setPendingTicketPaymentMethod("card")} className="h-auto py-3 text-xs">
                    Tarjeta
                  </Button>
                  <Button variant={pendingTicketPaymentMethod === "transfer" ? "default" : "outline"} onClick={() => setPendingTicketPaymentMethod("transfer")} className="h-auto py-3 text-xs">
                    Transfer.
                  </Button>
                  <Button variant={pendingTicketPaymentMethod === "credit" ? "default" : "outline"} onClick={() => setPendingTicketPaymentMethod("credit")} className="h-auto py-3 text-xs" disabled={!creditEnabled}>
                    Credito
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPendingTicketDialog(false)}>
              Cerrar
            </Button>
            <Button onClick={chargePendingTicket} disabled={!hasOpenCashSession}>
              Cobrar Ticket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
