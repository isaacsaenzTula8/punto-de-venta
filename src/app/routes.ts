import { createBrowserRouter } from "react-router";
import MainLayout from "./layouts/MainLayout";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Categories from "./pages/Categories";
import Branches from "./pages/Branches";
import Settings from "./pages/Settings";
import OnlineOrders from "./pages/OnlineOrders";
import OnlineCheckout from "./pages/OnlineCheckout";
import ProtectedRoute from "./auth/ProtectedRoute";
import RoleRoute from "./auth/RoleRoute";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/shop/:branchId",
    Component: OnlineCheckout,
  },
  {
    path: "/shop",
    Component: OnlineCheckout,
  },
  {
    Component: ProtectedRoute,
    children: [
      {
        path: "/",
        Component: MainLayout,
        children: [
          { index: true, Component: POS },
          { path: "dashboard", Component: Dashboard },
          { path: "pos", Component: POS },
          { path: "products", Component: Products },
          { path: "categories", Component: Categories },
          { path: "sales", Component: Sales },
          { path: "online-orders", Component: OnlineOrders },
          { path: "reports", Component: Reports },
          {
            Component: RoleRoute,
            children: [
              { path: "users", Component: Users },
              { path: "branches", Component: Branches },
              { path: "settings", Component: Settings },
            ],
          },
        ],
      },
    ],
  },
]);
