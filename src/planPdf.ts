import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { displayAiText } from "./displayText";
import { makePlanMonthCardData } from "./PlanMonthCard";
import { PlanPdfMonthCard } from "./PlanPdfMonthCard";
const pathlightLogoUrl = "/pathlight-logo-original.webp";

type Project = { month: number; title: string; skillIndex: number; build?: string; projectDetails?: string; targetSkill?: string; successCriteria?: string[]; timeNeeded?: string; thumbnailThemeId?: string };

export function planPdfFileName(career: string) {
  const safeCareer = displayAiText(career)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return `${safeCareer || "Career"} - 12 Month plan.pdf`;
}

export async function makePlanPdf(args: {
  career: string;
  gender: string;
  panels: { time?: string; caption: string }[];
  projects: Project[];
  skills: string[];
  imageByTheme: Map<string, string>;
  dayDescription?: string;
}) {
  const career = displayAiText(args.career);
  const dayDescription = args.dayDescription?.trim() ? displayAiText(args.dayDescription.trim()) : "";
  const skills = args.skills.map(displayAiText);
  const cards = [...args.projects].sort((a, b) => a.month - b.month)
    .map(project => makePlanMonthCardData(project, skills, args.imageByTheme));
  const renderer = document.createElement("div");
  renderer.className = "m1 plan-pdf-render-root";
  Object.assign(renderer.style, { position: "fixed", left: "-10000px", top: "0", width: "680px", background: "#fff", zIndex: "-1" });
  document.body.append(renderer);
  const root = createRoot(renderer);
  root.render(createElement("main", { className: "day-full-plan" },
    createElement("ol", { className: "day-full-plan-list plan-pdf-month-list" }, cards.map(data =>
      createElement("li", { className: "day-full-plan-card plan-pdf-month-item", key: data.month }, createElement(PlanPdfMonthCard, { data })),
    )),
  ));
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const cardElements = [...renderer.querySelectorAll<HTMLElement>(".day-full-plan-card")];
    if (cardElements.length !== cards.length) throw new Error("The shared monthly card renderer did not create every saved plan month.");
    await Promise.all([...renderer.querySelectorAll("img")].map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    })));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all([...renderer.querySelectorAll("img")].map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    })));
    const renderedCards = await Promise.all(cardElements.map(async (element, index) => {
      const canvas = await html2canvas(element, { backgroundColor: "#fff", scale: 2, useCORS: true, logging: false });
      return { month: cards[index].month, image: canvas.toDataURL("image/png"), height: canvas.height * 178 / canvas.width };
    }));

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageWidth = 210, pageHeight = 297, left = 16, right = 194, width = right - left;
    const footerY = 286, pageBottom = 279, lineHeight = (size: number) => size * 25.4 / 72 * 1.15;
    const gap = 4.5;
    let logoPng: string | null = null;
    try {
      const response = await fetch(pathlightLogoUrl);
      if (response.ok) {
        const image = new Image();
        const objectUrl = URL.createObjectURL(await response.blob());
        try {
          image.src = objectUrl;
          await image.decode();
          const canvas = document.createElement("canvas"); canvas.width = 540; canvas.height = 157;
          const context = canvas.getContext("2d");
          if (context) { context.drawImage(image, 0, 0, 540, 157); logoPng = canvas.toDataURL("image/png"); }
        } finally { URL.revokeObjectURL(objectUrl); }
      }
    } catch { /* Keep the text header when the mark cannot be loaded. */ }

    const introBodySize = 8.3, introHeadingSize = 11.5, introTitleSize = 21;
    const bodyWrap = (text: string, maxWidth: number, size: number) => {
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(size);
      return text ? pdf.splitTextToSize(text, maxWidth) as string[] : [];
    };
    const descriptionLines = bodyWrap(dayDescription, width, introBodySize);
    const uniqueSkills = [...new Set(skills.filter(Boolean))];
    const chips = uniqueSkills.map(skill => {
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.8);
      return { skill, width: pdf.getTextWidth(skill) + 6, height: 6.5 };
    });
    let chipX = left, chipRow = 0;
    const chipPositions = chips.map(chip => {
      if (chipX + chip.width > right) { chipX = left; chipRow++; }
      const position = { chip, x: chipX, row: chipRow };
      chipX += chip.width + gap;
      return position;
    });
    const titleBottom = 44 + lineHeight(introTitleSize);
    const dayHeadingTop = titleBottom + gap;
    const dayBodyTop = dayHeadingTop + lineHeight(introHeadingSize) + gap;
    const dayEnd = dayBodyTop + descriptionLines.length * lineHeight(introBodySize);
    const skillsHeadingTop = (dayDescription ? dayEnd : titleBottom) + gap;
    const chipsTop = skillsHeadingTop + lineHeight(introHeadingSize) + gap;
    const chipRowCount = chips.length ? chipRow + 1 : 0;
    const monthStart = chipsTop + chipRowCount * 6.5 + Math.max(0, chipRowCount - 1) * gap + gap;

    const laterStart = 23 + gap;
    const groups: { indices: number[]; start: number }[] = [{ indices: [], start: monthStart }];
    let pageIndex = 0, y = monthStart;
    renderedCards.forEach((card, index) => {
      const height = card.height;
      const start = groups[pageIndex].start;
      if (height > pageBottom - laterStart) throw new Error(`Month ${card.month} is too tall to keep its shared card design intact on one PDF page.`);
      if (y + height > pageBottom && groups[pageIndex].indices.length) {
        groups.push({ indices: [], start: laterStart }); pageIndex++; y = laterStart;
      } else if (y + height > pageBottom && start !== laterStart) {
        groups.push({ indices: [], start: laterStart }); pageIndex++; y = laterStart;
      }
      groups[pageIndex].indices.push(index);
      y += height + gap;
    });

    const drawHeaderFooter = (index: number) => {
      pdf.setFillColor(255, 255, 255); pdf.rect(0, 0, pageWidth, pageHeight, "F");
      if (logoPng) { try { pdf.addImage(logoPng, "PNG", left, 5, 54, 15.7, "pathlight-logo", "FAST"); } catch { /* Skip the logo if it cannot be decoded. */ } }
      pdf.setTextColor(58, 58, 72); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10.5); pdf.text(career, right, 13.4, { align: "right" });
      pdf.setDrawColor(216, 211, 224); pdf.setLineWidth(0.35); pdf.line(left, 23, right, 23); pdf.line(left, 281, right, 281);
      pdf.setTextColor(85, 85, 102); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
      pdf.text("Possibilities to explore together", left, footerY); pdf.text(`Page ${index + 1} out of ${groups.length}`, right, footerY, { align: "right" });
    };

    groups.forEach((group, pageIndex) => {
      if (pageIndex) pdf.addPage();
      drawHeaderFooter(pageIndex);
      if (pageIndex === 0) {
        pdf.setTextColor(102, 70, 171); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8.5); pdf.text("A YEAR OF SMALL STEPS", left, 33);
        pdf.setTextColor(31, 27, 46); pdf.setFont("helvetica", "bold"); pdf.setFontSize(introTitleSize); pdf.text(`${career}, 12-month plan`, left, 44);
        if (dayDescription) {
          pdf.setTextColor(31, 27, 46); pdf.setFont("helvetica", "bold"); pdf.setFontSize(introHeadingSize); pdf.text("A day in the life", left, dayHeadingTop + 3.6);
          pdf.setTextColor(58, 58, 72); pdf.setFont("helvetica", "normal"); pdf.setFontSize(introBodySize); pdf.text(descriptionLines, left, dayBodyTop + 3.6);
        }
        pdf.setTextColor(31, 27, 46); pdf.setFont("helvetica", "bold"); pdf.setFontSize(introHeadingSize); pdf.text("Skills your child will build", left, skillsHeadingTop + 3.6);
        for (const { chip, x, row } of chipPositions) {
          const chipY = chipsTop + row * (chip.height + gap);
          pdf.setFillColor(240, 234, 250); pdf.roundedRect(x, chipY, chip.width, chip.height, 2.5, 2.5, "F");
          pdf.setTextColor(102, 70, 171); pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.8); pdf.text(chip.skill, x + 3, chipY + chip.height * 0.68);
        }
      }
      let cardY = group.start;
      for (const index of group.indices) {
        const card = renderedCards[index];
        pdf.addImage(card.image, "PNG", left, cardY, width, card.height, `month-${card.month}`, "FAST");
        cardY += card.height + gap;
      }
    });

    pdf.setProperties({ title: `${career} - 12 Month plan`, subject: "Pathlight career exploration plan", author: "Pathlight" });
    const output = pdf.output("arraybuffer");
    const bytes = new Uint8Array(output), marker = new TextEncoder().encode("/CreationDate (");
    for (let start = 0; start <= bytes.length - marker.length; start++) {
      if (marker.every((byte, offset) => bytes[start + offset] === byte)) {
        let end = start + marker.length; while (end < bytes.length && bytes[end] !== 41) end++;
        bytes.fill(32, start + marker.length, end); break;
      }
    }
    return new Blob([output], { type: "application/pdf" });
  } finally {
    root.unmount(); renderer.remove();
  }
}
