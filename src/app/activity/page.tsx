import type { Metadata } from "next";
import { ActivityScreen } from "@/components/activity-screen";

export const metadata: Metadata = { title: "House feed" };

export default function ActivityPage() {
  return <ActivityScreen />;
}
