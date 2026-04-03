import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, Minus, Trash2, CreditCard, DollarSign, Smartphone, Package, ShoppingCart, Eye, Camera } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../components/ui/dialog";
import { type Product, type ProductPresentation } from "../store/data";
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
  subtotal?: number;
  discount?: number;
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
  subtotal?: number;
  discount?: number;
  total: number;
  payment_status: "pending" | "completed" | "cancelled" | "refunded";
  taken_by?: string | null;
  items: PendingTicketItem[];
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

function todayIso() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function POS() {
  const creditEnabled = false; // Habilitar cuando exista módulo de clientes y selector de cliente.
  const { token, user } = useAuth();
  const uploadsBase =
    (import.meta.env.VITE_API_URL || "http://localhost:4000/api").replace(/\/api\/?$/, "");
  const resolveImageSrc = (raw?: string) => {
    if (!raw) return "";
    if (raw.startsWith("data:image/")) return raw;
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    if (raw.startsWith("/uploads/")) return `${uploadsBase}${raw}`;
    return raw;
  };
  const getProductImage = (product: Product) =>
    resolveImageSrc((product as any).imageUrl || product.image || "");
  const getProductUnitPrice = (product: Product) => Number((product as any).discountedPrice ?? product.price ?? 0);
  const getActivePresentations = (product: Product): ProductPresentation[] => {
    const raw = Array.isArray((product as any).presentations) ? ((product as any).presentations as ProductPresentation[]) : [];
    return raw.filter((presentation) => presentation && presentation.active !== false);
  };
  const getDefaultPresentation = (product: Product): ProductPresentation | null => {
    const options = getActivePresentations(product);
    if (!options.length) return null;
    return options.find((presentation) => presentation.isDefault) || options[0];
  };
  const getPresentationUnitPrice = (product: Product, presentation?: ProductPresentation | null) => {
    if (!presentation) return getProductUnitPrice(product);
    const basePrice = Number(presentation.price || 0);
    const hasDiscount = Boolean((product as any).hasActiveDiscount);
    const discountType = String((product as any).activeDiscountType || "");
    const discountValue = Number((product as any).activeDiscountValue || 0);
    if (!hasDiscount) return basePrice;
    if (discountType === "percent") {
      return Math.max(0, Number((basePrice - (basePrice * discountValue) / 100).toFixed(2)));
    }
    if (discountType === "amount") {
      return Math.max(0, Number((basePrice - discountValue).toFixed(2)));
    }
    return basePrice;
  };
  interface PosCartItem {
    product: Product;
    quantity: number;
    subtotal: number;
    presentationId?: number;
    presentationName?: string;
    unitsFactor?: number;
    unitPrice: number;
    stockUnits: number;
  }
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>(["Todos"]);
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "credit">("cash");
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [hasOpenCashSession, setHasOpenCashSession] = useState(false);
  const [pendingTickets, setPendingTickets] = useState<PendingTicketRow[]>([]);
  const [loadingPendingTickets, setLoadingPendingTickets] = useState(false);
  const [showPendingTicketDialog, setShowPendingTicketDialog] = useState(false);
  const [selectedPendingTicket, setSelectedPendingTicket] = useState<PendingTicketDetail | null>(null);
  const [pendingTicketPaymentMethod, setPendingTicketPaymentMethod] = useState<"cash" | "card" | "transfer" | "credit">("cash");
  const [pendingDiscountType, setPendingDiscountType] = useState<"amount" | "percent">("amount");
  const [pendingDiscountValue, setPendingDiscountValue] = useState("");
  const [operationsTab, setOperationsTab] = useState<"tickets" | "movements">("tickets");
  const [showScannerDialog, setShowScannerDialog] = useState(false);
  const [scannerError, setScannerError] = useState("");
  const [scannerEngine, setScannerEngine] = useState<"native" | "zxing" | "manual">("manual");
  const [manualScannerCode, setManualScannerCode] = useState("");
  const [isScannerSupported, setIsScannerSupported] = useState(true);
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [movementType, setMovementType] = useState<"in" | "out">("in");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementNotes, setMovementNotes] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [cashMovements, setCashMovements] = useState<CashMovementRow[]>([]);
  const [showCashMovementDialog, setShowCashMovementDialog] = useState(false);
  const [highlightTicketsTab, setHighlightTicketsTab] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [previewImageName, setPreviewImageName] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<any>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const keyboardScannerBufferRef = useRef("");
  const keyboardScannerTimerRef = useRef<number | null>(null);
  const keyboardScannerLastKeyAtRef = useRef(0);
  const codeHandledRef = useRef(false);
  const prevPendingCountRef = useRef(0);
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

  const fetchCashMovements = async () => {
    if (!token || !canChargeSales) {
      setCashMovements([]);
      return;
    }
    try {
      const day = todayIso();
      const data = await apiRequest(`/cash/movements?from=${day}&to=${day}`, { token });
      setCashMovements(Array.isArray(data) ? data.slice(0, 8) : []);
    } catch {
      setCashMovements([]);
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
    fetchCashMovements();
  }, [token, canChargeSales]);

  useEffect(() => {
    if (!token || !canChargeSales) return;
    const intervalId = window.setInterval(() => {
      fetchPendingTickets();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [token, canChargeSales]);

  useEffect(() => {
    const previous = prevPendingCountRef.current;
    const current = pendingTickets.length;
    if (current > previous && operationsTab !== "tickets") {
      setHighlightTicketsTab(true);
    }
    if (current === 0) {
      setHighlightTicketsTab(false);
    }
    prevPendingCountRef.current = current;
  }, [pendingTickets.length, operationsTab]);

  const stopScanner = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop();
      } catch {
        // Ignorar errores al detener ZXing.
      }
      zxingControlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScannerActive(false);
  };

  const findSingleProductByExactCode = (value: string) => {
    const code = String(value || "").trim();
    if (!code) return null;

    const normalized = code.toLowerCase();
    const exactBarcodeMatches = products.filter(
      (product) => String(product.barcode || "").trim().toLowerCase() === normalized
    );
    const exactSkuMatches = products.filter((product) => String(product.sku || "").trim().toLowerCase() === normalized);
    return exactBarcodeMatches.length === 1 ? exactBarcodeMatches[0] : exactSkuMatches.length === 1 ? exactSkuMatches[0] : null;
  };

  const applyScannedCode = (value: string) => {
    const code = String(value || "").trim();
    if (!code) return false;
    const singleMatch = findSingleProductByExactCode(code);
    if (singleMatch) {
      addToCart(singleMatch);
      return true;
    }

    setSearchQuery(code);
    return false;
  };

  const onCodeCaptured = (value: string) => {
    const code = String(value || "").trim();
    if (!code || codeHandledRef.current) return;
    codeHandledRef.current = true;
    const added = applyScannedCode(code);
    setShowScannerDialog(false);
    if (!added) {
      toast.success(`Codigo detectado: ${code}`);
    }
  };

  const startScanner = async () => {
    setScannerError("");
    setManualScannerCode("");
    setScannerEngine("manual");
    codeHandledRef.current = false;

    if (!window.isSecureContext) {
      setIsScannerSupported(false);
      setScannerError("La camara en telefono requiere HTTPS. En iPhone/Android por http://IP puede fallar.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setIsScannerSupported(false);
      setScannerError("Este navegador no permite acceso a camara. Usa captura manual.");
      return;
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector;
    const startWithZxing = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (!videoRef.current) {
          setScannerError("No se pudo inicializar el video de la camara.");
          return;
        }
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || codeHandledRef.current) return;
          const raw = String(result.getText?.() || "").trim();
          if (raw) onCodeCaptured(raw);
        });
        zxingControlsRef.current = controls;
        setIsScannerSupported(true);
        setScannerEngine("zxing");
        setIsScannerActive(true);
      } catch {
        setIsScannerSupported(false);
        setScannerError("No se pudo escanear con camara en este navegador. Usa captura manual.");
      }
    };

    if (!BarcodeDetectorCtor) {
      await startWithZxing();
      return;
    }
    setIsScannerSupported(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      let detector: any;
      try {
        detector = new BarcodeDetectorCtor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
        });
      } catch {
        detector = new BarcodeDetectorCtor();
      }

      setScannerEngine("native");
      setIsScannerActive(true);
      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || codeHandledRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const detections = await detector.detect(videoRef.current);
          if (!detections?.length) return;
          const raw = String(detections[0]?.rawValue || "").trim();
          if (raw) onCodeCaptured(raw);
        } catch {
          // Ignorar errores intermitentes de deteccion.
        }
      }, 320);
    } catch {
      // Fallback a ZXing para navegadores donde falla BarcodeDetector.
      stopScanner();
      await startWithZxing();
    }
  };

  useEffect(() => {
    if (showScannerDialog) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => {
      stopScanner();
    };
  }, [showScannerDialog]);

  useEffect(() => {
    if (showPaymentDialog || showPendingTicketDialog || showCashMovementDialog || showScannerDialog) return;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(focusTimer);
  }, [showPaymentDialog, showPendingTicketDialog, showCashMovementDialog, showScannerDialog]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      if (element.isContentEditable) return true;
      const tag = element.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
    };

    const flushScannerBuffer = () => {
      const code = keyboardScannerBufferRef.current.trim();
      if (!code) return;
      applyScannedCode(code);
      searchInputRef.current?.focus();
    };

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (showScannerDialog) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key;
      const isPrintable = key.length === 1;
      const isCommit = key === "Enter";
      const isErase = key === "Backspace";
      if (!isPrintable && !isCommit && !isErase) return;

      const now = Date.now();
      if (now - keyboardScannerLastKeyAtRef.current > 150) {
        keyboardScannerBufferRef.current = "";
      }
      keyboardScannerLastKeyAtRef.current = now;

      if (isPrintable) {
        keyboardScannerBufferRef.current += key;
        if (keyboardScannerTimerRef.current) {
          window.clearTimeout(keyboardScannerTimerRef.current);
        }
        keyboardScannerTimerRef.current = window.setTimeout(() => {
          flushScannerBuffer();
          keyboardScannerBufferRef.current = "";
        }, 120);
        return;
      }

      if (isErase && keyboardScannerBufferRef.current) {
        keyboardScannerBufferRef.current = keyboardScannerBufferRef.current.slice(0, -1);
        setSearchQuery(keyboardScannerBufferRef.current);
        event.preventDefault();
        return;
      }

      if (isCommit) {
        if (keyboardScannerTimerRef.current) {
          window.clearTimeout(keyboardScannerTimerRef.current);
          keyboardScannerTimerRef.current = null;
        }
        flushScannerBuffer();
        keyboardScannerBufferRef.current = "";
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      if (keyboardScannerTimerRef.current) {
        window.clearTimeout(keyboardScannerTimerRef.current);
        keyboardScannerTimerRef.current = null;
      }
    };
  }, [showScannerDialog]);

  const hasSearchQuery = searchQuery.trim().length > 0;

  const filteredProducts = useMemo(() => {
    if (!hasSearchQuery) return [];
    return products.filter((product) => {
      const matchesCategory = selectedCategory === "Todos" || product.category === selectedCategory;
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        product.name.toLowerCase().includes(query) ||
        (product.brand || "").toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        (product.locationCode || "").toLowerCase().includes(query) ||
        (product.barcode || "").toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery, hasSearchQuery]);

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.subtotal, 0), [cart]);
  const discountNumeric = Number(discountValue || 0);
  const computedDiscount =
    discountType === "percent"
      ? Number(((cartTotal * Math.max(0, Math.min(100, discountNumeric))) / 100).toFixed(2))
      : Number(Math.max(0, discountNumeric).toFixed(2));
  const finalTotal = Number(Math.max(0, cartTotal - computedDiscount).toFixed(2));
  const receivedAmount = Number(cashReceived || 0);
  const cashChange = Math.max(0, receivedAmount - finalTotal);
  const missingAmount = Math.max(0, finalTotal - receivedAmount);

  const pendingSubtotal = Number(selectedPendingTicket?.subtotal || selectedPendingTicket?.total || 0);
  const pendingDiscountNumeric = Number(pendingDiscountValue || 0);
  const pendingComputedDiscount =
    pendingDiscountType === "percent"
      ? Number(((pendingSubtotal * Math.max(0, Math.min(100, pendingDiscountNumeric))) / 100).toFixed(2))
      : Number(Math.max(0, pendingDiscountNumeric).toFixed(2));
  const pendingFinalTotal = Number(Math.max(0, pendingSubtotal - pendingComputedDiscount).toFixed(2));

  const addToCart = (product: Product, presentation?: ProductPresentation | null) => {
    const selectedPresentation = presentation || getDefaultPresentation(product);
    const unitsFactor = Math.max(1, Number(selectedPresentation?.unitsFactor || 1));
    const unitPrice = getPresentationUnitPrice(product, selectedPresentation);
    const presentationId = selectedPresentation ? Number(selectedPresentation.id) : undefined;
    const existingItem = cart.find(
      (item) => item.product.id === product.id && Number(item.presentationId || 0) === Number(presentationId || 0)
    );
    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id && Number(item.presentationId || 0) === Number(presentationId || 0)
            ? {
                ...item,
                quantity: item.quantity + 1,
                subtotal: (item.quantity + 1) * unitPrice,
                stockUnits: (item.quantity + 1) * unitsFactor,
              }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          product,
          quantity: 1,
          subtotal: unitPrice,
          presentationId,
          presentationName: selectedPresentation?.name || "Unidad",
          unitsFactor,
          unitPrice,
          stockUnits: unitsFactor,
        },
      ]);
    }
    setSearchQuery("");
    toast.success(`${product.name} agregado (${selectedPresentation?.name || "Unidad"})`);
  };

  const updateQuantity = (productId: string, presentationId: number | undefined, delta: number) => {
    setCart(
      cart.map((item) => {
        if (item.product.id === productId && Number(item.presentationId || 0) === Number(presentationId || 0)) {
          const newQuantity = Math.max(1, item.quantity + delta);
          const unitsFactor = Math.max(1, Number(item.unitsFactor || 1));
          return {
            ...item,
            quantity: newQuantity,
            subtotal: newQuantity * Number(item.unitPrice || 0),
            stockUnits: newQuantity * unitsFactor,
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId: string, presentationId: number | undefined) => {
    setCart(
      cart.filter(
        (item) => !(item.product.id === productId && Number(item.presentationId || 0) === Number(presentationId || 0))
      )
    );
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
    const normalizedDiscountValue =
      discountType === "percent"
        ? Math.min(100, Math.max(0, Number(discountValue || 0)))
        : Math.max(0, Number(discountValue || 0));

    try {
      await apiRequest("/sales", {
        method: "POST",
        token,
        body: JSON.stringify({
          chargeNow,
          paymentMethod,
          discountType,
          discountValue: normalizedDiscountValue,
          items: cart.map((item) => ({
            productId: Number(item.product.id),
            quantity: item.quantity,
            presentationId: item.presentationId || undefined,
          })),
        }),
      });

      setProducts((prev) =>
        prev.map((p) => {
          const soldStockUnits = cart
            .filter((i) => i.product.id === p.id)
            .reduce((sum, item) => sum + Number(item.stockUnits || item.quantity || 0), 0);
          return soldStockUnits > 0 ? { ...p, stock: Math.max(0, p.stock - soldStockUnits) } : p;
        })
      );

      if (chargeNow) {
        toast.success(`Venta completada por ${formatCurrency(finalTotal)} - ${paymentMethod.toUpperCase()}`);
      } else {
        toast.success("Pedido registrado en estado pendiente de cobro");
        fetchPendingTickets();
      }
      setCart([]);
      setShowPaymentDialog(false);
      setPaymentMethod("cash");
      setDiscountType("amount");
      setDiscountValue("");
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
      setPendingDiscountType("amount");
      setPendingDiscountValue("");
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
    const normalizedDiscountValue =
      pendingDiscountType === "percent"
        ? Math.min(100, Math.max(0, Number(pendingDiscountValue || 0)))
        : Math.max(0, Number(pendingDiscountValue || 0));

    try {
      await apiRequest(`/sales/${selectedPendingTicket.id}/charge`, {
        method: "POST",
        token,
        body: JSON.stringify({
          paymentMethod: pendingTicketPaymentMethod,
          discountType: pendingDiscountType,
          discountValue: normalizedDiscountValue,
        }),
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

  const registerCashMovement = async () => {
    if (!token) return false;
    const amount = Number(movementAmount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Monto invalido");
      return false;
    }
    if (!movementReason.trim()) {
      toast.error("Motivo requerido");
      return false;
    }
    if (!hasOpenCashSession) {
      toast.error("Debes abrir caja para registrar movimientos");
      return false;
    }

    setSavingMovement(true);
    try {
      await apiRequest("/cash/movements", {
        method: "POST",
        token,
        body: JSON.stringify({
          movementType,
          amount,
          reason: movementReason.trim(),
          notes: movementNotes.trim() || null,
        }),
      });
      toast.success(movementType === "in" ? "Entrada registrada" : "Salida registrada");
      setMovementAmount("");
      setMovementReason("");
      setMovementNotes("");
      await fetchCashMovements();
      return true;
    } catch (error: any) {
      toast.error(error?.message || "No se pudo registrar movimiento");
      return false;
    } finally {
      setSavingMovement(false);
    }
  };

  return (
    <div className="min-h-full lg:h-full flex flex-col lg:flex-row bg-gray-50">
      <div className="order-2 flex-1 flex flex-col min-w-0 lg:order-1 lg:min-h-0">
        <div className="section-card themed-page-header border-b px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white sm:text-2xl">Punto de Venta</h1>
              <p className="themed-page-header-muted text-sm">
                Carrito activo con {cart.length} producto{cart.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {canChargeSales && !hasOpenCashSession && (
                <Button variant="outline" onClick={openCashSession}>
                  Abrir Caja
                </Button>
              )}
              <Badge variant="secondary" className="text-sm px-3 py-1">
                <span className="text-xs sm:text-sm uppercase tracking-wide">Total parcial</span>
                <span className="ml-2 text-lg sm:text-xl font-extrabold">{formatCurrency(cartTotal)}</span>
              </Badge>
            </div>
          </div>
        </div>

        <ScrollArea className="p-4 sm:p-6 lg:flex-1">
          {cart.length === 0 ? (
            <div className="text-center py-14">
              <ShoppingCart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">El carrito esta vacio</p>
              <p className="text-sm text-gray-400 mt-2">Busca un producto en el panel derecho para empezar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <Card key={`${item.product.id}-${item.presentationId || 0}`} className="section-card p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex items-start gap-3">
                      {getProductImage(item.product) && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewImageUrl(getProductImage(item.product));
                            setPreviewImageName(item.product.name);
                          }}
                          className="flex-shrink-0"
                        >
                          <img
                            src={getProductImage(item.product)}
                            alt={item.product.name}
                            className="h-16 w-16 rounded-lg border-2 border-gray-200 object-cover shadow-sm"
                          />
                        </button>
                      )}
                      <div className="min-w-0">
                        <h4 className="font-semibold">{item.product.name}</h4>
                        <p className="text-sm text-gray-500">{item.presentationName || "Unidad"}</p>
                        <p className="text-xs text-gray-500">{item.product.sku}</p>
                        {item.product.locationCode && (
                          <p className="text-xs font-mono text-gray-500">Ubicacion: {item.product.locationCode}</p>
                        )}
                        <p className="text-sm text-gray-500">{formatCurrency(item.unitPrice)} por {String(item.presentationName || "unidad").toLowerCase()}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFromCart(item.product.id, item.presentationId)}
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.product.id, item.presentationId, -1)} className="h-8 w-8">
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-10 text-center font-semibold">{item.quantity}</span>
                      <Button variant="outline" size="icon" onClick={() => updateQuantity(item.product.id, item.presentationId, 1)} className="h-8 w-8">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <span className="font-bold text-blue-600">{formatCurrency(item.subtotal)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}          {canChargeSales && (
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={operationsTab === "tickets" ? "default" : "outline"}
                  onClick={() => {
                    setOperationsTab("tickets");
                    setHighlightTicketsTab(false);
                  }}
                  className={`relative ${highlightTicketsTab ? "animate-pulse ring-2 ring-red-400" : ""}`}
                >
                  Tickets
                  {pendingTickets.length > 0 && (
                    <span className={`ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs text-white ${highlightTicketsTab ? "animate-pulse" : ""}`}>
                      {pendingTickets.length}
                    </span>
                  )}
                </Button>
                <Button
                  type="button"
                  variant={operationsTab === "movements" ? "default" : "outline"}
                  onClick={() => setOperationsTab("movements")}
                >
                  Movimientos
                </Button>
              </div>

              {operationsTab === "tickets" ? (
                <div>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-gray-900">Tickets Pendientes</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchPendingTickets}
                      className="w-full self-start sm:w-auto sm:self-auto"
                    >
                      Actualizar
                    </Button>
                  </div>

                  {loadingPendingTickets ? (
                    <Card className="section-card p-4">
                      <p className="text-sm text-gray-500">Cargando tickets pendientes...</p>
                    </Card>
                  ) : pendingTickets.length === 0 ? (
                    <Card className="section-card p-4">
                      <p className="text-sm text-gray-500">No hay tickets pendientes por cobrar.</p>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {pendingTickets.map((ticket) => (
                        <Card key={ticket.id} className="section-card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{ticket.sale_number}</p>
                              <p className="text-xs text-gray-500">
                                Enviado por: {ticket.taken_by || "Usuario"} � {new Date(ticket.sale_date).toLocaleString("es-GT")}
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
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">Movimientos de Efectivo</h3>
                    <Button onClick={() => setShowCashMovementDialog(true)} disabled={!hasOpenCashSession}>
                      Entrada/Salida
                    </Button>
                  </div>
                  {!hasOpenCashSession && <p className="mb-2 text-xs text-amber-700">Debes abrir caja para registrar movimientos.</p>}

                  <Card className="section-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold">Movimientos de hoy</p>
                      <Button size="sm" variant="outline" onClick={fetchCashMovements}>
                        Actualizar
                      </Button>
                    </div>
                    {cashMovements.length === 0 ? (
                      <p className="text-sm text-gray-500">Sin movimientos registrados hoy.</p>
                    ) : (
                      <div className="space-y-2">
                        {cashMovements.map((m) => (
                          <div key={m.id} className="rounded-md border p-2 text-sm">
                            <div className="flex items-center justify-between gap-2">
                              <Badge className={m.movementType === "in" ? "bg-green-600" : "bg-red-600"}>
                                {m.movementType === "in" ? "Entrada" : "Salida"}
                              </Badge>
                              <span className="font-semibold">{formatCurrency(Number(m.amount || 0))}</span>
                            </div>
                            <p className="mt-1 text-gray-700">{m.reason}</p>
                            <p className="text-xs text-gray-500">{new Date(m.createdAt).toLocaleString("es-GT")}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-4 space-y-4 bg-gray-50">
          <div className="rounded-lg border bg-white p-3 sm:p-4">
            <div className="flex items-end justify-between gap-3">
              <span className="text-base sm:text-lg font-semibold text-gray-700">Subtotal:</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-blue-700">{formatCurrency(cartTotal)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Button
              onClick={() => {
                if (canChargeSales) {
                  setDiscountType("amount");
                  setDiscountValue("");
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

      <aside className="order-1 mt-0 w-full border-b bg-white shadow-xl lg:order-2 lg:mt-0 lg:w-[420px] lg:border-b-0 lg:border-l lg:border-t-0 flex flex-col max-h-[55vh] lg:max-h-none">
        <div className="themed-page-header px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-bold">Buscar Productos</h2>
          </div>
          <p className="themed-page-header-muted text-sm">Encuentra por nombre, SKU o código de barras y agrégalos al carrito</p>
        </div>
        <div className="p-4 border-b">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Search className="h-5 w-5 text-gray-400" />
            </span>
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Buscar productos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const added = applyScannedCode(searchQuery);
                if (added) {
                  e.preventDefault();
                }
              }}
              className="h-11 pl-10 pr-12"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2"
              onClick={() => setShowScannerDialog(true)}
            >
              <Camera className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className={`${hasSearchQuery ? "block" : "hidden"} lg:block`}>
        <div className="p-4 border-b pt-3">
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
                <Card key={product.id} className="section-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      {getProductImage(product) && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewImageUrl(getProductImage(product));
                            setPreviewImageName(product.name);
                          }}
                          className="flex-shrink-0"
                        >
                          <img
                            src={getProductImage(product)}
                            alt={product.name}
                            className="h-16 w-16 rounded-lg border-2 border-gray-200 object-cover shadow-sm"
                          />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight">{product.name}</p>
                        {product.brand && <p className="text-xs text-gray-500">{product.brand}</p>}
                        <p className="text-xs text-gray-500 mt-1">{product.sku}</p>
                        {product.locationCode && (
                          <p className="text-xs font-mono text-gray-500">Ubicacion: {product.locationCode}</p>
                        )}
                        {Boolean((product as any).hasActiveDiscount) ? (
                          <div className="mt-2">
                            <p className="text-sm font-bold text-blue-600">{formatCurrency(getProductUnitPrice(product))}</p>
                            <p className="text-xs text-gray-500 line-through">{formatCurrency(product.price)}</p>
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-blue-600 mt-2">{formatCurrency(product.price)}</p>
                        )}
                      </div>
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
                  {getActivePresentations(product).length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getActivePresentations(product).map((presentation) => (
                        <Button
                          key={`${product.id}-${presentation.id}`}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addToCart(product, presentation)}
                        >
                          {presentation.name} · {formatCurrency(getPresentationUnitPrice(product, presentation))}
                        </Button>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
        </div>
      </aside>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center p-6 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Total a pagar</p>
              <p className="text-3xl font-bold text-blue-600">{formatCurrency(finalTotal)}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-600">
                <p>Subtotal: {formatCurrency(cartTotal)}</p>
                <p>Descuento: {formatCurrency(computedDiscount)}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-3">Metodo de pago:</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Descuento</p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={discountType === "amount" ? "default" : "outline"} onClick={() => setDiscountType("amount")}>
                  Monto
                </Button>
                <Button type="button" variant={discountType === "percent" ? "default" : "outline"} onClick={() => setDiscountType("percent")}>
                  Porcentaje
                </Button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={discountType === "percent" ? "100" : undefined}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percent" ? "0 - 100" : "0.00"}
              />
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
            <Button onClick={() => processPayment(true)} disabled={paymentMethod === "cash" && receivedAmount < finalTotal}>
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
                <div className="flex justify-between text-sm">
                  <span className="font-semibold">Subtotal ticket:</span>
                  <span>{formatCurrency(pendingSubtotal)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="font-semibold">Descuento actual:</span>
                  <span>{formatCurrency(Number(selectedPendingTicket.discount || 0))}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="font-semibold">Total ticket:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(Number(selectedPendingTicket.total || 0))}</span>
                </div>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">Descuento al cobrar</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={pendingDiscountType === "amount" ? "default" : "outline"} onClick={() => setPendingDiscountType("amount")}>
                    Monto
                  </Button>
                  <Button type="button" variant={pendingDiscountType === "percent" ? "default" : "outline"} onClick={() => setPendingDiscountType("percent")}>
                    Porcentaje
                  </Button>
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={pendingDiscountType === "percent" ? "100" : undefined}
                  value={pendingDiscountValue}
                  onChange={(e) => setPendingDiscountValue(e.target.value)}
                  placeholder={pendingDiscountType === "percent" ? "0 - 100" : "0.00"}
                />
                <div className="flex justify-between text-sm">
                  <span>Total con descuento:</span>
                  <span className="font-semibold">{formatCurrency(pendingFinalTotal)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Metodo de cobro:</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      <Dialog open={showCashMovementDialog} onOpenChange={setShowCashMovementDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Entrada/Salida</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={movementType === "in" ? "default" : "outline"} onClick={() => setMovementType("in")}>
                Entrada
              </Button>
              <Button type="button" variant={movementType === "out" ? "default" : "outline"} onClick={() => setMovementType("out")}>
                Salida
              </Button>
            </div>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={movementAmount}
              onChange={(e) => setMovementAmount(e.target.value)}
              placeholder="Monto"
            />
            <Input value={movementReason} onChange={(e) => setMovementReason(e.target.value)} placeholder="Motivo" />
            <Input value={movementNotes} onChange={(e) => setMovementNotes(e.target.value)} placeholder="Nota (opcional)" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCashMovementDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                const ok = await registerCashMovement();
                if (ok) setShowCashMovementDialog(false);
              }}
              disabled={savingMovement || !hasOpenCashSession}
              variant={movementType === "in" ? "default" : "destructive"}
            >
              {savingMovement ? "Guardando..." : movementType === "in" ? "Registrar Entrada" : "Registrar Salida"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showScannerDialog}
        onOpenChange={(open) => {
          setShowScannerDialog(open);
          if (!open) stopScanner();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Escanear Codigo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="overflow-hidden rounded-md border bg-black">
              <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline autoPlay />
            </div>

            {isScannerActive && !scannerError && (
              <p className="text-xs text-gray-600">
                Apunta la camara al codigo de barras del producto. Motor: {scannerEngine === "native" ? "Nativo" : "ZXing"}.
              </p>
            )}
            {scannerError && (
              <p className="text-xs text-amber-700">{scannerError}</p>
            )}
            {!isScannerSupported && (
              <p className="text-xs text-gray-600">Fallback manual habilitado porque no hay soporte de escaneo en este navegador.</p>
            )}

            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Ingreso manual</p>
              <Input
                value={manualScannerCode}
                onChange={(e) => setManualScannerCode(e.target.value)}
                placeholder="Escribe o pega codigo de barras / SKU"
              />
              <Button
                type="button"
                className="w-full"
                onClick={() => onCodeCaptured(manualScannerCode)}
                disabled={!manualScannerCode.trim()}
              >
                Buscar Codigo
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScannerDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(previewImageUrl)} onOpenChange={(open) => !open && setPreviewImageUrl("")}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{previewImageName || "Imagen del producto"}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt={previewImageName || "Producto"} className="max-h-[70vh] w-full rounded-md object-contain" />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

