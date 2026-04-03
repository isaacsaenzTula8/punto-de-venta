import { Outlet, Link, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Tags,
  Receipt, 
  BarChart3,
  Users,
  Settings,
  Building2,
  Globe,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { useAuth } from "../auth/AuthProvider";

export default function MainLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const { user, logout, businessSettings } = useAuth();
  const businessName = businessSettings?.businessName?.trim() || "Sistema POS";
  const logoUrl = businessSettings?.logoUrl?.trim() || "";
  const roleLabel =
    user?.role === "superadmin"
      ? "Superadministrador"
      : user?.role === "admin"
      ? "Administrador"
      : user?.role === "manager"
      ? "Gerente"
      : "Cajero";
  
  const navigation = [
    { name: 'Punto de Venta', href: '/', icon: ShoppingCart },
    { name: 'Panel', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Productos', href: '/products', icon: Package },
    { name: "Categorias", href: "/categories", icon: Tags },
    { name: 'Historial de Ventas', href: '/sales', icon: Receipt },
    ...(["superadmin", "admin", "manager"].includes(user?.role || "")
      ? [{ name: "Pedidos Online", href: "/online-orders", icon: Globe }]
      : []),
    { name: 'Reportes', href: '/reports', icon: BarChart3 },
    ...(user?.role === "superadmin"
      ? [
          { name: "Usuarios", href: "/users", icon: Users },
          { name: "Sucursales", href: "/branches", icon: Building2 },
          { name: "Configuracion", href: "/settings", icon: Settings },
        ]
      : []),
  ];
  
  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncMobile = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    syncMobile();
    media.addEventListener("change", syncMobile);
    return () => media.removeEventListener("change", syncMobile);
  }, []);
  
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {isMobile && sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40"
          onClick={() => setSidebarOpen(false)}
          aria-label="Cerrar menu lateral"
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`${
          isMobile
            ? `fixed inset-y-0 left-0 z-40 w-64 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : sidebarOpen
            ? "w-64"
            : "w-20"
        } themed-sidebar transition-all duration-300 flex flex-col min-h-0 overflow-hidden`}
      >
        {/* Header */}
        <div className="themed-sidebar-header h-16 flex items-center justify-between px-4">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <div className="h-11 w-11 rounded-xl bg-white/90 p-1 shadow-sm ring-1 ring-white/60">
                  <img
                    src={logoUrl}
                    alt={businessName}
                    className="h-full w-full rounded-lg object-cover"
                  />
                </div>
              ) : (
                <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center">
                  <ShoppingCart className="h-7 w-7 text-white" />
                </div>
              )}
              <span className="text-lg font-bold truncate">{businessName}</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-white/10"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => {
                  if (isMobile) setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  active ? "themed-sidebar-link-active" : "themed-sidebar-link"
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
        
        {/* Footer */}
        <div className="themed-sidebar-footer shrink-0 p-4">
          {sidebarOpen ? (
            <div className="text-sm text-white/75">
              <p className="font-medium text-white">{user?.fullName || "Usuario"}</p>
              <p>{roleLabel}</p>
              <p className="truncate text-white/70">{businessName}</p>
              <div className="mt-2 flex items-center gap-2 rounded-md bg-white/10 px-2 py-1 text-xs text-white/90">
                <Building2 className="h-3.5 w-3.5" />
                <span>Sucursal: {user?.branchName || `ID ${user?.branchId || 1}`}</span>
              </div>
              <Button
                variant="ghost"
                className="mt-3 w-full justify-start text-white/85 hover:text-white hover:bg-white/10"
                onClick={() => logout()}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold">
              {(user?.fullName || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {isMobile && (
          <div className="sticky top-0 z-20 flex items-center justify-between border-b bg-white/95 px-4 py-3 backdrop-blur">
            <Button variant="outline" size="icon" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </Button>
            <p className="truncate text-sm font-semibold text-gray-800">{businessName}</p>
            <div className="w-9" />
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
