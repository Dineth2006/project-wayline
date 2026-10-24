"use client";

/**
 * Arena background image processing (operator upload only).
 * Center-crops any image to 1:1, downscales to at most 1024x1024,
 * and returns a JPEG data URL sized to fit comfortably in RTDB
 * (typically 100-400 KB; RTDB allows 10 MB per value).
 */
const TARGET = 1024;

export async function processArenaImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (png, jpg, webp...).");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode the image."));
    el.src = dataUrl;
  });

  // center-crop to square (the arena is exactly 1:1)
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const out = Math.min(TARGET, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);

  return canvas.toDataURL("image/jpeg", 0.82);
}
