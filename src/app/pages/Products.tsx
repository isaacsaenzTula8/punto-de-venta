import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Package, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "../utils/currency";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";

interface ProductRow {
  id: string;
  name: string;
  cost: number;
  price: number;
  category: string;
  categoryId: string;
  stock: number;
  sku: string;
  barcode?: string;
  description?: string;
  active: boolean;
}

interface CategoryRow {
  id: number;
  name: string;
  active: boolean;
}

export default function Products() {
  const { token } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    cost: "0",
    price: "0",
    categoryId: "",
    stock: "0",
    sku: "",
    barcode: "",
    description: "",
  });

  const loadAll = async () => {
    if (!token) return;
    try {
      const [productsData, categoriesData] = await Promise.all([
        apiRequest("/products?includeInactive=1", { token }),
        apiRequest("/categories", { token }),
      ]);
      setProducts(productsData);
      setCategories((categoriesData || []).filter((c: CategoryRow) => c.active));
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron cargar productos");
    }
  };

  useEffect(() => {
    loadAll();
  }, [token]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return products.filter((product) => {
      return (
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      );
    });
  }, [products, searchQuery]);

  const openDialog = (product?: ProductRow) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        cost: String(product.cost),
        price: String(product.price),
        categoryId: product.categoryId || "",
        stock: String(product.stock),
        sku: product.sku,
        barcode: product.barcode || "",
        description: product.description || "",
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        cost: "0",
        price: "0",
        categoryId: categories[0] ? String(categories[0].id) : "",
        stock: "0",
        sku: `SKU-${Date.now()}`,
        barcode: "",
        description: "",
      });
    }
    setShowDialog(true);
  };

  const saveProduct = async () => {
    if (!token) return;
    if (!formData.name || !formData.cost || !formData.price || !formData.sku) {
      toast.error("Por favor completa todos los campos obligatorios");
      return;
    }

    const payload = {
      name: formData.name,
      cost: Number(formData.cost),
      price: Number(formData.price),
      stock: Number(formData.stock),
      sku: formData.sku,
      barcode: formData.barcode || null,
      categoryId: formData.categoryId || null,
      description: formData.description || null,
    };

    try {
      if (editingProduct) {
        await apiRequest(`/products/${editingProduct.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(payload),
        });
        toast.success("Producto actualizado correctamente");
      } else {
        await apiRequest("/products", {
          method: "POST",
          token,
          body: JSON.stringify(payload),
        });
        toast.success("Producto creado correctamente");
      }
      setShowDialog(false);
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar producto");
    }
  };

  const deleteProduct = async (id: string) => {
    if (!token) return;
    if (!confirm("Estas seguro de desactivar este producto?")) return;
    try {
      await apiRequest(`/products/${id}`, { method: "DELETE", token });
      toast.success("Producto desactivado correctamente");
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo desactivar producto");
    }
  };

  const totalProducts = products.length;
  const lowStock = products.filter((p) => p.stock < 20 && p.active).length;
  const totalValue = products.reduce((sum, p) => (p.active ? sum + p.price * p.stock : sum), 0);

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Productos</h1>
          <p className="text-sm text-gray-500">Administra tu catálogo de productos (datos reales)</p>
          </div>
          <Button onClick={() => openDialog()} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Nuevo Producto
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar por nombre, SKU, código de barras o categoría..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Productos</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalProducts}</p>
              </div>
              <Package className="h-12 w-12 text-blue-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Bajo</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{lowStock}</p>
              </div>
              <AlertCircle className="h-12 w-12 text-orange-600" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Valor Inventario</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{formatCurrency(totalValue)}</p>
              </div>
              <Package className="h-12 w-12 text-green-600" />
            </div>
          </Card>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Código de Barras</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio Venta</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                    <TableCell className="font-mono text-sm">{product.barcode || "-"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        {product.description && <p className="text-sm text-gray-500 line-clamp-1">{product.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(product.cost)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(product.price)}</TableCell>
                    <TableCell className="text-right">
                      <span className={product.stock < 20 ? "text-orange-600 font-semibold" : ""}>{product.stock}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">{formatCurrency(product.price * product.stock)}</TableCell>
                    <TableCell className="text-center">
                      {product.active ? (
                        product.stock > 20 ? (
                          <Badge variant="default" className="bg-green-600">En Stock</Badge>
                        ) : product.stock > 0 ? (
                          <Badge variant="default" className="bg-orange-600">Stock Bajo</Badge>
                        ) : (
                          <Badge variant="destructive">Agotado</Badge>
                        )
                      ) : (
                        <Badge variant="outline">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openDialog(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteProduct(product.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No se encontraron productos</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Producto *</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Cafe Americano" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU *</Label>
              <Input id="sku" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="Ej: CAF-001" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode">Código de Barras (opcional)</Label>
              <Input id="barcode" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="Ej: 7501234567890" />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cost">Precio Costo *</Label>
                <Input id="cost" type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} placeholder="0.00" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Precio Venta *</Label>
                <Input id="price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} placeholder="0.00" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock">Stock *</Label>
                <Input id="stock" type="number" value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} placeholder="0" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoria *</Label>
              <Select value={formData.categoryId} onValueChange={(value) => setFormData({ ...formData, categoryId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripcion</Label>
              <Textarea id="description" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Descripcion del producto..." rows={3} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct}>{editingProduct ? "Guardar Cambios" : "Crear Producto"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
