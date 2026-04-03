import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { toast } from "sonner";
import { apiRequest } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [businessName, setBusinessName] = useState("Sistema POS Guatemala");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0F172A");
  const [accentColor, setAccentColor] = useState("#1D4ED8");

  const from = (location.state as any)?.from?.pathname || "/";

  useEffect(() => {
    let active = true;
    apiRequest("/settings/public-business")
      .then((data) => {
        if (!active) return;
        setBusinessName(String(data?.businessName || "Sistema POS Guatemala"));
        setLogoUrl(String(data?.logoUrl || ""));
        setPrimaryColor(String(data?.primaryColor || "#0F172A"));
        setAccentColor(String(data?.accentColor || "#1D4ED8"));
      })
      .catch(() => {
        // Mantener fallback local en login si no hay configuracion.
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(username, password);
      toast.success("Sesión iniciada");
      navigate(from, { replace: true });
    } catch (error: any) {
      toast.error(error?.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        background: `linear-gradient(145deg, ${primaryColor} 0%, ${accentColor} 100%)`,
      }}
    >
      <Card className="w-full max-w-md border-slate-300 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3 mb-6">
          {logoUrl ? (
            <div className="h-16 w-16 rounded-xl bg-white p-1 shadow-md ring-1 ring-slate-200">
              <img
                src={logoUrl}
                alt={businessName}
                className="h-full w-full rounded-lg object-cover"
              />
            </div>
          ) : (
            <div
              className="h-16 w-16 rounded-xl text-white flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              <ShoppingCart className="h-8 w-8" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{businessName}</h1>
            <p className="text-sm text-gray-500">Ingreso al sistema</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Usuario o correo</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin o admin@pos.com"
              required
            />
          </div>
          <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="******"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
