import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DriverStats } from "./driverStats";
import { eventLabel, verdict } from "./driverStats";

const EMERALD: [number, number, number] = [14, 122, 91];
const AMBER: [number, number, number] = [217, 119, 6];
const RED: [number, number, number] = [220, 38, 38];

/** Render a printable A4 driver performance report and trigger the browser download. */
export function exportDriverPdf(s: DriverStats) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // header band
  doc.setFillColor(...EMERALD);
  doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Wayline — Driver Performance Report", 40, 40);

  // identity block
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(20);
  doc.text(s.driverName, 40, 100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(100, 116, 139);
  const meta = [
    `Bus: ${s.busId}`,
    s.plate ? `Plate: ${s.plate}` : null,
    s.routeName ? `Route: ${s.routeName}` : null,
    `Status: ${s.online ? "Online" : "Offline"}${s.forceStopped ? " (force-stopped)" : ""}`,
    `Generated: ${new Date().toLocaleString()}`,
  ].filter(Boolean) as string[];
  doc.text(meta.join("   ·   "), 40, 118);

  // safety score verdict line
  const scoreColor = s.safetyScore >= 75 ? EMERALD : s.safetyScore >= 50 ? AMBER : RED;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...scoreColor);
  doc.text(`Safety score: ${s.safetyScore}/100 — ${verdict(s.safetyScore)}`, 40, 148);

  // key metrics table
  autoTable(doc, {
    startY: 164,
    head: [["Metric", "Value", "Notes"]],
    body: [
      ["Crashes (all time)", String(s.counts.crash), "highest severity penalty"],
      ["Route deviations", String(s.counts.deviation), "off-route incidents"],
      ["Harsh braking", String(s.counts.harsh_brake), `total harsh driving: ${s.harshTotal}`],
      ["Hard acceleration", String(s.counts.harsh_accel), ""],
      ["Obstacles detected", String(s.counts.obstacle), ""],
      [`Incidents, last ${s.windowDays} days`, String(s.windowIncidents), "recent window"],
      [
        "Passenger rating",
        s.ratingCount ? `${(s.ratingAvg ?? 0).toFixed(2)} / 5 (${s.ratingCount})` : "no ratings yet",
        s.ratingBreakdown.map((n, i) => `${i + 1}★:${n}`).join("  "),
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: EMERALD, fontSize: 10 },
    styles: { fontSize: 10, cellPadding: 5 },
  });

  // incident log table
  const y = (doc as any).lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59);
  doc.text("Incident log (newest first)", 40, y);

  const rows = s.incidents.length
    ? s.incidents.map((e) => [
        e.ts ? new Date(e.ts).toLocaleString() : "—",
        eventLabel(e.type),
        typeof e.value === "number" && Math.abs(e.value) >= 1 ? `${e.value.toFixed(1)} g` : "",
      ])
    : [["—", "No recorded incidents — clean record", ""]];

  autoTable(doc, {
    startY: y + 10,
    head: [["Date & time", "Event", "Detail"]],
    body: rows,
    theme: "striped",
    headStyles: { fillColor: [51, 65, 85], fontSize: 10 },
    styles: { fontSize: 9, cellPadding: 4 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const t = String(data.cell.raw);
        if (t === "Crash") data.cell.styles.textColor = RED;
        else if (t === "Route deviation" || t.startsWith("Harsh") || t.startsWith("Hard")) data.cell.styles.textColor = AMBER;
        data.cell.styles.font = "helvetica-bold";
      }
    },
  });

  // footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Wayline bus tracking system — confidential driver record — page ${i}/${pages}`,
      40,
      doc.internal.pageSize.getHeight() - 24,
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = s.driverName.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "driver";
  doc.save(`driver-report_${safeName}_${stamp}.pdf`);
}
