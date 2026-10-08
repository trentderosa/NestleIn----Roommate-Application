import Link from "next/link";
import { EmptyState, Page } from "@/components/page-bits";

export default function NotFound() {
  return (
    <Page className="max-w-md pt-16">
      <EmptyState emoji="🧦" title="This page went missing">
        Like that one sock. Let&apos;s get you back home.
        <Link
          href="/"
          className="mx-auto mt-4 block w-fit rounded-full bg-plum px-5 py-2.5 font-semibold text-cream"
        >
          Back to the board
        </Link>
      </EmptyState>
    </Page>
  );
}
