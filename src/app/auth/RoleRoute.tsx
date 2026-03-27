import { Navigate, Outlet } from "react-router";
import { useAuth } from "./AuthProvider";

export default function RoleRoute() {
  const { user } = useAuth();

  if (!user || user.role !== "superadmin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
