import type { Metadata } from "next";
import { ChoreFormScreen } from "@/components/chore-form-screen";

export const metadata: Metadata = { title: "New chore" };

export default function NewChorePage() {
  return <ChoreFormScreen />;
}
