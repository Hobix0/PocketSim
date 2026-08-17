#!/usr/bin/env python3
"""
validate.py — PocketSim Datenintegritäts-Check
─────────────────────────────────────────────────
Prüft Referenzen zwischen allen data/*.json Dateien VOR dem Deploy.
Läuft ohne Abhängigkeiten (Standardbibliothek), also auch in Pythonista.

Nutzung:
  python3 validate.py

Exit-Code 0 = alles ok, 1 = Fehler gefunden (nützlich für CI/Shortcuts-Automation).
"""

import json
import os
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data") \
    if os.path.isdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")) \
    else os.path.dirname(os.path.abspath(__file__))

FEHLER = []
WARNUNGEN = []


def load(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.isfile(path):
        FEHLER.append(f"Datei fehlt: {name}")
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError as e:
        FEHLER.append(f"{name}: Ungültiges JSON — {e}")
        return []


def ids(liste):
    return {x["id"] for x in liste if isinstance(x, dict) and "id" in x}


def main():
    print("🔍 PocketSim Datenvalidierung\n")

    materialien = load("materialien.json")
    maschinen   = load("maschinen.json")
    rezepte     = load("rezepte.json")
    gebaeude    = load("gebaeude.json")
    forschung   = load("forschung.json")
    grundstuecke= load("grundstuecke.json")
    auftraege   = load("auftraege.json")
    ereignisse  = load("ereignisse.json")

    mat_ids  = ids(materialien)
    mas_ids  = ids(maschinen)
    rez_ids  = ids(rezepte)
    geb_ids  = ids(gebaeude)
    for_ids  = ids(forschung)
    gs_ids   = ids(grundstuecke)

    # ── Doppelte IDs innerhalb einer Datei ──
    def check_duplicates(liste, name):
        seen, dups = set(), set()
        for x in liste:
            i = x.get("id")
            if i in seen:
                dups.add(i)
            seen.add(i)
        for d in dups:
            FEHLER.append(f"{name}: doppelte ID '{d}'")

    for liste, name in [(materialien,"materialien.json"),(maschinen,"maschinen.json"),
                         (rezepte,"rezepte.json"),(gebaeude,"gebaeude.json"),
                         (forschung,"forschung.json"),(grundstuecke,"grundstuecke.json")]:
        check_duplicates(liste, name)

    # ── Rezepte: maschine + inputs/outputs müssen existieren ──
    for r in rezepte:
        rid = r.get("id", "?")
        if r.get("maschine") and r["maschine"] not in mas_ids:
            FEHLER.append(f"rezepte.json[{rid}]: Maschine '{r['maschine']}' existiert nicht in maschinen.json")
        for inp in r.get("inputs", []):
            if inp.get("material") not in mat_ids:
                FEHLER.append(f"rezepte.json[{rid}]: Input-Material '{inp.get('material')}' existiert nicht in materialien.json")
        for out in r.get("outputs", []):
            if out.get("material") not in mat_ids:
                FEHLER.append(f"rezepte.json[{rid}]: Output-Material '{out.get('material')}' existiert nicht in materialien.json")

    # ── Maschinen: rezepte[] + aktivesRezept müssen existieren ──
    for m in maschinen:
        mid = m.get("id", "?")
        for r in m.get("rezepte", []):
            if r not in rez_ids:
                FEHLER.append(f"maschinen.json[{mid}]: Rezept '{r}' in rezepte[] existiert nicht in rezepte.json")
        aktiv = m.get("aktivesRezept")
        if aktiv and aktiv not in rez_ids:
            FEHLER.append(f"maschinen.json[{mid}]: aktivesRezept '{aktiv}' existiert nicht in rezepte.json")
        if aktiv and aktiv not in m.get("rezepte", []):
            WARNUNGEN.append(f"maschinen.json[{mid}]: aktivesRezept '{aktiv}' ist nicht in eigener rezepte[]-Liste enthalten")
        # rezepte deren maschine != diese Maschine, aber in rezepte[] gelistet
        for r in m.get("rezepte", []):
            rez_obj = next((x for x in rezepte if x.get("id") == r), None)
            if rez_obj and rez_obj.get("maschine") != mid:
                WARNUNGEN.append(f"maschinen.json[{mid}]: Rezept '{r}' zeigt in rezepte.json auf andere Maschine ('{rez_obj.get('maschine')}')")

    # ── Rezepte die auf keine Maschine verweisen (verwaist) ──
    referenzierte_rezepte = set()
    for m in maschinen:
        referenzierte_rezepte.update(m.get("rezepte", []))
    for r in rezepte:
        if r.get("id") not in referenzierte_rezepte:
            WARNUNGEN.append(f"rezepte.json[{r.get('id')}]: wird von keiner Maschine in rezepte[] referenziert (verwaist)")

    # ── Forschung: bedingung (Voraussetzung) muss existierende Forschung sein ──
    for f in forschung:
        fid = f.get("id", "?")
        bed = f.get("bedingung")
        if bed and bed not in for_ids:
            FEHLER.append(f"forschung.json[{fid}]: bedingung '{bed}' existiert nicht als Forschung")
        for eff in f.get("effekte", []):
            mat = eff.get("material")
            if mat and mat not in mat_ids:
                FEHLER.append(f"forschung.json[{fid}]: Effekt-Material '{mat}' existiert nicht in materialien.json")
            masch = eff.get("maschine")
            if masch and masch not in mas_ids:
                FEHLER.append(f"forschung.json[{fid}]: Effekt-Maschine '{masch}' existiert nicht in maschinen.json")

    # ── Forschung: Positions-Kollisionen INNERHALB derselben Kategorie ──
    pos_seen = {}
    for f in forschung:
        kat = f.get("kategorie", "?")
        pos = f.get("position", {})
        key = (kat, pos.get("spalte"), pos.get("reihe"))
        if key in pos_seen:
            FEHLER.append(f"forschung.json: Positions-Kollision in Kategorie '{kat}' Spalte={pos.get('spalte')} Reihe={pos.get('reihe')} — '{f.get('id')}' und '{pos_seen[key]}'")
        pos_seen[key] = f.get("id")

    # ── Gebäude: hallenTyp sollte von mindestens einer Maschine genutzt werden ──
    genutzte_hallentypen = set()
    for m in maschinen:
        genutzte_hallentypen.update(m.get("hallenTyp", []))
    for g in gebaeude:
        ht = g.get("hallenTyp")
        if ht and ht not in genutzte_hallentypen and g.get("maxMaschinen", 0) > 0:
            WARNUNGEN.append(f"gebaeude.json[{g.get('id')}]: hallenTyp '{ht}' wird von keiner Maschine genutzt (maxMaschinen={g.get('maxMaschinen')})")

    # ── Aufträge: material muss existieren ──
    for a in auftraege:
        aid = a.get("id", "?")
        if a.get("material") and a["material"] not in mat_ids:
            FEHLER.append(f"auftraege.json[{aid}]: Material '{a['material']}' existiert nicht in materialien.json")

    # ── Ereignisse: effekt.material muss existieren (falls vorhanden) ──
    for e in ereignisse:
        eid = e.get("id", "?")
        mat = e.get("effekt", {}).get("material")
        if mat and mat not in mat_ids:
            FEHLER.append(f"ereignisse.json[{eid}]: Effekt-Material '{mat}' existiert nicht in materialien.json")

    # ── Materialien: tier-Sprünge (Sanity-Check, keine Pflicht) ──
    tiers_used = sorted({m.get("tier") for m in materialien if m.get("tier") is not None})
    if tiers_used and tiers_used != list(range(min(tiers_used), max(tiers_used)+1)):
        WARNUNGEN.append(f"materialien.json: Tier-Lücke gefunden, genutzte Tiers: {tiers_used}")

    # ── Report ──
    print(f"Materialien: {len(materialien)}  Maschinen: {len(maschinen)}  Rezepte: {len(rezepte)}")
    print(f"Gebäude: {len(gebaeude)}  Forschung: {len(forschung)}  Grundstücke: {len(grundstuecke)}")
    print(f"Aufträge: {len(auftraege)}  Ereignisse: {len(ereignisse)}\n")

    if FEHLER:
        print(f"❌ {len(FEHLER)} FEHLER:\n")
        for f in FEHLER:
            print(f"   ✗ {f}")
        print()
    else:
        print("✅ Keine kritischen Fehler gefunden.\n")

    if WARNUNGEN:
        print(f"⚠️  {len(WARNUNGEN)} WARNUNGEN (spielbar, aber wert zu prüfen):\n")
        for w in WARNUNGEN:
            print(f"   ⚠ {w}")
        print()

    return 1 if FEHLER else 0


if __name__ == "__main__":
    sys.exit(main())
