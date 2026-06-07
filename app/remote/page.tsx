import type { Metadata } from "next";
import { RemoteControl } from "@/components/remote-control";

export const metadata: Metadata = {
  title: "Control Remoto — Cococys",
  description: "Controla la presentación desde tu teléfono.",
};

interface RemotePageProps {
  searchParams: Promise<{ room?: string }>;
}

/**
 * Remote route — /remote?room=<code>
 *
 * Server component that reads the pairing code from the URL and hands it to the
 * client remote. When the code is absent or malformed, the client renders a
 * manual entry form instead.
 */
export default async function RemotePage({ searchParams }: RemotePageProps) {
  const { room } = await searchParams;
  return <RemoteControl initialRoom={room ?? ""} />;
}
