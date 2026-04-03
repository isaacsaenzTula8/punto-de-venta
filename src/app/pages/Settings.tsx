import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";

interface BranchRow {
  id: number;
  name: string;
  active: boolean;
}

interface BusinessSettingsForm {
  businessName: string;
  nit: string;
  phone: string;
  address: string;
  currencyCode: string;
  logoUrl: string;
  useDarkMode: boolean;
  primaryColor: string;
  accentColor: string;
  sectionBorders: boolean;
  lowStockThreshold: number;
  storeVertical: "general" | "pharmacy" | "fashion" | "grocery" | "restaurant" | "hardware" | "wholesale";
  enabledModules: string[];
}

const MODULE_OPTIONS = [
  { id: "expirations", label: "Caducidades (farmacia/alimentos)" },
  { id: "product_presentations", label: "Presentaciones mayoreo (unidad/caja)" },
  { id: "brands_and_sizes", label: "Marca y talla (moda)" },
  { id: "kitchen_orders", label: "Comandas de cocina (restaurante)" },
  { id: "online_store", label: "Tienda en linea" },
  { id: "serial_tracking", label: "Serie/Lote" },
];

const THEME_PRESETS = [
  { id: "deep-blue", name: "Azul Oscuro", primaryColor: "#0F172A", accentColor: "#1D4ED8" },
  { id: "ocean", name: "Océano", primaryColor: "#0B3A53", accentColor: "#0EA5E9" },
  { id: "forest", name: "Bosque", primaryColor: "#14532D", accentColor: "#22C55E" },
  { id: "sunset", name: "Atardecer", primaryColor: "#7C2D12", accentColor: "#F97316" },
  { id: "wine", name: "Vino", primaryColor: "#4C0519", accentColor: "#E11D48" },
];

export default function Settings() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [multiBranchEnabled, setMultiBranchEnabled] = useState(false);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(String(user?.branchId || 1));
  const [form, setForm] = useState<BusinessSettingsForm>({
    businessName: "",
    nit: "",
    phone: "",
    address: "",
    currencyCode: "GTQ",
    logoUrl: "",
    useDarkMode: false,
    primaryColor: "#0F172A",
    accentColor: "#1D4ED8",
    sectionBorders: true,
    lowStockThreshold: 20,
    storeVertical: "general",
    enabledModules: [],
  });

  const canSelectBranch = Boolean(user?.role === "superadmin" && multiBranchEnabled);

  const loadSystem = async () => {
    if (!token) return;
    try {
      const system = await apiRequest("/settings/system", { token });
      const enabled = Boolean(system?.multiBranchEnabled);
      setMultiBranchEnabled(enabled);

      if (enabled) {
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

  const loadBusinessSettings = async (branchId: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const query = canSelectBranch ? `?branchId=${Number(branchId || 1)}` : "";
      const data = await apiRequest(`/settings/business${query}`, { token });
      setForm({
        businessName: data?.businessName || "",
        nit: data?.nit || "",
        phone: data?.phone || "",
        address: data?.address || "",
        currencyCode: data?.currencyCode || "GTQ",
        logoUrl: data?.logoUrl || "",
        useDarkMode: Boolean(data?.useDarkMode),
        primaryColor: data?.primaryColor || "#0F172A",
        accentColor: data?.accentColor || "#1D4ED8",
        sectionBorders: Boolean(data?.sectionBorders ?? true),
        lowStockThreshold: Number(data?.lowStockThreshold ?? 20),
        storeVertical: data?.storeVertical || "general",
        enabledModules: Array.isArray(data?.enabledModules) ? data.enabledModules : [],
      });
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar configuracion del negocio");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSystem();
  }, [token]);

  useEffect(() => {
    loadBusinessSettings(selectedBranchId);
  }, [token, selectedBranchId, multiBranchEnabled]);

  const saveSettings = async () => {
    if (!token) return;
    if (!form.businessName.trim()) {
      toast.error("Nombre del negocio es requerido");
      return;
    }

    setSaving(true);
    try {
      await apiRequest("/settings/business", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          ...form,
          branchId: Number(selectedBranchId || 1),
        }),
      });
      toast.success("Configuracion guardada");
      await loadBusinessSettings(selectedBranchId);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar configuracion");
    } finally {
      setSaving(false);
    }
  };

  const onLogoFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("La imagen debe pesar menos de 1 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, logoUrl: String(reader.result || "") }));
    };
    reader.onerror = () => {
      toast.error("No se pudo leer la imagen");
    };
    reader.readAsDataURL(file);
  };

  const activePresetId =
    THEME_PRESETS.find(
      (preset) =>
        preset.primaryColor.toLowerCase() === form.primaryColor.toLowerCase() &&
        preset.accentColor.toLowerCase() === form.accentColor.toLowerCase()
    )?.id || "custom";

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-4 py-4 sm:px-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Configuracion General</h1>
        <p className="text-sm text-gray-500">Datos del negocio para tickets y operacion</p>
      </div>

      <div className="p-4 sm:p-6">
        <Card className="section-card space-y-4 p-4 sm:p-6">
          {canSelectBranch && (
            <div className="space-y-2">
              <Label>Sucursal</Label>
              <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                <SelectTrigger className="w-full sm:w-72">
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre del negocio</Label>
              <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>NIT</Label>
              <Input value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Telefono</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Moneda</Label>
              <Input value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-2">
              <Label>Umbral stock bajo</Label>
              <Input
                type="number"
                min="0"
                value={String(form.lowStockThreshold)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lowStockThreshold: Math.max(0, Number(e.target.value || 0)),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de tienda</Label>
              <Select
                value={form.storeVertical}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    storeVertical: value as BusinessSettingsForm["storeVertical"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="pharmacy">Farmacia</SelectItem>
                  <SelectItem value="fashion">Boutique / Ropa</SelectItem>
                  <SelectItem value="grocery">Abarrotes / Super</SelectItem>
                  <SelectItem value="wholesale">Mayoreo</SelectItem>
                  <SelectItem value="restaurant">Restaurante</SelectItem>
                  <SelectItem value="hardware">Ferreteria</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Modulos habilitados</Label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {MODULE_OPTIONS.map((module) => {
                const checked = form.enabledModules.includes(module.id);
                return (
                  <label key={module.id} className="flex items-center gap-2 rounded border bg-white p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          enabledModules: e.target.checked
                            ? [...prev.enabledModules, module.id]
                            : prev.enabledModules.filter((id) => id !== module.id),
                        }))
                      }
                    />
                    <span>{module.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Direccion</Label>
            <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={3} />
          </div>

          <div className="space-y-2">
            <Label>Logo URL o imagen</Label>
            <Input
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="https://... o data:image/..."
            />
            <Input type="file" accept="image/*" onChange={(e) => onLogoFileSelected(e.target.files?.[0] || null)} />
            {form.logoUrl && (
              <div className="rounded-md border bg-white p-3">
                <p className="mb-2 text-xs text-gray-500">Vista previa</p>
                <img src={form.logoUrl} alt={form.businessName || "Logo"} className="h-14 w-14 rounded object-cover" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Color principal</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  placeholder="#0F172A"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Color acento</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={form.accentColor}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                  placeholder="#1D4ED8"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tema de color</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      primaryColor: preset.primaryColor,
                      accentColor: preset.accentColor,
                    }))
                  }
                  className={`rounded-md border p-2 text-left transition ${
                    activePresetId === preset.id ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="mb-2 flex gap-1">
                    <span className="h-3 w-6 rounded" style={{ backgroundColor: preset.primaryColor }} />
                    <span className="h-3 w-6 rounded" style={{ backgroundColor: preset.accentColor }} />
                  </div>
                  <p className="text-xs font-medium text-slate-700">{preset.name}</p>
                </button>
              ))}
            </div>
            {activePresetId === "custom" && <p className="text-xs text-gray-500">Tema actual: Personalizado</p>}
          </div>

          <div className="rounded-md border bg-slate-50 p-3">
            <p className="font-medium text-gray-900">Tema visual</p>
            <p className="text-xs text-gray-600">
              La apariencia se controla con el tema de color y los tonos configurados arriba.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium text-gray-900">Bordes entre secciones</p>
              <p className="text-xs text-gray-500">Agrega separadores visuales en pantallas principales</p>
            </div>
            <Switch checked={form.sectionBorders} onCheckedChange={(checked) => setForm({ ...form, sectionBorders: checked })} />
          </div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} disabled={loading || saving}>
              {saving ? "Guardando..." : "Guardar Configuracion"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
