import { Outlet } from "react-router-dom";
import { PublicHeader } from "./PublicHeader";
import { PublicFooter } from "./PublicFooter";

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <PublicHeader />
      <main className="mx-auto w-full max-w-canvas flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
