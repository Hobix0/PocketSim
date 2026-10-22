import type { Bounds } from '../navigation/NavGrid';

// Gelände als Höhenfeld: Eckpunkte in einem festen Raster (Standard 0,5 m), dazwischen wird gemittelt.
// Die Höhe setzt sich zusammen aus
//  - eigenen Bearbeitungen (Gelände-Werkzeug: anheben, absenken, ebnen) – werden gespeichert
//  - Absenkungen durch Bauteile (z. B. die Rampenabfahrt vor einem Ladetor) – ergeben sich aus der Welt
// Keine three.js-Abhängigkeit; die Darstellung (TerrainView) liest nur die Höhen.
// Dargestellt wird im Voxel-Stil: jede Zelle (0,5 m) ist eine Säule mit flacher Oberseite,
// ihre Höhe auf Stufen (Standard 0,25 m) gerundet – siehe cellHeight().

/** Absenkung durch ein Bauteil: ein Graben mit flachem Teil und Schräge nach außen */
export interface TerrainCut {
  /** Anfang (an der Wand) */
  x: number;
  z: number;
  /** Richtung nach außen (Einheitsvektor) */
  dx: number;
  dz: number;
  breite: number;
  tiefe: number;
  flach: number;
  schraege: number;
}

export interface TerrainRaster { minX: number; minZ: number; nz: number }

export class Terrain {
  readonly nx: number;
  readonly nz: number;
  /** Wird bei jeder Änderung hochgezählt (Darstellung baut dann neu) */
  version = 0;
  private readonly edits: Float32Array;
  private cuts: TerrainCut[] = [];

  constructor(readonly bounds: Bounds, readonly zelle = 0.5, readonly maxHoehe = 2.5, readonly stufe = 0.25) {
    this.nx = Math.round((bounds.maxX - bounds.minX) / zelle) + 1;
    this.nz = Math.round((bounds.maxZ - bounds.minZ) / zelle) + 1;
    this.edits = new Float32Array(this.nx * this.nz);
  }

  /** Absenkungen der Bauteile setzen (bei jeder Änderung der Welt) */
  setCuts(cuts: TerrainCut[]): void {
    this.cuts = cuts;
    this.version++;
  }

  /** Höhe eines Eckpunkts (für die Darstellung). `rand`: so weit innen fängt eine Absenkung erst an */
  vertexHeight(ix: number, iz: number, rand = 0.5): number {
    const x = this.bounds.minX + ix * this.zelle, z = this.bounds.minZ + iz * this.zelle;
    return this.edits[ix * this.nz + iz] + Math.min(0, ...this.cuts.map((c) => cutDepth(c, x, z, rand)));
  }

  /**
   * Voxel-Höhe einer Zelle (zwischen den Eckpunkten ix..ix+1, iz..iz+1) für die Darstellung:
   * eigene Bearbeitung gemittelt und auf Stufen gerundet, Absenkungen ab der Zellmitte gemessen.
   * Abgesenkt wird abgerundet, damit die Erde sicher unter Bauteilen wie der Rampe bleibt.
   */
  cellHeight(ix: number, iz: number): number {
    const x = this.bounds.minX + (ix + 0.5) * this.zelle, z = this.bounds.minZ + (iz + 0.5) * this.zelle;
    const e = (a: number, b: number) => this.edits[a * this.nz + b];
    const edit = (e(ix, iz) + e(ix + 1, iz) + e(ix, iz + 1) + e(ix + 1, iz + 1)) / 4;
    const cut = Math.min(0, ...this.cuts.map((c) => cutDepth(c, x, z, 0.5, this.zelle / 2)));
    const h = edit + cut;
    const q = h < -0.02 ? Math.floor(h / this.stufe) : Math.round(h / this.stufe);
    return q * this.stufe;
  }

  /** Höhe an einer beliebigen Stelle (bearbeitetes Gelände und genaue Absenkungen) */
  heightAt(x: number, z: number): number {
    return this.editAt(x, z) + Math.min(0, ...this.cuts.map((c) => cutDepth(c, x, z, 0)));
  }

  /** Nur die eigenen Bearbeitungen an einer Stelle (gemittelt) */
  editAt(x: number, z: number): number {
    const fx = (x - this.bounds.minX) / this.zelle, fz = (z - this.bounds.minZ) / this.zelle;
    const ix = Math.max(0, Math.min(this.nx - 2, Math.floor(fx))), iz = Math.max(0, Math.min(this.nz - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix)), tz = Math.max(0, Math.min(1, fz - iz));
    const e = (a: number, b: number) => this.edits[a * this.nz + b];
    return (e(ix, iz) * (1 - tx) + e(ix + 1, iz) * tx) * (1 - tz) + (e(ix, iz + 1) * (1 - tx) + e(ix + 1, iz + 1) * tx) * tz;
  }

  /** Größte Abweichung vom flachen Boden innerhalb eines Rechtecks (zum Bauen muss es eben sein) */
  maxEditIn(minX: number, maxX: number, minZ: number, maxZ: number): number {
    let m = 0;
    this.forVertices(minX - this.zelle, maxX + this.zelle, minZ - this.zelle, maxZ + this.zelle, (i) => { m = Math.max(m, Math.abs(this.edits[i])); });
    return m;
  }

  /**
   * Pinsel: hebt (`delta` > 0) oder senkt den Boden um bis zu `delta` in der Mitte, weich zum Rand.
   * `erlaubt` sagt, wo bearbeitet werden darf. Gibt die bewegte Erde in m³ zurück.
   */
  brush(x: number, z: number, radius: number, delta: number, erlaubt: (x: number, z: number) => boolean): number {
    let volumen = 0;
    this.forVertices(x - radius, x + radius, z - radius, z + radius, (i, vx, vz) => {
      const d = Math.hypot(vx - x, vz - z);
      if (d > radius || !erlaubt(vx, vz)) return;
      const w = (1 - d / radius) ** 2 * (3 - 2 * (1 - d / radius)) ; // weich auslaufend
      const before = this.edits[i];
      // Zum Kartenrand hin höchstens 45° Böschung
      const b = this.bounds, lim = Math.min(this.maxHoehe, vx - b.minX, b.maxX - vx, vz - b.minZ, b.maxZ - vz);
      const after = Math.max(-lim, Math.min(lim, before + delta * w));
      this.edits[i] = after;
      volumen += Math.abs(after - before) * this.zelle * this.zelle;
    });
    if (volumen > 0) this.version++;
    return volumen;
  }

  /** Ebnen: zieht den Boden im Pinsel Richtung flach (0) – höchstens um `rate` je Aufruf. Gibt m³ zurück. */
  flatten(x: number, z: number, radius: number, rate: number, erlaubt: (x: number, z: number) => boolean): number {
    let volumen = 0;
    this.forVertices(x - radius, x + radius, z - radius, z + radius, (i, vx, vz) => {
      if (Math.hypot(vx - x, vz - z) > radius || !erlaubt(vx, vz)) return;
      const before = this.edits[i];
      const after = Math.abs(before) <= rate ? 0 : before - Math.sign(before) * rate;
      this.edits[i] = after;
      volumen += Math.abs(after - before) * this.zelle * this.zelle;
    });
    if (volumen > 0) this.version++;
    return volumen;
  }

  /** Für den Spielstand: nur veränderte Punkte als [Index, Höhe] */
  state(): [number, number][] {
    const out: [number, number][] = [];
    this.edits.forEach((h, i) => { if (Math.abs(h) >= 0.005) out.push([i, Math.round(h * 100) / 100]); });
    return out;
  }

  /** Lage des Rasters (steht mit im Spielstand, damit Änderungen auch nach einer größeren Karte an ihrem Ort bleiben) */
  raster(): TerrainRaster {
    return { minX: this.bounds.minX, minZ: this.bounds.minZ, nz: this.nz };
  }

  /** `von`: Raster, mit dem der Spielstand gespeichert wurde (fehlt: dieses) */
  restore(list: unknown, von?: TerrainRaster): void {
    this.edits.fill(0);
    if (Array.isArray(list)) {
      for (const e of list) {
        if (!Array.isArray(e) || e.length !== 2) continue;
        let [i, h] = e as [number, number];
        if (von && Number.isInteger(i) && (von.minX !== this.bounds.minX || von.minZ !== this.bounds.minZ || von.nz !== this.nz)) {
          const ix = Math.round((von.minX + Math.floor(i / von.nz) * this.zelle - this.bounds.minX) / this.zelle);
          const iz = Math.round((von.minZ + (i % von.nz) * this.zelle - this.bounds.minZ) / this.zelle);
          if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
          i = ix * this.nz + iz;
        }
        if (Number.isInteger(i) && i >= 0 && i < this.edits.length && Number.isFinite(h) && !this.isEdge(i)) this.edits[i] = Math.max(-this.maxHoehe, Math.min(this.maxHoehe, h));
      }
    }
    this.version++;
  }

  private isEdge(i: number): boolean {
    const ix = Math.floor(i / this.nz), iz = i % this.nz;
    return ix === 0 || iz === 0 || ix === this.nx - 1 || iz === this.nz - 1;
  }

  private forVertices(minX: number, maxX: number, minZ: number, maxZ: number, fn: (i: number, x: number, z: number) => void): void {
    const b = this.bounds, s = this.zelle;
    // Randpunkte bleiben immer flach, sonst stünde am Kartenrand eine offene Klippe
    const x0 = Math.max(1, Math.ceil((minX - b.minX) / s)), x1 = Math.min(this.nx - 2, Math.floor((maxX - b.minX) / s));
    const z0 = Math.max(1, Math.ceil((minZ - b.minZ) / s)), z1 = Math.min(this.nz - 2, Math.floor((maxZ - b.minZ) / s));
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) fn(ix * this.nz + iz, b.minX + ix * s, b.minZ + iz * s);
  }
}

/**
 * Tiefe einer Absenkung an einer Stelle (≤ 0). `rand`: so weit reicht sie für die Darstellung unter das Gebäude.
 * `seite`: seitlich so viel schmaler (Voxel-Zellen ragen sonst über die Wände hinaus).
 */
export function cutDepth(c: TerrainCut, x: number, z: number, rand: number, seite = 0): number {
  const px = x - c.x, pz = z - c.z;
  const a = px * c.dx + pz * c.dz;
  const b = Math.abs(px * -c.dz + pz * c.dx);
  const laenge = c.flach + c.schraege;
  // Seitlich bis unter die Wände absenken, sonst ragt die Erde zwischen den Rasterpunkten über die Sohle
  if (b > c.breite / 2 - seite || a < -rand || a > laenge - rand * 0.2) return 0;
  // Gras etwas unter den Betonboden legen, damit nichts durchscheint
  const extra = rand > 0 ? 0.15 : 0;
  if (a <= c.flach) return -(c.tiefe + extra);
  return -(c.tiefe + extra) * (1 - (a - c.flach) / c.schraege);
}
