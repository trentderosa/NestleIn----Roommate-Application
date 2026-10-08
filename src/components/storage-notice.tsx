"use client";

import { useState } from "react";
import { AlertTriangle, LifeBuoy } from "lucide-react";
import { actions, useHouseholdSnapshot } from "@/lib/store";

/**
 * Honest status about saving: shown when changes aren't reaching storage,
 * when some unsaved changes had to be dropped because they no longer fit
 * another tab's data, or when saved data couldn't be read and the app
 * started fresh.
 */
export function StorageNotice() {
  const snapshot = useHouseholdSnapshot();
  const [copied, setCopied] = useState(false);
  if (!snapshot) return null;
  const { persistence, recovery, conflicts, pending } = snapshot;
  // While unbacked old data is protected, the recovery notice explains it.
  const showSaveProblem = persistence !== "saved" && !(recovery && !recovery.backedUp);

  async function copyOldData() {
    if (!recovery) return;
    try {
      await navigator.clipboard.writeText(recovery.raw);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      {conflicts.length > 0 && (
        <Notice tone="warn">
          <p className="font-semibold">
            {conflicts.length === 1
              ? "One change couldn't be saved because it no longer fits what another tab saved."
              : `${conflicts.length} changes couldn't be saved because they no longer fit what another tab saved.`}{" "}
            Everything else was kept.
          </p>
          <ul className="mt-1 list-disc pl-5 text-plum-soft">
            {conflicts.map((c, i) => (
              <li key={`${i}-${c}`}>{c}</li>
            ))}
          </ul>
          <div className="mt-2">
            <NoticeButton quiet onClick={() => actions.dismissConflicts()}>
              Got it
            </NoticeButton>
          </div>
        </Notice>
      )}

      {showSaveProblem && (
        <Notice tone="warn">
          <p className="font-semibold">Changes aren&apos;t being saved on this device</p>
          <p className="text-plum-soft">
            {persistence === "unavailable"
              ? "This browser is blocking storage (private mode can do this). You can keep using NestleIn, but changes will disappear when you close this tab."
              : `Storage is full, so ${pending <= 1 ? "your latest change wasn't" : `${pending} changes weren't`} saved. ${pending <= 1 ? "It'll" : "They'll"} stay until you close this tab.`}
          </p>
          {persistence === "failed" && pending > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <NoticeButton onClick={() => actions.retrySave()}>Try again</NoticeButton>
              <NoticeButton quiet onClick={() => actions.discardPending()}>
                {`Discard ${pending} unsaved ${pending === 1 ? "change" : "changes"}`}
              </NoticeButton>
            </div>
          )}
        </Notice>
      )}

      {recovery && (
        <Notice tone="info">
          <p className="font-semibold">We couldn&apos;t read your saved data, so we started fresh</p>
          <p className="text-plum-soft">
            {recovery.backedUp
              ? "A copy of the old data was kept on this device in case you need it."
              : "We couldn't keep a backup copy, so nothing new is saved until you dismiss this. Copy the old data first if you need it."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <NoticeButton onClick={copyOldData}>{copied ? "Copied" : "Copy old data"}</NoticeButton>
            <NoticeButton
              quiet
              onClick={() => {
                actions.dismissRecovery();
                // The notice (and the focused button) disappears; keep focus in the page.
                document.getElementById("main")?.focus();
              }}
            >
              {recovery.backedUp ? "Dismiss" : "Dismiss and start saving"}
            </NoticeButton>
          </div>
        </Notice>
      )}
    </>
  );
}

function Notice({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : LifeBuoy;
  return (
    <div
      role="status"
      className={
        "mx-auto mb-2 flex max-w-5xl items-start gap-3 rounded-2xl px-4 py-3 text-sm text-plum md:mt-4 " +
        (tone === "warn" ? "bg-butter-50" : "bg-lilac-50")
      }
    >
      <Icon
        className={"mt-0.5 size-4 shrink-0 " + (tone === "warn" ? "text-butter-700" : "text-lilac-700")}
        aria-hidden
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function NoticeButton({
  onClick,
  quiet = false,
  children,
}: {
  onClick: () => void;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        quiet
          ? "rounded-full px-3 py-1.5 font-semibold text-plum-soft hover:text-plum"
          : "rounded-full bg-white px-3 py-1.5 font-semibold text-plum shadow-soft"
      }
    >
      {children}
    </button>
  );
}
