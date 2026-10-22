# Ordnet alle Bauteile (data/bau/*.json) den Bereichen und Gruppen des Baumenüs zu ("gruppe": "bereich/gruppe")
# und fasst Varianten zu Familien zusammen ("variante": {familie, name, farbe}).
# Neue Bauteile können "gruppe" und "variante" auch direkt in ihrer Datei setzen – vorhandene Werte bleiben stehen.
# Aufruf: python3 scripts/assign-baumenue.py
import json, glob, re

FARBEN = {
  'weiss': ('Weiß', '#eeeae2'), 'holz': ('Holz', '#9a6a43'), 'schwarz': ('Schwarz', '#2b2b2e'), 'salbei': ('Salbei', '#7c9a7e'),
  'metro': ('Metro-Fliese', '#f4f1ea'), 'beton': ('Beton', '#9aa0a3'), 'anthrazit': ('Anthrazit', '#3a3f44'),
  'klassik': ('Blau-Orange', '#2f5d9e'), 'verzinkt': ('Verzinkt', '#a9b0b5'), 'gruen': ('Grün-Gelb', '#3f6b55'),
  'rot': ('Rot', '#c8382f'), 'creme': ('Creme', '#efe6d2'),
}
REGELN = [
  (r'^(pal_rahmen|pal_traverse|schwerlast_|holzregal$|gitterbox$|rollcontainer$)', 'lager/regalsysteme'),
  (r'^(pal_anfahrschutz|pal_gangendschutz|rammschutz|saeulenschutz|leitplanke|schutzgelaender|leitkegel|leitbake|absperrkette|verkehrsspiegel|warnschild_stapler|radstopper)', 'lager/sicherheit'),
  (r'^(europalette|folienpalette|palettenstapel|kartonstapel|holzkisten|fass|packtisch)$', 'lager/ablagen'),
  (r'^(gabelstapler|hubwagen|sackkarre|stehleiter|spind|feuerloescher|lagerschild)$', 'lager/technik'),
  (r'^(ladetor|sektionaltor|rampenabfahrt|trapezblech_)', 'lager/tore'),
  (r'^(fenster|schaufenster)', 'gebaeude/fenster'),
  (r'^pallisade', 'aussen/zaeune'),
  (r'^dach$', 'gebaeude/dach'),
  (r'^(vr_|brotregal$|getraenkeregal$|wandregal_schmal$|regal_landhaus$|kassenregal$|obststand_kisten$)', 'laden/regale'),
  (r'^(kuehlregal_|kuehlschrank_|truhe_|eistruhe_)', 'laden/kuehlung'),
  (r'^(kasse_schwarz|einkaufsterminal|wagenbox)$', 'laden/kasse'),
  (r'^schild_cafe$', 'cafe/deko'),
  (r'^(schild_|aufsteller_angebot|infotafel_|kreidetafel)', 'laden/schilder'),
  (r'^(pflanzentop_|pflanzkuebel_boden)', 'laden/deko'),
  (r'^(tresen_|bestelltresen_|cafe_theke|kuchenvitrine|bartresen|rueckbuffet|muehlenstation|filterbar)', 'cafe/tresen'),
  (r'^(kaffeemaschine|siebtraeger_)', 'cafe/maschinen'),
  (r'^(bistrotisch|sofa_cafe|sessel_cafe|couchtisch|buecherregal_cafe|stehlampe)$', 'cafe/moebel'),
  (r'^(monstera|wandregal_tassen|menuetafel|neon_coffee)$', 'cafe/deko'),
  (r'^(backstation|saftpresse|aufschnittmaschine)$', 'produktion/maschinen'),
  (r'^lichtschiene_', 'licht/schienen'),
  (r'^strassenlaterne$', 'aussen/strasse'),
  (r'^(poller|fahrradstaender|holzbank|muelltonne|papiercontainer|baum_strasse)$', 'aussen/strasse'),
  (r'^lavendelkuebel$', 'aussen/pflanzen'),
  (r'^(terrassentisch|blumenkasten)$', 'aussen/terrasse'),
]
# Familien: Muster → (Familie, Variante)
FAMILIEN = [
  (r'^vr_(wand_kurz|gondel_kurz|wand|gondel|kopf|aktion|innenecke|aussenecke)_(\w+)$', lambda m: (f'vr_{m[1]}', m[2])),
  (r'^tresen_(holz|metro|beton|salbei)_(gerade|ecke|ende)$', lambda m: (f'tresen_{m[2]}', m[1])),
  (r'^bestelltresen_(\w+)$', lambda m: ('bestelltresen', m[1])),
  (r'^kuehlregal_(weiss|anthrazit)$', lambda m: ('kuehlregal', m[1])),
  (r'^kuehlschrank_(weiss|anthrazit)_(\d)$', lambda m: (f'kuehlschrank_{m[2]}', m[1])),
  (r'^truhe_(weiss|anthrazit)_(\w+)$', lambda m: (f'truhe_{m[2]}', m[1])),
  (r'^eistruhe_(\w+)$', lambda m: ('eistruhe', m[1])),
  (r'^pal_rahmen_(\w+?)_(\d+)$', lambda m: (f'pal_rahmen_{m[2]}', m[1])),
  (r'^pal_traverse_(\w+?)_(\d+)_(\w+)$', lambda m: (f'pal_traverse_{m[2]}_{m[3]}', m[1])),
  (r'^schwerlast_(klassik|verzinkt|gruen)_(\w+)$', lambda m: (f'schwerlast_{m[2]}', m[1])),
  (r'^siebtraeger_(\w+)$', lambda m: ('siebtraeger', m[1])),
]
NAMEN_FIX = {'siebtraeger': 'Siebträger'}

familien = {}
for f in sorted(glob.glob('data/bau/*.json')):
    d = json.load(open(f))
    if 'gruppe' not in d:
        g = next((g for r, g in REGELN if re.search(r, d['id'])), None)
        if g is None:
            g = {'boden': 'gebaeude/boden', 'wand': 'gebaeude/waende', 'anbau': 'gebaeude/fassade', 'decke': 'licht/leuchten'}.get(d['ebene'], 'laden/deko')
        d['gruppe'] = g
    for r, fn in FAMILIEN:
        m = re.match(r, d['id'])
        if m:
            fam, var = fn(m)
            name, farbe = FARBEN[var]
            d['variante'] = {'familie': fam, 'name': name, 'farbe': farbe}
            fname = NAMEN_FIX.get(fam) or re.sub(r'\s+', ' ', d['name'].replace(name, '')).replace('( ', '(').strip()
            familien.setdefault(fam, fname)
            break
    open(f, 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

p = 'data/baumenue/standard.json'
s = json.load(open(p))
s['familien'] = dict(sorted(familien.items()))
open(p, 'w').write(json.dumps(s, ensure_ascii=False, indent=2) + '\n')
print(len(familien), 'Familien')
