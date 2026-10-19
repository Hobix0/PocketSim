// Farben aus einer Bilddatei lesen (Palette, Etiketten) – für die Voxel-Umrechnung.
// Braucht den Browser (Bild + Canvas).

export interface Pixels {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

export async function loadPixels(url: string): Promise<Pixels | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    return { w: canvas.width, h: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  } catch (err) {
    console.warn('Bild für Voxel-Farben nicht lesbar:', url, err);
    return null;
  }
}

/** Index des Pixels unter einer UV-Koordinate (wiederholend, v = 0 unten wie bei three.js). */
export function pixelAt(p: Pixels, u: number, v: number): number {
  const x = Math.min(p.w - 1, Math.floor((u - Math.floor(u)) * p.w));
  const y = Math.min(p.h - 1, Math.floor((1 - (v - Math.floor(v))) * p.h));
  return (y * p.w + x) * 4;
}
