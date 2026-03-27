import { useEffect, useState } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../auth/AuthProvider";
import { apiRequest } from "../lib/api";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";

interface CategoryRow {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  products_count: number;
}

export default function Categories() {
  const { token, user } = useAuth();
  const canManage = user?.role === "superadmin" || user?.role === "admin" || user?.role === "manager";
  const canDelete = user?.role === "superadmin" || user?.role === "admin";
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiRequest("/categories", { token });
      setRows(data);
    } catch (error: any) {
      toast.error(error?.message || "No se pudieron cargar categorías");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "" });
    setShowDialog(true);
  };

  const openEdit = (row: CategoryRow) => {
    setEditing(row);
    setForm({ name: row.name, description: row.description || "" });
    setShowDialog(true);
  };

  const save = async () => {
    if (!token) return;
    if (!form.name.trim()) return toast.error("Nombre requerido");
    try {
      if (editing) {
        await apiRequest(`/categories/${editing.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ name: form.name.trim(), description: form.description }),
        });
        toast.success("Categoría actualizada");
      } else {
        await apiRequest("/categories", {
          method: "POST",
          token,
          body: JSON.stringify({ name: form.name.trim(), description: form.description }),
        });
        toast.success("Categoría creada");
      }
      setShowDialog(false);
      load();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar la categoría");
    }
  };

  const toggleActive = async (row: CategoryRow) => {
    if (!token) return;
    try {
      await apiRequest(`/categories/${row.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ active: !row.active }),
      });
      load();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar estado");
    }
  };

  const remove = async (row: CategoryRow) => {
    if (!token) return;
    if (!confirm(`¿Eliminar categoría "${row.name}"?`)) return;
    try {
      await apiRequest(`/categories/${row.id}`, { method: "DELETE", token });
      toast.success("Categoría eliminada");
      load();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo eliminar la categoría");
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
            <p className="text-sm text-gray-500">Gestión del catálogo de categorías</p>
          </div>
          {canManage && (
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nueva Categoría
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-center">Productos</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.description || "-"}</TableCell>
                    <TableCell className="text-center">{row.products_count}</TableCell>
                    <TableCell>
                      <Badge className={row.active ? "bg-green-600" : "bg-gray-500"}>
                        {row.active ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(row.created_at).toLocaleDateString("es-GT")}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {canManage && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleActive(row)}>
                            {row.active ? "Desactivar" : "Activar"}
                          </Button>
                        </>
                      )}
                      {canDelete && (
                        <Button variant="outline" size="sm" onClick={() => remove(row)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Eliminar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!loading && rows.length === 0 && (
              <div className="text-center py-10 text-gray-500">No hay categorías</div>
            )}
          </div>
        </Card>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={save}>{editing ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
