import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { apiRequest } from "../lib/api";
import { toast } from "sonner";

interface PublicProduct {
  id: number;
  name: string;
  brand?: string;
  sku: string;
  barcode: string;
  price: number;
  discountedPrice?: number;
  hasActiveDiscount?: boolean;
  activeDiscountType?: "amount" | "percent" | null;
  activeDiscountValue?: number | null;
  activeDiscountStartAt?: string | null;
  activeDiscountEndAt?: string | null;
  stock: number;
  imageUrl: string;
  category: string;
}

interface CartRow {
  product: PublicProduct;
  quantity: number;
}

export default function OnlineCheckout() {
  const params = useParams();
  const branchId = Number(params.branchId || 1);
  const uploadsBase = (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [branchName, setBranchName] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [fulfillmentType, setFulfillmentType] = useState("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [placingOrder, setPlacingOrder] = useState(false);

  const resolveImageSrc = (raw?: string) => {
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/uploads/")) return `${uploadsBase}${raw}`;
    return raw;
  };
  const getUnitPrice = (product: PublicProduct) => Number(product.discountedPrice ?? product.price ?? 0);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const query = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : "";
      const data = await apiRequest(`/online-orders/public-catalog?branchId=${branchId}${query}`);
      setBranchName(String(data?.branch?.name || `Sucursal ${branchId}`));
      setProducts(Array.isArray(data?.products) ? data.products : []);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar catalogo publico");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, [branchId, search]);

  const addToCart = (product: PublicProduct) => {
    setCart((prev) => {
      const existing = prev.find((row) => row.product.id === product.id);
      if (existing) {
        return prev.map((row) =>
          row.product.id === product.id ? { ...row, quantity: Math.min(product.stock, row.quantity + 1) } : row
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQty = (productId: number, nextQty: number) => {
    setCart((prev) =>
      prev
        .map((row) => (row.product.id === productId ? { ...row, quantity: Math.max(0, nextQty) } : row))
        .filter((row) => row.quantity > 0)
    );
  };

  const total = useMemo(
    () => cart.reduce((sum, row) => sum + getUnitPrice(row.product) * row.quantity, 0),
    [cart]
  );

  const placeOrder = async () => {
    if (!cart.length) return toast.error("Agrega productos al carrito");
    if (!customerName.trim()) return toast.error("Ingresa tu nombre");
    if (fulfillmentType === "delivery" && !deliveryAddress.trim()) {
      return toast.error("Ingresa direccion para envio");
    }

    setPlacingOrder(true);
    try {
      const payload = {
        branchId,
        fulfillmentType,
        paymentMethod,
        customer: {
          fullName: customerName.trim(),
          phone: customerPhone.trim() || null,
          email: customerEmail.trim() || null,
        },
        deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : null,
        items: cart.map((row) => ({ productId: row.product.id, quantity: row.quantity })),
      };
      const data = await apiRequest("/online-orders/public-checkout", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success(`Pedido creado: ${data?.order?.orderNumber || ""}`);
      setCart([]);
      setDeliveryAddress("");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo crear pedido");
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="themed-page-header border-b px-4 py-4 sm:px-6">
        <h1 className="text-2xl font-bold text-white">Tienda Online</h1>
        <p className="themed-page-header-muted text-sm">{branchName || `Sucursal ${branchId}`}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_380px] lg:p-6">
        <Card className="section-card p-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto por nombre, SKU o codigo"
          />
          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-gray-600">Cargando productos...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-gray-600">Sin productos disponibles.</p>
            ) : (
              products.map((p) => (
                <Card key={p.id} className="section-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {p.imageUrl && (
                        <img
                          src={resolveImageSrc(p.imageUrl)}
                          alt={p.name}
                          className="h-12 w-12 rounded border object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold">{p.name}</p>
                        {p.brand && <p className="text-xs text-gray-500">{p.brand}</p>}
                        <p className="text-xs text-gray-500">{p.sku}</p>
                        {p.hasActiveDiscount ? (
                          <div>
                            <p className="text-sm font-bold text-blue-700">Q {getUnitPrice(p).toFixed(2)}</p>
                            <p className="text-xs text-gray-500 line-through">Q {Number(p.price).toFixed(2)}</p>
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-blue-700">Q {Number(p.price).toFixed(2)}</p>
                        )}
                        <Badge variant="secondary" className="mt-1 text-xs">{p.category}</Badge>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => addToCart(p)}>Agregar</Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </Card>

        <Card className="section-card p-4 space-y-3">
          <p className="text-lg font-semibold">Tu pedido</p>
          {cart.length === 0 ? (
            <p className="text-sm text-gray-600">Carrito vacio</p>
          ) : (
            <div className="space-y-2">
              {cart.map((row) => (
                <div key={row.product.id} className="rounded border p-2">
                  <p className="font-medium">{row.product.name}</p>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span>Q {getUnitPrice(row.product).toFixed(2)}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => updateQty(row.product.id, row.quantity - 1)}>-</Button>
                      <span>{row.quantity}</span>
                      <Button variant="outline" size="sm" onClick={() => updateQty(row.product.id, row.quantity + 1)}>+</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3 text-sm font-semibold">Total: Q {total.toFixed(2)}</div>

          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nombre completo" />
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Telefono" />
          <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email (opcional)" />

          <Select value={fulfillmentType} onValueChange={setFulfillmentType}>
            <SelectTrigger><SelectValue placeholder="Entrega" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pickup">Recoger en tienda</SelectItem>
              <SelectItem value="delivery">Envio a domicilio</SelectItem>
            </SelectContent>
          </Select>
          {fulfillmentType === "delivery" && (
            <Input value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} placeholder="Direccion de entrega" />
          )}

          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue placeholder="Metodo de pago" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash_on_delivery">Contra entrega</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
            </SelectContent>
          </Select>

          <Button className="w-full" onClick={placeOrder} disabled={placingOrder || !cart.length}>
            {placingOrder ? "Creando pedido..." : "Confirmar pedido"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
