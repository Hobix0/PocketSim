import type { DaylightSettings } from '../content/definitions';
import { parseTime } from '../economy/Customers';

// Tag und Nacht aus der Uhrzeit: wie hell Sonne und Umgebung sind und welche Farben gelten.
// Zwischen Sonnenaufgang und -untergang ist Tag; davor und danach wird über die Dämmerung überblendet.
// Keine three.js-Abhängigkeit – die Szene setzt die Werte nur um.

export interface Daylight {
  /** 0 = Nacht, 1 = voller Tag */
  tag: number;
  /** 0 = keine Dämmerung, 1 = mitten in der Dämmerung (für die warme Farbe) */
  daemmerung: number;
  sonne: number;
  umgebung: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

export function daylight(s: DaylightSettings, minuteOfDay: number): Daylight {
  const auf = parseTime(s.sonnenaufgang), unter = parseTime(s.sonnenuntergang);
  const d = Math.max(1, s.daemmerungMinuten);
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  // Morgens: von (auf − d/2) bis (auf + d/2) hell werden, abends entsprechend dunkel
  const morgen = Math.min(1, Math.max(0, (m - (auf - d / 2)) / d));
  const abend = Math.min(1, Math.max(0, ((unter + d / 2) - m) / d));
  const tag = smooth(Math.min(morgen, abend));
  const daemmerung = 1 - Math.abs(tag - 0.5) * 2;
  return {
    tag,
    daemmerung: tag > 0 && tag < 1 ? daemmerung : 0,
    sonne: s.nacht.sonne + (s.tag.sonne - s.nacht.sonne) * tag,
    umgebung: s.nacht.umgebung + (s.tag.umgebung - s.nacht.umgebung) * tag,
  };
}
