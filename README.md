# PocketSim Factory

> Baue in 3D eine Fabrik in Remscheid auf: Erz bohren, Bänder ziehen, Platten schmelzen und Motoren montieren, bis die Fertigung durchgetaktet läuft.

**Live spielen:** [herosrs.github.io/PocketSim](https://herosrs.github.io/PocketSim/)

PocketSim Factory ist ein Fabrik-Aufbauspiel im Browser, inspiriert von **Factorio**, **Satisfactory** und **shapez**. Die 3D-Grafik läuft mit Three.js. Es gibt keinen Build-Schritt, keine Installation und keinen Login, und das Spiel läuft auf dem Desktop genauso wie auf dem Handy.

---

## Spielprinzip

1. **Gewinnen**: Bohrer auf Eisen-, Kupfer-, Kohle- oder Sandvorkommen setzen, Holzfäller neben Wälder.
2. **Transportieren**: Förderbänder ziehen. Gebäude geben ihre Waren an angrenzende Bänder ab, die von ihnen wegzeigen. Verteiler und Kreuzungen helfen beim Routing.
3. **Verarbeiten**: Schmelzofen, Sägewerk, Presse, Hochofen und Montagehalle verwandeln Rohstoffe in immer wertvollere Produkte.
4. **Verkaufen**: Was im Handelsdepot ankommt, wird verkauft oder für einen Auftrag gezählt. Wer den Markt mit einer Ware flutet, drückt den Preis.
5. **Forschen**: Neue Gebäude und Boni kosten Geld und setzen voraus, dass bestimmte Waren schon geliefert wurden.

### Produktionsketten

| Stufe | Produkte |
|---|---|
| Rohstoffe | Holz, Eisenerz, Kupfererz, Kohle, Sand |
| Grundmaterial | Bretter, Eisenplatten, Kupferplatten, Glas |
| Bauteile | Zahnräder, Kupferdraht, Stahlträger |
| Komponenten | Schaltkreise, Motoren, Möbel |

### Systeme

- **Strom**: Netzanschluss (kostet laufend Geld), Windräder (je nach Wind), Kohlekraftwerke (brauchen Kohle per Band) und Solarfelder (nur tagsüber). Bei Strommangel laufen alle Maschinen langsamer.
- **Tag & Nacht**: Ein Tag dauert 6 Minuten. Nachts leuchten die Hallen, und Solarfelder liefern nichts.
- **Aufträge**: Bis zu 3 gleichzeitig, mit Zeitlimit und Bonus-Belohnung.
- **Ereignisse**: Bauboom, Energiekrise, Sturmfront, Förderprogramm und mehr.
- **Upgrades**: Maschinen, Bohrer und Holzfäller bis Stufe 5 ausbauen.
- **Ziele**: Ein geführter Einstieg vom ersten Bohrer bis zur Motorenfertigung.
- **Statistik**: Einnahmenverlauf, Produktion pro Minute und Marktpreise.
- **Speichern**: Automatisch alle 30 s im Browser, dazu Export/Import als JSON.

---

## Steuerung

| Eingabe | Aktion |
|---|---|
| Linksklick | Auswählen / Bauen · Ziehen verschiebt die Karte |
| Rechte Maustaste ziehen | Karte verschieben |
| Mittlere Maustaste ziehen, `Q` / `E` | Kamera drehen |
| Mausrad | Zoomen |
| `WASD` / Pfeiltasten | Kamera bewegen |
| `R` | Gebäude bzw. Band drehen |
| `X` | Abrisswerkzeug |
| `C` | Gebäude unter der Maus kopieren |
| `1`–`9`, `Tab` | Gebäude wählen, Kategorie wechseln |
| `F` / `T` | Forschung / Statistik |
| Leertaste | Pause |
| Touch | Ein Finger baut bzw. verschiebt, zwei Finger bewegen, zoomen und drehen |

---

## Technik

```
index.html        Einstieg, Import-Map für Three.js (CDN)
css/style.css     Leitstand-UI nach dem „Factory“-Stil (Refero Styles), responsiv bis Smartphone
src/data.js       Spielinhalte: Waren, Rezepte, Gebäude, Forschung, Ziele, Ereignisse
src/sim.js        Simulation: Weltgenerierung, Bänder, Maschinen, Strom, Markt, Speichern
src/models.js     Prozedurale Low-Poly-Modelle für Gebäude, Bänder und Waren
src/render.js     Three.js-Szene: Terrain, Instancing, Partikel, Tag/Nacht, Bloom
src/input.js      Kamera, Maus/Touch/Tastatur, Bauwerkzeuge
src/ui.js         HUD, Baumenü, Inspektor, Aufträge, Forschung, Statistik, Menü
src/audio.js      Synthesizer-Sounds über WebAudio
src/main.js       Verdrahtung und Spielschleife
```

- Keine Abhängigkeiten außer Three.js (r170, per Import-Map von jsDelivr)
- Alle Modelle und Icons werden zur Laufzeit erzeugt, es gibt keine Asset-Dateien
- Bänder und Waren werden über `InstancedMesh` gezeichnet, dadurch bleiben auch große Fabriken flüssig

### Lokal starten

ES-Module brauchen einen Webserver:

```bash
python3 -m http.server 8080
```

Danach `http://localhost:8080` öffnen. `server.py` funktioniert weiterhin, zum Beispiel in Pythonista auf dem iPhone.

---

## Entwicklung

Entwickelt von **Luca** (HerosRS) mit Unterstützung von Claude (Anthropic).

## Lizenz

Privates Projekt, kein Open Source.
© 2025 HerosRS
