import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { apiRequest } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

type Role = "superadmin" | "admin" | "manager" | "cashier";

interface UserRow {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: Role;
  branch_id?: number;
  branch_name?: string;
  active: boolean;
  last_login: string | null;
  created_at: string;
}

interface BranchRow {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

const roleOptions: Role[] = ["superadmin", "admin", "manager", "cashier"];
const roleLabels: Record<Role, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Cajero",
};

export default function Users() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [cashierCanCharge, setCashierCanCharge] = useState(true);
  const [multiBranchEnabled, setMultiBranchEnabled] = useState(false);
  const [updatingSystemSetting, setUpdatingSystemSetting] = useState(false);
  const [updatingStoreSetting, setUpdatingStoreSetting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    fullName: "",
    role: "cashier" as Role,
    password: "",
    branchId: "1",
  });

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiRequest("/users", { token });
      setUsers(data);
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    if (!token || !multiBranchEnabled) return;
    try {
      const data = await apiRequest("/branches", { token });
      const rows = Array.isArray(data) ? data : [];
      setBranches(rows.filter((b: BranchRow) => b.active));
    } catch {
      setBranches([]);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/settings/store", { token })
      .then((data) => setCashierCanCharge(Boolean(data?.cashierCanCharge)))
      .catch(() => setCashierCanCharge(true));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/settings/system", { token })
      .then((data) => setMultiBranchEnabled(Boolean(data?.multiBranchEnabled)))
      .catch(() => setMultiBranchEnabled(false));
  }, [token]);

  useEffect(() => {
    fetchBranches();
  }, [token, multiBranchEnabled]);

  const toggleMultiBranch = async (enabled: boolean) => {
    if (!token || updatingSystemSetting) return;
    setUpdatingSystemSetting(true);
    try {
      const data = await apiRequest("/settings/system", {
        method: "PATCH",
        token,
        body: JSON.stringify({ multiBranchEnabled: enabled }),
      });
      setMultiBranchEnabled(Boolean(data?.multiBranchEnabled));
      toast.success(enabled ? "Modo sucursales activado" : "Modo sucursales desactivado");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar modo sucursales");
    } finally {
      setUpdatingSystemSetting(false);
    }
  };

  const toggleCashierChargePolicy = async (enabled: boolean) => {
    if (!token || updatingStoreSetting) return;
    setUpdatingStoreSetting(true);
    try {
      const data = await apiRequest("/settings/store", {
        method: "PATCH",
        token,
        body: JSON.stringify({ cashierCanCharge: enabled }),
      });
      setCashierCanCharge(Boolean(data?.cashierCanCharge));
      toast.success(enabled ? "Cajero habilitado para cobrar" : "Cajero ahora solo toma pedidos");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar configuracion de tienda");
    } finally {
      setUpdatingStoreSetting(false);
    }
  };

  const createUser = async () => {
    if (!token) return;
    try {
      await apiRequest("/users", {
        method: "POST",
        token,
        body: JSON.stringify({
          ...form,
          branchId: Number(form.branchId || 1),
        }),
      });
      toast.success("Usuario creado");
      setShowCreate(false);
      setForm({ username: "", email: "", fullName: "", role: "cashier", password: "", branchId: "1" });
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo crear usuario");
    }
  };

  const toggleActive = async (user: UserRow) => {
    if (!token) return;
    try {
      await apiRequest(`/users/${user.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ active: !user.active }),
      });
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar usuario");
    }
  };

  const updateRole = async (user: UserRow, role: Role) => {
    if (!token) return;
    try {
      await apiRequest(`/users/${user.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ role }),
      });
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar rol");
    }
  };

  const updateBranch = async (user: UserRow, branchId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/users/${user.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ branchId: Number(branchId) }),
      });
      fetchUsers();
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar sucursal");
    }
  };

  const resetPassword = async (user: UserRow) => {
    if (!token) return;
    const password = window.prompt(`Nueva contrasena para ${user.username}:`);
    if (!password) return;
    try {
      await apiRequest(`/users/${user.id}/reset-password`, {
        method: "POST",
        token,
        body: JSON.stringify({ password }),
      });
      toast.success("Contrasena actualizada");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cambiar la contrasena");
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-500">Administracion de cuentas del sistema</p>
          </div>
          <Button className="gap-2" onClick={() => setShowCreate(true)}>
            <UserPlus className="h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <div className="p-6">
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">Modo sucursales</p>
              <p className="text-sm text-gray-600">Solo superadmin puede habilitar o deshabilitar operacion multi-sucursal.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">Multi-sucursal</span>
              <Switch checked={multiBranchEnabled} disabled={updatingSystemSetting} onCheckedChange={toggleMultiBranch} />
            </div>
          </div>
        </Card>

        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">Politica de cobro de tienda</p>
              <p className="text-sm text-gray-600">Si se desactiva, cajeros solo registran pedidos y un admin cobra.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">Cajero puede cobrar</span>
              <Switch checked={cashierCanCharge} disabled={updatingStoreSetting} onCheckedChange={toggleCashierChargePolicy} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Rol</TableHead>
                  {multiBranchEnabled && <TableHead>Sucursal</TableHead>}
                  <TableHead>Estado</TableHead>
                  <TableHead>Ultimo acceso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.full_name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Select value={u.role} onValueChange={(value) => updateRole(u, value as Role)}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((r) => (
                            <SelectItem key={r} value={r}>
                              {roleLabels[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {multiBranchEnabled && (
                      <TableCell>
                        <Select value={String(u.branch_id || 1)} onValueChange={(value) => updateBranch(u, value)}>
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={String(b.id)}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge className={u.active ? "bg-green-600" : "bg-gray-500"}>
                        {u.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>{u.last_login ? new Date(u.last_login).toLocaleString("es-GT") : "Nunca"}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => toggleActive(u)}>
                        {u.active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => resetPassword(u)}>
                        Reiniciar clave
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {!loading && users.length === 0 && <div className="text-center py-10 text-gray-500">No hay usuarios</div>}
          </div>
        </Card>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Usuario</Label>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Correo</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Nombre completo</Label>
              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as Role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {multiBranchEnabled && (
              <div className="space-y-1">
                <Label>Sucursal</Label>
                <Select value={form.branchId} onValueChange={(value) => setForm({ ...form, branchId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>Contrasena</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancelar
            </Button>
            <Button onClick={createUser}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
