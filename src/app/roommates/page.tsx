import type { Metadata } from "next";
import { RoommatesScreen } from "@/components/roommates-screen";

export const metadata: Metadata = { title: "Roommates" };

export default function RoommatesPage() {
  return <RoommatesScreen />;
}
