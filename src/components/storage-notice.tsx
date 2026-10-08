"use client";

import { useState } from "react";
import { AlertTriangle, LifeBuoy } from "lucide-react";
import { BACKUP_KEY } from "@/lib/store-core";
import { actions, useHouseholdSnapshot } from "@/lib/store";

/**
 * Honest status about saving: shown when changes aren't reaching storage, or
 * when saved data couldn't be read and the app started fresh.
 */
export function StorageNotice() {
  const snapshot = useHouseholdSnapshot();
  const [copied, setCopied] = useState(false);
  if (!snapshot) return null;
  const { persistence, recovery } = snapshot;

  async function copyBackup() {
    try {
      const backup = window.localStorage.getItem(BACKUP_KEY);
      if (backup) {
        await navigator.clipboard.writeText(backup);
        setCopied(true);
      }
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      {persistence !== "saved" && (
        <div
          role="status"
          className="mx-auto mb-2 flex max-w-5xl items-start gap-3 rounded-2xl bg-butter-50 px-4 py-3 text-sm text-plum md:mt-4"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-butter-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Changes aren&apos;t being saved on this device</p>
            <p className="text-plum-soft">
              {persistence === "unavailable"
                ? "This browser is blocking storage (private mode can do this). You can keep using NestleIn, but changes will disappear when you close this tab."
                : "Storage is full, so your last change wasn't saved. It'll stay until you close this tab."}
            </p>
          </div>
          {persistence === "failed" && (
            <button
              type="button"
              onClick={() => actions.retrySave()}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 font-semibold text-plum shadow-soft"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {recovery && (
        <div
          role="status"
          className="mx-auto mb-2 flex max-w-5xl items-start gap-3 rounded-2xl bg-lilac-50 px-4 py-3 text-sm text-plum md:mt-4"
        >
          <LifeBuoy className="mt-0.5 size-4 shrink-0 text-lilac-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">We couldn&apos;t read your saved data, so we started fresh</p>
            <p className="text-plum-soft">
              {recovery.backedUp
                ? "A copy of the old data was kept on this device in case you need it."
                : "We couldn't keep a copy of the old data."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {recovery.backedUp && (
                <button
                  type="button"
                  onClick={copyBackup}
                  className="rounded-full bg-white px-3 py-1.5 font-semibold text-lilac-700 shadow-soft"
                >
                  {copied ? "Copied" : "Copy old data"}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  actions.dismissRecovery();
                  // The notice (and the focused button) disappears; keep focus in the page.
                  document.getElementById("main")?.focus();
                }}
                className="rounded-full px-3 py-1.5 font-semibold text-plum-soft hover:text-plum"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
