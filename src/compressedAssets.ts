const pathlightLogoUrl = "/pathlight-logo-original.webp";
import upiQrUrl from "./assets/optimized/brand/upi-qr.webp";

const sceneFiles = import.meta.glob("./assets/optimized/scenes/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const thumbnailFiles = import.meta.glob("./assets/optimized/thumbnails/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export { pathlightLogoUrl, upiQrUrl };

export function sceneImageUrl(sceneId: string | undefined, gender: string, fallback: string | null) {
  const neutralScene = thumbnailFiles["./assets/optimized/thumbnails/video-recording.webp"];
  if (!sceneId) return fallback ?? neutralScene;
  if (gender !== "boy" && gender !== "girl") return fallback ?? neutralScene;
  return sceneFiles[`./assets/optimized/scenes/${sceneId}-${gender}.webp`] ?? fallback ?? neutralScene;
}

export function thumbnailImageUrl(themeId: string, fallback: string | null) {
  return thumbnailFiles[`./assets/optimized/thumbnails/${themeId}.webp`] ?? fallback;
}
