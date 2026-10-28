import { PortalInterviewClient } from "@/src/components/portal/PortalInterviewClient";

export const dynamic = "force-dynamic";

export default async function PortalInterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PortalInterviewClient candidateId={id} />;
}
