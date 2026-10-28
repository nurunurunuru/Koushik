import { redirect } from "next/navigation";
import { getAuthServer } from "@/src/lib/authoption";
import { SidebarNav } from "@/src/components/dashboard/SidebarNav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthServer();

  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/portal/jobs");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar - server renders user data, client component handles nav */}
      <SidebarNav userName={session.user.name} userEmail={session.user.email} />

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
