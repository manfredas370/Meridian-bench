import { ExperimentView } from "@/components/ExperimentView";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExperimentView experimentId={id} />;
}
