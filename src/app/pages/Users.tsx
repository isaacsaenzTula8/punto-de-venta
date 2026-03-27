import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
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
  active: boolean;
  last_login: string | null;
  created_at: string;
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
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [cashierCanCharge, setCashierCanCharge] = useState(true);
  const [updatingStoreSetting, setUpdatingStoreSetting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    fullName: "",
    role: "cashier" as Role,
    password: "",
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

  useEffect(() => {
    fetchUsers();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    apiRequest("/settings/store", { token })
      .then((data) => {
        setCashierCanCharge(Boolean(data?.cashierCanCharge));
      })
      .catch(() => {
        setCashierCanCharge(true);
      });
  }, [token]);

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
        body: JSON.stringify(form),
      });
      toast.success("Usuario creado");
      setShowCreate(false);
      setForm({ username: "", email: "", fullName: "", role: "cashier", password: "" });
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

  const resetPassword = async (user: UserRow) => {
    if (!token) return;
    const password = window.prompt(`Nueva contraseña para ${user.username}:`);
    if (!password) return;
    try {
      await apiRequest(`/users/${user.id}/reset-password`, {
        method: "POST",
        token,
        body: JSON.stringify({ password }),
      });
      toast.success("Contraseña actualizada");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo cambiar la contraseña");
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
            <p className="text-sm text-gray-500">Administración de cuentas del sistema</p>
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
              <p className="font-semibold text-gray-900">Politica de cobro de tienda</p>
              <p className="text-sm text-gray-600">
                Si se desactiva, los cajeros solo registran pedidos y un administrador realiza el cobro.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-700">Cajero puede cobrar</span>
              <Switch
                checked={cashierCanCharge}
                disabled={updatingStoreSetting}
                onCheckedChange={toggleCashierChargePolicy}
              />
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
                  <TableHead>Estado</TableHead>
                  <TableHead>Último acceso</TableHead>
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
                    <TableCell>
                      <Badge className={u.active ? "bg-green-600" : "bg-gray-500"}>
                        {u.active ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.last_login ? new Date(u.last_login).toLocaleString("es-GT") : "Nunca"}
                    </TableCell>
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

            {!loading && users.length === 0 && (
              <div className="text-center py-10 text-gray-500">No hay usuarios</div>
            )}
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
            <div className="space-y-1">
              <Label>Contraseña</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
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
