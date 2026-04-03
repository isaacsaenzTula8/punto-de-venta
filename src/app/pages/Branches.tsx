import { useEffect, useState } from "react";
import { Building2, Pencil, Trash2, Plus } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";

interface BranchRow {
  id: number;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
}

export default function Branches() {
  const { token } = useAuth();
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [multiBranchEnabled, setMultiBranchEnabled] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState<BranchRow | null>(null);

  const [createForm, setCreateForm] = useState({ code: "", name: "" });
  const [editForm, setEditForm] = useState({ name: "", active: true });

  const fetchSystemSettings = async () => {
    if (!token) return;
    try {
      const data = await apiRequest("/settings/system", { token });
      setMultiBranchEnabled(Boolean(data?.multiBranchEnabled));
    } catch {
      setMultiBranchEnabled(false);
    }
  };

  const fetchBranches = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiRequest("/branches", { token });
      setBranches(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron cargar sucursales");
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemSettings();
  }, [token]);

  useEffect(() => {
    if (!multiBranchEnabled) return;
    fetchBranches();
  }, [token, multiBranchEnabled]);

  const createBranch = async () => {
    if (!token) return;
    try {
      await apiRequest("/branches", {
        method: "POST",
        token,
        body: JSON.stringify({ code: createForm.code, name: createForm.name }),
      });
      toast.success("Sucursal creada");
      setShowCreate(false);
      setCreateForm({ code: "", name: "" });
      fetchBranches();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo crear sucursal");
    }
  };

  const openEdit = (branch: BranchRow) => {
    setSelected(branch);
    setEditForm({ name: branch.name, active: branch.active });
    setShowEdit(true);
  };

  const updateBranch = async () => {
    if (!token || !selected) return;
    try {
      await apiRequest(`/branches/${selected.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(editForm),
      });
      toast.success("Sucursal actualizada");
      setShowEdit(false);
      setSelected(null);
      fetchBranches();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar sucursal");
    }
  };

  const deleteBranch = async (branch: BranchRow) => {
    if (!token) return;
    const confirmed = window.confirm(`Eliminar sucursal ${branch.name}?`);
    if (!confirmed) return;
    try {
      await apiRequest(`/branches/${branch.id}`, { method: "DELETE", token });
      toast.success("Sucursal eliminada");
      fetchBranches();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar sucursal");
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sucursales</h1>
            <p className="text-sm text-gray-500">CRUD de sucursales del sistema</p>
          </div>
          {multiBranchEnabled && (
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Nueva Sucursal
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        {!multiBranchEnabled ? (
          <Card className="p-6">
            <p className="font-semibold text-gray-900 mb-2">Modo sucursales desactivado</p>
            <p className="text-sm text-gray-600">
              Activalo desde la pantalla de Usuarios (switch "Modo sucursales") para habilitar este CRUD.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <Card key={branch.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-600" />
                      <p className="font-semibold">{branch.name}</p>
                      <Badge className={branch.active ? "bg-green-600" : "bg-gray-500"}>
                        {branch.active ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Codigo: {branch.code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(branch)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteBranch(branch)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}

            {!loading && branches.length === 0 && (
              <Card className="p-6">
                <p className="text-sm text-gray-500">No hay sucursales registradas.</p>
              </Card>
            )}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Codigo</Label>
              <Input value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={createBranch}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <div className="flex gap-2">
                <Button variant={editForm.active ? "default" : "outline"} onClick={() => setEditForm({ ...editForm, active: true })}>
                  Activa
                </Button>
                <Button variant={!editForm.active ? "default" : "outline"} onClick={() => setEditForm({ ...editForm, active: false })}>
                  Inactiva
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>
              Cancelar
            </Button>
            <Button onClick={updateBranch}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
