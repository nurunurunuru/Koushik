import { redirect } from "next/navigation";
import { getAuthServer } from "@/src/lib/authoption";

export default async function Home() {
  const session = await getAuthServer();

  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role === "ADMIN") {
    redirect("/dashboard");
  }
  redirect("/portal/jobs");
}
