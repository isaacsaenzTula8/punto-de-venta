import { useEffect, useMemo, useRef, useState } from "react";
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
import { Checkbox } from "../components/ui/checkbox";
import { toast } from "sonner";
import { formatCurrency } from "../utils/currency";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";
import { downloadCsv, parseCsvText, printHtmlAsPdf } from "../utils/export";

interface ProductRow {
  id: string;
  name: string;
  brand?: string;
  sizeLabel?: string;
  cost: number;
  price: number;
  category: string;
  categoryId: string;
  stock: number;
  sku: string;
  barcode?: string;
  description?: string;
  imageUrl?: string;
  locationCode?: string;
  expirationRequired?: boolean;
  expirationDate?: string | null;
  active: boolean;
  discountedPrice?: number;
  hasActiveDiscount?: boolean;
  activeDiscountType?: "amount" | "percent" | null;
  activeDiscountValue?: number | null;
  activeDiscountStartAt?: string | null;
  activeDiscountEndAt?: string | null;
  presentations?: ProductPresentationRow[];
}

interface CategoryRow {
  id: number;
  name: string;
  active: boolean;
}

interface BranchRow {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

interface ProductDiscountRow {
  id: number;
  productId: number;
  branchId: number;
  discountType: "amount" | "percent";
  discountValue: number;
  startAt: string;
  endAt: string;
  active: boolean;
}

interface ProductPresentationRow {
  id: number;
  productId: number;
  branchId: number;
  name: string;
  sku: string;
  barcode: string;
  unitsFactor: number;
  price: number;
  isDefault: boolean;
  active: boolean;
}

interface ProductBatchRow {
  id: number;
  productId: number;
  branchId: number;
  batchCode: string;
  expirationDate: string | null;
  quantityInitial: number;
  quantityCurrent: number;
  unitCost: number;
  active: boolean;
}

const SIZE_OPTIONS_BY_VERTICAL: Record<string, string[]> = {
  fashion: ["XXS", "XS", "S", "M", "L", "XL", "XXL", "28", "30", "32", "34", "36", "38", "40", "42", "44"],
  wholesale: ["CH", "MD", "GD", "XG", "XXG"],
  general: ["XS", "S", "M", "L", "XL"],
};

export default function Products() {
  const uploadsBase =
    (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");

  const resolveImageSrc = (imageUrl?: string) => {
    if (!imageUrl) return "";
    if (imageUrl.startsWith("data:image/")) return imageUrl;
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
    if (imageUrl.startsWith("/uploads/")) return `${uploadsBase}${imageUrl}`;
    return imageUrl;
  };

  const { token, user, businessSettings } = useAuth();
  const expirationsEnabled = Boolean(businessSettings?.enabledModules?.includes("expirations"));
  const brandsAndSizesEnabled = Boolean(businessSettings?.enabledModules?.includes("brands_and_sizes"));
  const storeVertical = String(businessSettings?.storeVertical || "general");
  const catalogSizeOptions = SIZE_OPTIONS_BY_VERTICAL[storeVertical] || SIZE_OPTIONS_BY_VERTICAL.general;
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [multiBranchEnabled, setMultiBranchEnabled] = useState(false);
  const [branchFilterId, setBranchFilterId] = useState<string>(String(user?.branchId || 1));
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(20);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkTargetBranchId, setBulkTargetBranchId] = useState<string>("");
  const [showDialog, setShowDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showPresentationDialog, setShowPresentationDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [discountProduct, setDiscountProduct] = useState<ProductRow | null>(null);
  const [presentationProduct, setPresentationProduct] = useState<ProductRow | null>(null);
  const [batchProduct, setBatchProduct] = useState<ProductRow | null>(null);
  const [discounts, setDiscounts] = useState<ProductDiscountRow[]>([]);
  const [presentations, setPresentations] = useState<ProductPresentationRow[]>([]);
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [loadingPresentations, setLoadingPresentations] = useState(false);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [savingPresentation, setSavingPresentation] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [editingPresentationId, setEditingPresentationId] = useState<number | null>(null);
  const [batches, setBatches] = useState<ProductBatchRow[]>([]);
  const [discountForm, setDiscountForm] = useState({
    discountType: "percent" as "amount" | "percent",
    discountValue: "",
    startAt: "",
    endAt: "",
  });
  const [presentationForm, setPresentationForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    unitsFactor: "1",
    price: "0",
    isDefault: false,
  });
  const [batchForm, setBatchForm] = useState({
    batchCode: "",
    expirationDate: "",
    quantity: "1",
    unitCost: "0",
    reason: "Ingreso inicial",
  });
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    sizeLabel: "",
    cost: "0",
    price: "0",
    categoryId: "",
    stock: "0",
    sku: "",
    barcode: "",
    description: "",
    locationCode: "",
    expirationRequired: false,
    expirationDate: "",
    imageDataUrl: "",
    removeImage: false,
    branchId: String(user?.branchId || 1),
  });
  const [sizeMode, setSizeMode] = useState<"catalog" | "custom">("catalog");

  const isSuperadmin = user?.role === "superadmin";
  const canSelectBranch = isSuperadmin && multiBranchEnabled;
  const selectedBranchId = canSelectBranch ? Number(branchFilterId || 1) : Number(user?.branchId || 1);

  const fetchCategories = async (branchIdForQuery: number) => {
    if (!token) return;
    const branchQuery = canSelectBranch ? `?branchId=${branchIdForQuery}` : "";
    const categoriesData = await apiRequest(`/categories${branchQuery}`, { token });
    setCategories((categoriesData || []).filter((c: CategoryRow) => c.active));
  };

  const loadSystemAndBranches = async () => {
    if (!token) return;
    try {
      const system = await apiRequest("/settings/system", { token });
      const enabled = Boolean(system?.multiBranchEnabled);
      setMultiBranchEnabled(enabled);
      if (enabled && isSuperadmin) {
        const branchData = await apiRequest("/branches", { token });
        const active = (Array.isArray(branchData) ? branchData : []).filter((b: BranchRow) => b.active);
        setBranches(active);
      } else {
        setBranches([]);
      }
    } catch {
      setMultiBranchEnabled(false);
      setBranches([]);
    }
  };

  const loadAll = async () => {
    if (!token) return;
    try {
      const branchQuery = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      const [productsData, categoriesData, settingsData] = await Promise.all([
        apiRequest(`/products?includeInactive=1${canSelectBranch ? `&branchId=${selectedBranchId}` : ""}`, { token }),
        apiRequest(`/categories${branchQuery}`, { token }),
        apiRequest(`/settings/business${branchQuery}`, { token }),
      ]);
      setProducts(productsData);
      setCategories((categoriesData || []).filter((c: CategoryRow) => c.active));
      setLowStockThreshold(Number(settingsData?.lowStockThreshold ?? 20));
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron cargar productos");
    }
  };

  useEffect(() => {
    loadSystemAndBranches();
  }, [token, user?.role]);

  useEffect(() => {
    loadAll();
  }, [token, branchFilterId, multiBranchEnabled, user?.role]);

  useEffect(() => {
    setSelectedProductIds([]);
    setBulkTargetBranchId("");
  }, [branchFilterId, searchQuery]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return products.filter((product) => {
      const matchesQuery =
        product.name.toLowerCase().includes(query) ||
        (product.brand || "").toLowerCase().includes(query) ||
        (product.sizeLabel || "").toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query) ||
        (product.locationCode || "").toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);
      const matchesLowStock = !onlyLowStock || (product.active && product.stock <= lowStockThreshold);
      return matchesQuery && matchesLowStock;
    });
  }, [products, searchQuery, onlyLowStock, lowStockThreshold]);

  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedProductIds.includes(String(p.id)));

  const openDialog = (product?: ProductRow) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        brand: product.brand || "",
        sizeLabel: product.sizeLabel || "",
        cost: String(product.cost),
        price: String(product.price),
        categoryId: product.categoryId || "",
        stock: String(product.stock),
        sku: product.sku,
        barcode: product.barcode || "",
        description: product.description || "",
        locationCode: product.locationCode || "",
        expirationRequired: Boolean(product.expirationRequired),
        expirationDate: product.expirationDate ? String(product.expirationDate).slice(0, 10) : "",
        imageDataUrl: product.imageUrl || "",
        removeImage: false,
        branchId: String(selectedBranchId),
      });
      const existingSize = String(product.sizeLabel || "").trim();
      if (existingSize && !catalogSizeOptions.includes(existingSize)) {
        setSizeMode("custom");
      } else {
        setSizeMode("catalog");
      }
    } else {
      setEditingProduct(null);
      setFormData({
        name: "",
        brand: "",
        sizeLabel: "",
        cost: "0",
        price: "0",
        categoryId: categories[0] ? String(categories[0].id) : "",
        stock: "0",
        sku: `SKU-${Date.now()}`,
        barcode: "",
        description: "",
        locationCode: "",
        expirationRequired: false,
        expirationDate: "",
        imageDataUrl: "",
        removeImage: false,
        branchId: String(selectedBranchId),
      });
      setSizeMode("catalog");
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
      brand: formData.brand || null,
      ...(brandsAndSizesEnabled ? { sizeLabel: formData.sizeLabel || null } : {}),
      cost: Number(formData.cost),
      price: Number(formData.price),
      stock: Number(formData.stock),
      sku: formData.sku,
      barcode: formData.barcode || null,
      categoryId: formData.categoryId || null,
      description: formData.description || null,
      locationCode: formData.locationCode || null,
      ...(expirationsEnabled
        ? {
            expirationRequired: Boolean(formData.expirationRequired),
            expirationDate: formData.expirationDate || null,
          }
        : {}),
      imageDataUrl: formData.imageDataUrl.startsWith("data:image/") ? formData.imageDataUrl : null,
      removeImage: formData.removeImage,
      ...(canSelectBranch ? { branchId: Number(formData.branchId || selectedBranchId) } : {}),
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

  const onImageSelected = (file: File | null) => {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Solo se permite JPG o PNG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen debe ser menor a 2 MB");
      return;
    }
    setImageLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setFormData((prev) => ({
        ...prev,
        imageDataUrl: String(reader.result || ""),
        removeImage: false,
      }));
      setImageLoading(false);
      toast.success("Imagen cargada");
    };
    reader.onerror = () => {
      setImageLoading(false);
      toast.error("No se pudo leer la imagen");
    };
    reader.readAsDataURL(file);
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

  const openDiscountDialog = async (product: ProductRow) => {
    if (!token) return;
    setDiscountProduct(product);
    setShowDiscountDialog(true);
    setDiscountForm({
      discountType: "percent",
      discountValue: "",
      startAt: "",
      endAt: "",
    });
    setLoadingDiscounts(true);
    try {
      const query = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      const data = await apiRequest(`/products/${product.id}/discounts${query}`, { token });
      setDiscounts(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setDiscounts([]);
      toast.error(error?.message || "No se pudieron cargar descuentos");
    } finally {
      setLoadingDiscounts(false);
    }
  };

  const saveDiscount = async () => {
    if (!token || !discountProduct) return;
    const value = Number(discountForm.discountValue || 0);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Ingresa un valor de descuento valido");
      return;
    }
    if (!discountForm.startAt || !discountForm.endAt) {
      toast.error("Ingresa inicio y fin del descuento");
      return;
    }
    setSavingDiscount(true);
    try {
      await apiRequest(`/products/${discountProduct.id}/discounts`, {
        method: "POST",
        token,
        body: JSON.stringify({
          discountType: discountForm.discountType,
          discountValue: value,
          startAt: discountForm.startAt,
          endAt: discountForm.endAt,
          ...(canSelectBranch ? { branchId: selectedBranchId } : {}),
        }),
      });
      toast.success("Descuento programado");
      await openDiscountDialog(discountProduct);
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar descuento");
    } finally {
      setSavingDiscount(false);
    }
  };

  const removeDiscount = async (discountId: number) => {
    if (!token || !discountProduct) return;
    if (!confirm("Deseas desactivar este descuento?")) return;
    try {
      const query = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      await apiRequest(`/products/discounts/${discountId}${query}`, {
        method: "DELETE",
        token,
      });
      toast.success("Descuento desactivado");
      await openDiscountDialog(discountProduct);
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo desactivar descuento");
    }
  };

  const openPresentationDialog = async (product: ProductRow) => {
    if (!token) return;
    setPresentationProduct(product);
    setShowPresentationDialog(true);
    setEditingPresentationId(null);
    setPresentationForm({
      name: "",
      sku: "",
      barcode: "",
      unitsFactor: "1",
      price: String(product.price || 0),
      isDefault: false,
    });
    setLoadingPresentations(true);
    try {
      const query = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      const data = await apiRequest(`/products/${product.id}/presentations${query}`, { token });
      setPresentations(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setPresentations([]);
      toast.error(error?.message || "No se pudieron cargar presentaciones");
    } finally {
      setLoadingPresentations(false);
    }
  };

  const editPresentation = (row: ProductPresentationRow) => {
    setEditingPresentationId(row.id);
    setPresentationForm({
      name: row.name || "",
      sku: row.sku || "",
      barcode: row.barcode || "",
      unitsFactor: String(row.unitsFactor || 1),
      price: String(row.price || 0),
      isDefault: Boolean(row.isDefault),
    });
  };

  const resetPresentationForm = () => {
    setEditingPresentationId(null);
    setPresentationForm({
      name: "",
      sku: "",
      barcode: "",
      unitsFactor: "1",
      price: String(presentationProduct?.price || 0),
      isDefault: false,
    });
  };

  const savePresentation = async () => {
    if (!token || !presentationProduct) return;
    const unitsFactor = Number(presentationForm.unitsFactor || 0);
    const price = Number(presentationForm.price || 0);
    if (!presentationForm.name.trim()) {
      toast.error("Nombre de presentacion requerido");
      return;
    }
    if (!Number.isInteger(unitsFactor) || unitsFactor <= 0) {
      toast.error("Factor de unidades invalido");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Precio invalido");
      return;
    }

    setSavingPresentation(true);
    try {
      const payload = {
        name: presentationForm.name.trim(),
        sku: presentationForm.sku.trim() || null,
        barcode: presentationForm.barcode.trim() || null,
        unitsFactor,
        price,
        isDefault: presentationForm.isDefault,
        ...(canSelectBranch ? { branchId: selectedBranchId } : {}),
      };

      if (editingPresentationId) {
        await apiRequest(`/products/presentations/${editingPresentationId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(payload),
        });
        toast.success("Presentacion actualizada");
      } else {
        await apiRequest(`/products/${presentationProduct.id}/presentations`, {
          method: "POST",
          token,
          body: JSON.stringify(payload),
        });
        toast.success("Presentacion creada");
      }

      await openPresentationDialog(presentationProduct);
      await loadAll();
      resetPresentationForm();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar la presentacion");
    } finally {
      setSavingPresentation(false);
    }
  };

  const removePresentation = async (row: ProductPresentationRow) => {
    if (!token || !presentationProduct) return;
    if (!confirm(`Deseas desactivar la presentacion "${row.name}"?`)) return;
    try {
      const query = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      await apiRequest(`/products/presentations/${row.id}${query}`, {
        method: "DELETE",
        token,
      });
      toast.success("Presentacion desactivada");
      await openPresentationDialog(presentationProduct);
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo desactivar presentacion");
    }
  };

  const openBatchDialog = async (product: ProductRow) => {
    if (!token) return;
    if (!expirationsEnabled) {
      toast.error("Activa el modulo de caducidades/lotes en Configuracion");
      return;
    }
    setBatchProduct(product);
    setShowBatchDialog(true);
    setBatchForm({
      batchCode: "",
      expirationDate: product.expirationDate ? String(product.expirationDate).slice(0, 10) : "",
      quantity: "1",
      unitCost: String(product.cost || 0),
      reason: "Ingreso de lote",
    });
    setLoadingBatches(true);
    try {
      const query = canSelectBranch ? `?branchId=${selectedBranchId}` : "";
      const data = await apiRequest(`/products/${product.id}/batches${query}`, { token });
      setBatches(Array.isArray(data) ? data : []);
    } catch (error: any) {
      setBatches([]);
      toast.error(error?.message || "No se pudieron cargar lotes");
    } finally {
      setLoadingBatches(false);
    }
  };

  const saveBatch = async () => {
    if (!token || !batchProduct) return;
    const quantity = Number(batchForm.quantity || 0);
    const unitCost = Number(batchForm.unitCost || 0);
    if (!batchForm.batchCode.trim()) {
      toast.error("Codigo de lote requerido");
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Cantidad invalida");
      return;
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toast.error("Costo unitario invalido");
      return;
    }

    setSavingBatch(true);
    try {
      await apiRequest(`/products/${batchProduct.id}/batches`, {
        method: "POST",
        token,
        body: JSON.stringify({
          batchCode: batchForm.batchCode.trim(),
          expirationDate: batchForm.expirationDate || null,
          quantity,
          unitCost,
          reason: batchForm.reason || "Ingreso de lote",
          ...(canSelectBranch ? { branchId: selectedBranchId } : {}),
        }),
      });
      toast.success("Lote registrado");
      await openBatchDialog(batchProduct);
      await loadAll();
      setBatchForm((prev) => ({ ...prev, batchCode: "", quantity: "1" }));
    } catch (error: any) {
      toast.error(error?.message || "No se pudo registrar lote");
    } finally {
      setSavingBatch(false);
    }
  };

  const adjustBatch = async (batch: ProductBatchRow, movementType: "in" | "out" | "adjust") => {
    if (!token || !batchProduct) return;
    const qtyRaw = window.prompt(
      movementType === "out" ? "Cantidad a SALIR del lote:" : "Cantidad a ingresar/ajustar en lote:",
      "1"
    );
    if (qtyRaw === null) return;
    const quantity = Number(qtyRaw);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Cantidad invalida");
      return;
    }
    const reason = window.prompt("Motivo del movimiento:", movementType === "out" ? "Salida manual" : "Entrada manual");
    if (reason === null || !reason.trim()) {
      toast.error("Motivo requerido");
      return;
    }
    try {
      await apiRequest(`/products/batches/${batch.id}/adjust`, {
        method: "POST",
        token,
        body: JSON.stringify({
          movementType,
          quantity,
          reason: reason.trim(),
          ...(canSelectBranch ? { branchId: selectedBranchId } : {}),
        }),
      });
      toast.success("Movimiento aplicado");
      await openBatchDialog(batchProduct);
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo ajustar lote");
    }
  };

  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (!checked) {
      setSelectedProductIds((prev) => prev.filter((id) => !filteredProducts.some((p) => String(p.id) === id)));
      return;
    }
    const union = new Set(selectedProductIds);
    filteredProducts.forEach((p) => union.add(String(p.id)));
    setSelectedProductIds(Array.from(union));
  };

  const moveSelectedProducts = async () => {
    if (!token) return;
    if (!bulkTargetBranchId) {
      toast.error("Selecciona una sucursal destino");
      return;
    }
    if (!selectedProductIds.length) {
      toast.error("Selecciona al menos un producto");
      return;
    }

    try {
      const data = await apiRequest("/products/reassign-branch", {
        method: "POST",
        token,
        body: JSON.stringify({
          targetBranchId: Number(bulkTargetBranchId),
          productIds: selectedProductIds.map((id) => Number(id)),
        }),
      });
      toast.success(`Productos movidos: ${Number(data?.movedCount || 0)}`);
      setSelectedProductIds([]);
      setBulkTargetBranchId("");
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron mover productos");
    }
  };

  const totalProducts = products.length;
  const lowStock = products.filter((p) => p.stock <= lowStockThreshold && p.active).length;
  const totalValue = products.reduce(
    (sum, p) => (p.active ? sum + Number(p.discountedPrice || p.price || 0) * p.stock : sum),
    0
  );
  const totalCostValue = products.reduce((sum, p) => (p.active ? sum + p.cost * p.stock : sum), 0);

  const exportInventoryCsv = () => {
    const rows: Array<Array<unknown>> = [];
    rows.push(["INVENTARIO"]);
    rows.push(["Fecha", new Date().toLocaleString("es-GT")]);
    rows.push(["Productos listados", filteredProducts.length]);
    rows.push([]);
    rows.push([
      "Codigo de Barras",
      "Producto",
      "Marca",
      ...(brandsAndSizesEnabled ? ["Talla"] : []),
      "Ubicacion",
      ...(expirationsEnabled ? ["Caducidad"] : []),
      "Categoria",
      "Costo",
      "Precio",
      "Stock",
      "Total",
      "Estado",
    ]);
    filteredProducts.forEach((p) => {
      rows.push([
        p.barcode || "",
        p.name,
        p.brand || "",
        ...(brandsAndSizesEnabled ? [p.sizeLabel || ""] : []),
        p.locationCode || "",
        ...(expirationsEnabled
          ? [p.expirationRequired ? (p.expirationDate ? String(p.expirationDate).slice(0, 10) : "Sin fecha") : "No aplica"]
          : []),
        p.category,
        p.cost,
        Number(p.discountedPrice || p.price || 0),
        p.stock,
        Number(p.discountedPrice || p.price || 0) * p.stock,
        p.active ? "Activo" : "Inactivo",
      ]);
    });
    downloadCsv(`inventario_${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("Inventario exportado a Excel (CSV)");
  };

  const exportInventoryPdf = () => {
    const rows = filteredProducts
      .map(
        (p) =>
          `<tr><td>${p.name}</td><td>${p.brand || "-"}</td>${
            brandsAndSizesEnabled ? `<td>${p.sizeLabel || "-"}</td>` : ""
          }<td>${p.locationCode || "-"}</td>${
            expirationsEnabled
              ? `<td>${p.expirationRequired ? (p.expirationDate ? String(p.expirationDate).slice(0, 10) : "Sin fecha") : "No aplica"}</td>`
              : ""
          }<td>${p.category}</td><td>${formatCurrency(
            p.cost
          )}</td><td>${formatCurrency(Number(p.discountedPrice || p.price || 0))}</td><td>${p.stock}</td><td>${formatCurrency(
            Number(p.discountedPrice || p.price || 0) * p.stock
          )}</td></tr>`
      )
      .join("");
    const ok = printHtmlAsPdf(
      "Inventario",
      `
      <h1>Inventario</h1>
      <p class="meta">Fecha: ${new Date().toLocaleString("es-GT")} | Productos: ${filteredProducts.length}</p>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Marca</th>
            ${brandsAndSizesEnabled ? "<th>Talla</th>" : ""}
            <th>Ubicacion</th>
            ${expirationsEnabled ? "<th>Caducidad</th>" : ""}
            <th>Categoria</th>
            <th>Costo</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      `
    );
    if (!ok) {
      toast.error("El navegador bloqueó la ventana para imprimir PDF");
      return;
    }
    toast.success("Se abrió vista para guardar PDF");
  };

  const downloadImportTemplate = () => {
    const rows: Array<Array<unknown>> = [];
    rows.push([
      "sku",
      "nombre",
      "marca",
      ...(brandsAndSizesEnabled ? ["talla"] : []),
      "categoria",
      "precio_venta",
      "costo",
      "stock",
      "codigo_barras",
      "ubicacion",
      ...(expirationsEnabled ? ["requiere_caducidad", "fecha_caducidad"] : []),
      "descripcion",
      "activo",
    ]);
    rows.push([
      "CAF-001",
      "Cafe Americano",
      "Mi Marca",
      ...(brandsAndSizesEnabled ? ["M"] : []),
      "Cafeteria",
      35,
      15,
      100,
      "7501234567890",
      "A1",
      ...(expirationsEnabled ? ["false", ""] : []),
      "Cafe tradicional",
      "true",
    ]);
    rows.push([
      "",
      "Producto sin SKU manual",
      "Sin marca",
      ...(brandsAndSizesEnabled ? [""] : []),
      "Bebidas",
      12,
      6,
      50,
      "",
      "A2",
      ...(expirationsEnabled ? ["false", ""] : []),
      "Se genera SKU automatico",
      "true",
    ]);
    if (expirationsEnabled) {
      rows.push([
        "MED-001",
        "Jarabe Pediatrico",
        "Farmacia X",
        ...(brandsAndSizesEnabled ? [""] : []),
        "Medicamentos",
        45,
        22,
        25,
        "1234567890123",
        "F1",
        "true",
        "2027-12-31",
        "",
        "true",
      ]);
    }
    downloadCsv("plantilla_importacion_productos.csv", rows);
    toast.success("Plantilla descargada");
  };

  const normalizeHeader = (value: string) =>
    String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/_/g, "");

  const onImportCsvSelected = async (file: File | null) => {
    if (!token || !file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Solo se permite archivo CSV");
      return;
    }
    setImportLoading(true);
    try {
      const content = await file.text();
      const matrix = parseCsvText(content);
      if (matrix.length < 2) {
        toast.error("El CSV no contiene filas para importar");
        return;
      }

      const headerRow = matrix[0].map(normalizeHeader);
      const rows = matrix.slice(1).filter((r) => r.some((c) => String(c || "").trim()));

      const data = rows.map((row) => {
        const get = (aliases: string[]) => {
          const idx = headerRow.findIndex((h) => aliases.includes(h));
          return idx >= 0 ? String(row[idx] || "").trim() : "";
        };

        return {
          sku: get(["sku", "codigo", "codigointerno"]),
          name: get(["name", "nombre", "producto"]),
          brand: get(["brand", "marca"]),
          sizeLabel: get(["sizelabel", "size", "talla"]),
          category: get(["category", "categoria", "departamento"]),
          price: get(["price", "precioventa", "venta"]),
          cost: get(["cost", "preciocosto", "costo"]),
          stock: get(["stock", "existencia", "inventario"]),
          barcode: get(["barcode", "codigobarras", "ean"]),
          locationCode: get(["locationcode", "ubicacion", "ubicacioncodigo"]),
          expirationRequired: get(["expirationrequired", "requierecaducidad"]),
          expirationDate: get(["expirationdate", "fechacaducidad"]),
          description: get(["description", "descripcion"]),
          active: get(["active", "activo"]),
        };
      });

      const result = await apiRequest("/products/import", {
        method: "POST",
        token,
        body: JSON.stringify({
          rows: data,
          ...(canSelectBranch ? { branchId: Number(branchFilterId || selectedBranchId) } : {}),
        }),
      });

      toast.success(
        `Importacion completada. Creados: ${result.created || 0}, actualizados: ${result.updated || 0}, omitidos: ${result.skipped || 0}`
      );
      if (Array.isArray(result.issues) && result.issues.length) {
        const first = result.issues
          .slice(0, 5)
          .map((i: any) => `Fila ${i.row}: ${i.message}`)
          .join(" | ");
        toast.warning(`Algunas filas con problema: ${first}`);
      }
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo importar el archivo");
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="themed-page-header border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Gestion de Productos</h1>
            <p className="themed-page-header-muted text-sm">Administra tu catalogo de productos (datos reales)</p>
          </div>
          <Button onClick={() => openDialog()} size="lg" className="gap-2 border border-white/30 bg-white/15 text-white hover:bg-white/25">
            <Plus className="h-5 w-5" />
            Nuevo Producto
          </Button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportInventoryCsv}>
            Exportar Inventario Excel
          </Button>
          <Button variant="outline" onClick={exportInventoryPdf}>
            Exportar Inventario PDF
          </Button>
          <Button variant="outline" onClick={downloadImportTemplate}>
            Descargar Plantilla Importacion
          </Button>
          <Button variant="outline" onClick={() => importInputRef.current?.click()} disabled={importLoading}>
            {importLoading ? "Importando..." : "Importar Productos (CSV)"}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onImportCsvSelected(e.target.files?.[0] || null)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nombre, marca, SKU, codigo de barras o categoria..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
          {canSelectBranch && (
            <Select value={branchFilterId} onValueChange={setBranchFilterId}>
              <SelectTrigger className="w-72 h-11">
                <SelectValue placeholder="Selecciona sucursal" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white">
          <Checkbox checked={onlyLowStock} onCheckedChange={(checked) => setOnlyLowStock(Boolean(checked))} />
          <span>Solo stock bajo ({"<="} {lowStockThreshold})</span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
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
                <p className="text-xs text-gray-500 mt-1">Umbral: {lowStockThreshold}</p>
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

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Costo Inventario</p>
                <p className="text-3xl font-bold text-indigo-600 mt-1">{formatCurrency(totalCostValue)}</p>
              </div>
              <Package className="h-12 w-12 text-indigo-600" />
            </div>
          </Card>
        </div>

        {canSelectBranch && (
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
              <p className="text-sm text-gray-700">
                Productos seleccionados: <span className="font-semibold">{selectedProductIds.length}</span>
              </p>
              <Select value={bulkTargetBranchId} onValueChange={setBulkTargetBranchId}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Sucursal destino" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => String(b.id) !== String(selectedBranchId))
                    .map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={moveSelectedProducts} disabled={!selectedProductIds.length || !bulkTargetBranchId}>
                Mover seleccionados
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {canSelectBranch && <TableHead className="w-12">
                    <Checkbox checked={allFilteredSelected} onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))} />
                  </TableHead>}
                  <TableHead>SKU</TableHead>
                  <TableHead>Codigo de Barras</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Marca</TableHead>
                  {brandsAndSizesEnabled && <TableHead>Talla</TableHead>}
                  <TableHead>Ubicacion</TableHead>
                  {expirationsEnabled && <TableHead>Caducidad</TableHead>}
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Precio Venta</TableHead>
                  <TableHead className="text-center">Promo</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    {canSelectBranch && (
                      <TableCell>
                        <Checkbox
                          checked={selectedProductIds.includes(String(product.id))}
                          onCheckedChange={() => toggleSelectProduct(String(product.id))}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                    <TableCell className="font-mono text-sm">{product.barcode || "-"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold">{product.name}</p>
                        {product.brand && <p className="text-xs text-gray-500">Marca: {product.brand}</p>}
                        {brandsAndSizesEnabled && product.sizeLabel && (
                          <p className="text-xs text-gray-500">Talla: {product.sizeLabel}</p>
                        )}
                        {product.description && <p className="text-sm text-gray-500 line-clamp-1">{product.description}</p>}
                        {product.imageUrl && (
                          <img
                            src={resolveImageSrc(product.imageUrl)}
                            alt={product.name}
                            className="mt-2 h-10 w-10 rounded object-cover border"
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{product.brand || "-"}</TableCell>
                    {brandsAndSizesEnabled && <TableCell>{product.sizeLabel || "-"}</TableCell>}
                    <TableCell>
                      {product.locationCode ? (
                        <Badge variant="outline" className="font-mono">
                          {product.locationCode}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    {expirationsEnabled && (
                      <TableCell>
                        {product.expirationRequired ? (
                          <div>
                            <Badge variant="outline">Controlado</Badge>
                            <p className="text-xs text-gray-500 mt-1">
                              {product.expirationDate ? String(product.expirationDate).slice(0, 10) : "Sin fecha"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">No aplica</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="secondary">{product.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(product.cost)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {product.hasActiveDiscount ? (
                        <div>
                          <p className="font-bold text-blue-700">{formatCurrency(Number(product.discountedPrice || product.price))}</p>
                          <p className="text-xs text-gray-500 line-through">{formatCurrency(product.price)}</p>
                        </div>
                      ) : (
                        formatCurrency(product.price)
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {product.hasActiveDiscount ? (
                        <Badge className="bg-emerald-600">
                          {product.activeDiscountType === "percent"
                            ? `${Number(product.activeDiscountValue || 0)}%`
                            : formatCurrency(Number(product.activeDiscountValue || 0))}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={product.stock < 20 ? "text-orange-600 font-semibold" : ""}>{product.stock}</span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-indigo-700">{formatCurrency(product.cost * product.stock)}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatCurrency(Number(product.discountedPrice || product.price) * product.stock)}
                    </TableCell>
                    <TableCell className="text-center">
                      {product.active ? (
                        product.stock > lowStockThreshold ? (
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
                        <Button variant="ghost" size="sm" onClick={() => openDiscountDialog(product)}>
                          Descuento
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openPresentationDialog(product)}>
                          Presentaciones
                        </Button>
                        {expirationsEnabled && (
                          <Button variant="ghost" size="sm" onClick={() => openBatchDialog(product)}>
                            Lotes
                          </Button>
                        )}
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

      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Descuentos Programados {discountProduct ? `- ${discountProduct.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Tipo de descuento</Label>
                <Select
                  value={discountForm.discountType}
                  onValueChange={(value) =>
                    setDiscountForm((prev) => ({ ...prev, discountType: value as "amount" | "percent" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentaje</SelectItem>
                    <SelectItem value="amount">Monto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={discountForm.discountType === "percent" ? "100" : undefined}
                  value={discountForm.discountValue}
                  onChange={(e) => setDiscountForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                  placeholder={discountForm.discountType === "percent" ? "0 - 100" : "0.00"}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input
                  type="datetime-local"
                  value={discountForm.startAt}
                  onChange={(e) => setDiscountForm((prev) => ({ ...prev, startAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Fin</Label>
                <Input
                  type="datetime-local"
                  value={discountForm.endAt}
                  onChange={(e) => setDiscountForm((prev) => ({ ...prev, endAt: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveDiscount} disabled={savingDiscount}>
                {savingDiscount ? "Guardando..." : "Programar descuento"}
              </Button>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Descuentos del producto</p>
              {loadingDiscounts ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : discounts.length === 0 ? (
                <p className="text-sm text-gray-500">Sin descuentos programados.</p>
              ) : (
                <div className="space-y-2">
                  {discounts.map((row) => {
                    const now = Date.now();
                    const start = new Date(row.startAt).getTime();
                    const end = new Date(row.endAt).getTime();
                    const vigente = row.active && now >= start && now <= end;
                    return (
                      <div key={row.id} className="rounded border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            {row.discountType === "percent"
                              ? `${row.discountValue}%`
                              : formatCurrency(Number(row.discountValue || 0))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={vigente ? "default" : "secondary"}>
                              {vigente ? "Vigente" : row.active ? "Programado" : "Inactivo"}
                            </Badge>
                            {row.active && (
                              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removeDiscount(row.id)}>
                                Quitar
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(row.startAt).toLocaleString("es-GT")} - {new Date(row.endAt).toLocaleString("es-GT")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiscountDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPresentationDialog}
        onOpenChange={(open) => {
          setShowPresentationDialog(open);
          if (!open) {
            setEditingPresentationId(null);
            setPresentationProduct(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Presentaciones {presentationProduct ? `- ${presentationProduct.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={presentationForm.name}
                  onChange={(e) => setPresentationForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Unidad, Caja x12"
                />
              </div>
              <div className="space-y-2">
                <Label>Factor de unidades *</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={presentationForm.unitsFactor}
                  onChange={(e) => setPresentationForm((prev) => ({ ...prev, unitsFactor: e.target.value }))}
                  placeholder="1"
                />
              </div>
              <div className="space-y-2">
                <Label>Precio *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={presentationForm.price}
                  onChange={(e) => setPresentationForm((prev) => ({ ...prev, price: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU (opcional)</Label>
                <Input
                  value={presentationForm.sku}
                  onChange={(e) => setPresentationForm((prev) => ({ ...prev, sku: e.target.value }))}
                  placeholder="SKU de la presentacion"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Codigo de barras (opcional)</Label>
                <Input
                  value={presentationForm.barcode}
                  onChange={(e) => setPresentationForm((prev) => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Codigo de barras para esta presentacion"
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <Checkbox
                  checked={presentationForm.isDefault}
                  onCheckedChange={(checked) =>
                    setPresentationForm((prev) => ({ ...prev, isDefault: Boolean(checked) }))
                  }
                />
                <Label>Marcar como presentacion predeterminada</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {editingPresentationId && (
                <Button variant="outline" onClick={resetPresentationForm}>
                  Cancelar edicion
                </Button>
              )}
              <Button onClick={savePresentation} disabled={savingPresentation}>
                {savingPresentation
                  ? "Guardando..."
                  : editingPresentationId
                  ? "Guardar presentacion"
                  : "Agregar presentacion"}
              </Button>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Presentaciones del producto</p>
              {loadingPresentations ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : presentations.length === 0 ? (
                <p className="text-sm text-gray-500">Sin presentaciones registradas.</p>
              ) : (
                <div className="space-y-2">
                  {presentations.map((row) => (
                    <div key={row.id} className="rounded border p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {row.name} {row.isDefault ? "(Predeterminada)" : ""}
                          </p>
                          <p className="text-xs text-gray-500">
                            Factor: {row.unitsFactor} | Precio: {formatCurrency(Number(row.price || 0))}
                          </p>
                          <p className="text-xs text-gray-500">
                            SKU: {row.sku || "-"} | Codigo: {row.barcode || "-"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => editPresentation(row)}>
                            Editar
                          </Button>
                          {!row.isDefault && (
                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => removePresentation(row)}>
                              Quitar
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresentationDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {expirationsEnabled && (
        <Dialog
          open={showBatchDialog}
          onOpenChange={(open) => {
            setShowBatchDialog(open);
            if (!open) {
              setBatchProduct(null);
              setBatches([]);
            }
          }}
        >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Lotes {batchProduct ? `- ${batchProduct.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Codigo de lote *</Label>
                <Input
                  value={batchForm.batchCode}
                  onChange={(e) => setBatchForm((prev) => ({ ...prev, batchCode: e.target.value }))}
                  placeholder="Ej: LOT-2026-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha de caducidad</Label>
                <Input
                  type="date"
                  value={batchForm.expirationDate}
                  onChange={(e) => setBatchForm((prev) => ({ ...prev, expirationDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Cantidad *</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={batchForm.quantity}
                  onChange={(e) => setBatchForm((prev) => ({ ...prev, quantity: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Costo unitario *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={batchForm.unitCost}
                  onChange={(e) => setBatchForm((prev) => ({ ...prev, unitCost: e.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Motivo</Label>
                <Input
                  value={batchForm.reason}
                  onChange={(e) => setBatchForm((prev) => ({ ...prev, reason: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveBatch} disabled={savingBatch}>
                {savingBatch ? "Guardando..." : "Agregar lote"}
              </Button>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Lotes del producto</p>
              {loadingBatches ? (
                <p className="text-sm text-gray-500">Cargando...</p>
              ) : batches.length === 0 ? (
                <p className="text-sm text-gray-500">Sin lotes registrados.</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((row) => (
                    <div key={row.id} className="rounded border p-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{row.batchCode}</p>
                          <p className="text-xs text-gray-500">
                            Caduca: {row.expirationDate ? String(row.expirationDate).slice(0, 10) : "Sin fecha"}
                          </p>
                          <p className="text-xs text-gray-500">
                            Disponible: {row.quantityCurrent} / Inicial: {row.quantityInitial} / Costo: {formatCurrency(row.unitCost)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => adjustBatch(row, "in")}>
                            Entrada
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => adjustBatch(row, "out")}>
                            Salida
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
        </Dialog>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {canSelectBranch && (
              <div className="space-y-2">
                <Label>Sucursal *</Label>
                <Select
                  value={formData.branchId}
                  onValueChange={async (value) => {
                    setFormData({ ...formData, branchId: value, categoryId: "" });
                    await fetchCategories(Number(value || selectedBranchId));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Producto *</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Cafe Americano" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="brand">Marca (opcional)</Label>
              <Input
                id="brand"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="Ej: Nike, Adidas, Levi's"
              />
            </div>

            {brandsAndSizesEnabled && (
              <div className="space-y-2">
                <Label htmlFor="sizeLabel">Talla (opcional)</Label>
                <p className="text-xs text-gray-500">Catalogo de tallas para rubro: {storeVertical}</p>
                {sizeMode === "catalog" ? (
                  <Select
                    value={formData.sizeLabel || "__none__"}
                    onValueChange={(value) => {
                      if (value === "__custom__") {
                        setSizeMode("custom");
                        setFormData({ ...formData, sizeLabel: "" });
                        return;
                      }
                      setFormData({ ...formData, sizeLabel: value === "__none__" ? "" : value });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona talla" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin talla</SelectItem>
                      {catalogSizeOptions.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Otra talla...</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-2">
                    <Input
                      id="sizeLabel"
                      value={formData.sizeLabel}
                      onChange={(e) => setFormData({ ...formData, sizeLabel: e.target.value })}
                      placeholder="Ej: 37.5, 4XL, Unitalla"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setSizeMode("catalog")}>
                      Usar catalogo de tallas
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sku">SKU *</Label>
              <Input id="sku" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} placeholder="Ej: CAF-001" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode">Codigo de Barras (opcional)</Label>
              <Input id="barcode" value={formData.barcode} onChange={(e) => setFormData({ ...formData, barcode: e.target.value })} placeholder="Ej: 7501234567890" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationCode">Ubicacion (opcional)</Label>
              <Input
                id="locationCode"
                value={formData.locationCode}
                onChange={(e) => setFormData({ ...formData, locationCode: e.target.value })}
                placeholder="Ej: A1, A2, BODEGA-01"
                maxLength={40}
              />
            </div>

            {expirationsEnabled && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={Boolean(formData.expirationRequired)}
                    onCheckedChange={(checked) => setFormData({ ...formData, expirationRequired: Boolean(checked) })}
                  />
                  <Label>Requiere control de caducidad</Label>
                </div>
                {formData.expirationRequired && (
                  <div className="space-y-2">
                    <Label htmlFor="expirationDate">Fecha de caducidad (opcional)</Label>
                    <Input
                      id="expirationDate"
                      type="date"
                      value={formData.expirationDate}
                      onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

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
              <Label>Categoria *</Label>
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

            <div className="space-y-2">
              <Label>Imagen del producto (opcional)</Label>
              <Input type="file" accept="image/png,image/jpeg" onChange={(e) => onImageSelected(e.target.files?.[0] || null)} />
              {imageLoading && <p className="text-xs text-gray-500">Procesando imagen...</p>}
              {formData.imageDataUrl && !formData.removeImage && (
                <img src={resolveImageSrc(formData.imageDataUrl)} alt="Vista previa" className="h-20 w-20 rounded border object-cover" />
              )}
              {formData.imageDataUrl && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormData((prev) => ({ ...prev, imageDataUrl: "", removeImage: true }))}
                >
                  Quitar imagen
                </Button>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct} disabled={imageLoading}>
              {imageLoading ? "Procesando imagen..." : editingProduct ? "Guardar Cambios" : "Crear Producto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
