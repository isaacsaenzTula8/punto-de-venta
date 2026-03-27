import { Outlet, Link, useLocation } from "react-router";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Tags,
  Receipt, 
  BarChart3,
  Users,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { useAuth } from "../auth/AuthProvider";

export default function MainLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuth();
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
    { name: 'Reportes', href: '/reports', icon: BarChart3 },
    ...(user?.role === "superadmin" ? [{ name: "Usuarios", href: "/users", icon: Users }] : []),
  ];
  
  const isActive = (href: string) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };
  
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside 
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-slate-900 text-white transition-all duration-300 flex flex-col`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-8 w-8 text-blue-400" />
              <span className="text-lg font-bold">Sistema POS</span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-white hover:bg-slate-800"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                  active 
                    ? 'bg-blue-600 text-white border-l-4 border-blue-400' 
                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarOpen && <span className="font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          {sidebarOpen ? (
            <div className="text-sm text-gray-400">
              <p className="font-medium text-white">{user?.fullName || "Usuario"}</p>
              <p>{roleLabel}</p>
              <Button
                variant="ghost"
                className="mt-3 w-full justify-start text-gray-200 hover:text-white hover:bg-slate-800"
                onClick={() => logout()}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar sesión
              </Button>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold">
              {(user?.fullName || "U").slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
