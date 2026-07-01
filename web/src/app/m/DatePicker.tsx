"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronLeftDouble, ChevronRight, ChevronRightDouble } from "@untitledui/icons";
import { monthGrid, stepMonth, toIso, weekdayLabels } from "@/lib/date/calendar";
import styles from "./mobile.module.css";

// The Add screen's date picker: a calendar popover in the 5b style, replacing the native
// <input type="date"> (whose showPicker() is unreliable on iOS and detaches from a hidden
// input). The trigger reads as a serif field like Name / Narrate; tapping floats a glass
// calendar over a faint scrim. Memories can't be in the future, so days after today are
// disabled, and the range floors at 1900. "Today" is read only after mount, so the static
// export doesn't hydrate-mismatch. Grid maths live in lib/date/calendar (unit-tested).
const MIN_YEAR = 1900;
const WEEKDAYS = weekdayLabels();

/** Human label for an ISO day, parsed as a local calendar date (no timezone shift). */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [view, setView] = useState<{ year: number; month: number }>({ year: 2020, month: 0 });

  useEffect(() => {
    const now = new Date();
    setToday(toIso(now.getFullYear(), now.getMonth(), now.getDate()));
  }, []);

  // Close on Escape while the calendar is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const maxIdx = today ? Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1 : Infinity;
  const minIdx = MIN_YEAR * 12;
  const clamp = (year: number, month: number) => {
    const idx = Math.max(minIdx, Math.min(maxIdx, year * 12 + month));
    return { year: Math.floor(idx / 12), month: idx % 12 };
  };

  const openPicker = () => {
    const base = value || today;
    if (base) {
      const [y, m] = base.split("-").map(Number);
      setView(clamp(y, m - 1));
    }
    setOpen(true);
  };

  const go = (deltaMonths: number, deltaYears = 0) => {
    const stepped = stepMonth(view.year + deltaYears, view.month, deltaMonths);
    setView(clamp(stepped.year, stepped.month));
  };

  const weeks = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month]);
  const title = new Date(view.year, view.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const curIdx = view.year * 12 + view.month;
  const atMin = curIdx <= minIdx;
  const atMax = curIdx >= maxIdx;
  const atMinYear = curIdx - 12 < minIdx;
  const atMaxYear = curIdx + 12 > maxIdx;

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.serifButton} ${value ? styles.serifButtonSet : ""}`}
        onClick={openPicker}
      >
        {value ? formatDay(value) : "Add a date"}
      </button>

      {open && (
        <div className={styles.calScrim} onClick={() => setOpen(false)}>
          <div
            className={styles.calendar}
            role="dialog"
            aria-label="Choose a date"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.calHead}>
              <button
                type="button"
                className={styles.calNav}
                onClick={() => go(0, -1)}
                disabled={atMinYear}
                aria-label="Previous year"
              >
                <ChevronLeftDouble width="100%" height="100%" />
              </button>
              <button
                type="button"
                className={styles.calNav}
                onClick={() => go(-1)}
                disabled={atMin}
                aria-label="Previous month"
              >
                <ChevronLeft width="100%" height="100%" />
              </button>
              <span className={styles.calTitle}>{title}</span>
              <button
                type="button"
                className={styles.calNav}
                onClick={() => go(1)}
                disabled={atMax}
                aria-label="Next month"
              >
                <ChevronRight width="100%" height="100%" />
              </button>
              <button
                type="button"
                className={styles.calNav}
                onClick={() => go(0, 1)}
                disabled={atMaxYear}
                aria-label="Next year"
              >
                <ChevronRightDouble width="100%" height="100%" />
              </button>
            </div>

            <div className={styles.calWeekdays}>
              {WEEKDAYS.map((w) => (
                <span key={w} className={styles.calWeekday}>
                  {w}
                </span>
              ))}
            </div>

            <div className={styles.calGrid}>
              {weeks.flat().map((cell) => {
                const future = today !== null && cell.iso > today;
                const selected = cell.iso === value;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    className={`${styles.calDay} ${cell.inMonth ? "" : styles.calDayOut} ${
                      selected ? styles.calDaySel : ""
                    }`}
                    disabled={future}
                    onClick={() => pick(cell.iso)}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
