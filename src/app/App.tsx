import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./auth/AuthProvider";

function ThemeSync() {
  const { businessSettings } = useAuth();

  useEffect(() => {
    const hexToRgb = (hex: string) => {
      const value = (hex || "").replace("#", "");
      if (!/^[0-9a-fA-F]{6}$/.test(value)) return "15 23 42";
      const r = Number.parseInt(value.slice(0, 2), 16);
      const g = Number.parseInt(value.slice(2, 4), 16);
      const b = Number.parseInt(value.slice(4, 6), 16);
      return `${r} ${g} ${b}`;
    };

    const root = document.documentElement;
    const body = document.body;
    const primary = businessSettings?.primaryColor || "#0F172A";
    const accent = businessSettings?.accentColor || "#1D4ED8";

    root.style.setProperty("--primary", primary);
    root.style.setProperty("--sidebar-primary", primary);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--chart-1", accent);
    root.style.setProperty("--pos-accent", accent);
    root.style.setProperty("--primary-rgb", hexToRgb(primary));
    root.style.setProperty("--accent-rgb", hexToRgb(accent));
    root.style.setProperty("--app-bg-soft", `rgb(${hexToRgb(primary)} / 0.085)`);
    root.style.setProperty("--app-bg-soft-accent", `rgb(${hexToRgb(accent)} / 0.06)`);

    if (businessSettings?.sectionBorders === false) {
      body.classList.remove("sections-bordered");
    } else {
      body.classList.add("sections-bordered");
    }
  }, [businessSettings]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeSync />
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </AuthProvider>
  );
}
