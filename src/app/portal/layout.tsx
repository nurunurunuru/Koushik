import { redirect } from "next/navigation";
import { getAuthServer } from "@/src/lib/authoption";
import { PortalSidebarNav } from "@/src/components/portal/PortalSidebarNav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthServer();

  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role !== "CANDIDATE") {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <PortalSidebarNav userName={session.user.name} userEmail={session.user.email} />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
