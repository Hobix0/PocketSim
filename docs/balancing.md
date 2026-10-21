# Balancing

Gemessen mit der Simulation `npm run sim` (`scripts/sim/balancing.sim.ts`): echte Kunden, Wege, Kassen und Kassierer
ohne Grafik, mehrere Spieltage. Regale werden stündlich aufgefüllt (wie mit Einkäufer + Auffüller); abgezogen werden
Wareneinsatz (EK), Lieferkosten (zwei LKW am Tag) und Löhne. Szenario über Umgebungsvariablen:
`SIM_REGALE=8 SIM_KASSEN=2 SIM_TAGE=5 SIM_OUT=datei.md npm run sim`.

## Was geändert wurde (Etappe 10)

| Wert | vorher | jetzt | Warum |
|---|---|---|---|
| Kunden je Auswahl (`kunden.auswahl`) | – | 0,6× bei wenig, 1× bei 16, bis 1,8× bei vielen Produkten | Vorher brachten mehr Regale keinen Cent mehr Umsatz – Ausbauen lohnt sich jetzt |
| Größerer Einkauf bei großem Sortiment | – | +1 Wunsch je 18 Produkte, höchstens +3 | Große Läden = größere Einkäufe |
| Kunden gleichzeitig (`maxImLaden`) | 18 | 14 + 8 je weiterer Kasse | Mehr Kassen = mehr Andrang möglich |
| Ruf je zufriedenem Kunden | +1 | +0,2, nach oben weniger (`rufSaettigung` 0,8) | Ruf war schon am 1. Tag bei 100 – jetzt rund eine Woche |
| Ruf je fehlendem Artikel | −0,25 | −0,15 | passend zum kleineren Gewinn |
| Ruf bei zu langem Warten | −2 | −1,5 | |
| Grundstücke Ost / West / Gewerbehof / Hof | 3500 / 3500 / 4000 / 6000 € | 2500 / 3000 / 3500 / 4500 € | erster Ausbau nach gut einer Woche statt nach drei |

Faustregeln, die die Simulation zeigt:
- Ein Kassierer (90 €/Tag) rechnet sich ab etwa 2 Regalen.
- Ab etwa 6–8 Regalen wird eine Kasse zum Engpass (lange Schlangen, Ruf sinkt) – eine zweite Kasse verdoppelt dann fast den Gewinn.
- Gewinn je Tag: klein (2 Regale) ~140 €, mittel (4) ~200 €, groß (12 Regale, 2 Kassen) ~520 €.

## Messwerte

Szenario: 2 Regale (60 Produkte im Sortiment, 8 Fächer), 1 Kasse(n) mit Kassierer, Start 5000 €
| Tag | Kunden | zufrieden | Umsatz | Wareneinsatz | Lieferung | Löhne | Gewinn | Ruf | XP | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 120 | 97 % | 585 € | 330 € | 40 € | 90 € | **125 €** | 58 | 116 | 2 |
| 2 | 128 | 96 % | 597 € | 332 € | 40 € | 90 € | **135 €** | 64 | 239 | 2 |
| 3 | 136 | 96 % | 546 € | 305 € | 39 € | 90 € | **112 €** | 73 | 370 | 3 |
| 4 | 148 | 96 % | 675 € | 377 € | 43 € | 90 € | **165 €** | 81 | 512 | 4 |
| 5 | 156 | 98 % | 666 € | 374 € | 42 € | 90 € | **160 €** | 91 | 665 | 4 |
Gewinn gesamt: 696 € in 5 Tagen (Ø 139 € / Tag)

Szenario: 4 Regale (60 Produkte im Sortiment, 16 Fächer), 1 Kasse(n) mit Kassierer, Start 5000 €
| Tag | Kunden | zufrieden | Umsatz | Wareneinsatz | Lieferung | Löhne | Gewinn | Ruf | XP | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 146 | 97 % | 690 € | 382 € | 42 € | 90 € | **176 €** | 59 | 142 | 2 |
| 2 | 154 | 96 % | 735 € | 406 € | 42 € | 90 € | **197 €** | 68 | 290 | 3 |
| 3 | 164 | 98 % | 749 € | 409 € | 43 € | 90 € | **207 €** | 80 | 450 | 3 |
| 4 | 156 | 97 % | 787 € | 433 € | 43 € | 90 € | **220 €** | 87 | 601 | 4 |
| 5 | 177 | 94 % | 768 € | 421 € | 43 € | 90 € | **214 €** | 94 | 768 | 4 |
Gewinn gesamt: 1014 € in 5 Tagen (Ø 203 € / Tag)

Szenario: 8 Regale (60 Produkte im Sortiment, 32 Fächer), 1 Kasse(n) mit Kassierer, Start 5000 €
| Tag | Kunden | zufrieden | Umsatz | Wareneinsatz | Lieferung | Löhne | Gewinn | Ruf | XP | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 130 | 92 % | 792 € | 459 € | 44 € | 90 € | **199 €** | 44 | 120 | 2 |
| 2 | 134 | 97 % | 820 € | 465 € | 44 € | 90 € | **220 €** | 46 | 250 | 3 |
| 3 | 136 | 93 % | 808 € | 463 € | 44 € | 90 € | **210 €** | 41 | 377 | 3 |
| 4 | 128 | 95 % | 763 € | 446 € | 44 € | 90 € | **184 €** | 36 | 498 | 3 |
| 5 | 131 | 92 % | 762 € | 449 € | 44 € | 90 € | **179 €** | 27 | 618 | 4 |
Gewinn gesamt: 992 € in 5 Tagen (Ø 198 € / Tag)

Szenario: 8 Regale (60 Produkte im Sortiment, 32 Fächer), 2 Kasse(n) mit Kassierer, Start 5000 €
| Tag | Kunden | zufrieden | Umsatz | Wareneinsatz | Lieferung | Löhne | Gewinn | Ruf | XP | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 195 | 99 % | 1312 € | 728 € | 56 € | 180 € | **348 €** | 64 | 194 | 2 |
| 2 | 206 | 99 % | 1334 € | 737 € | 56 € | 180 € | **361 €** | 73 | 398 | 3 |
| 3 | 218 | 99 % | 1382 € | 760 € | 57 € | 180 € | **385 €** | 82 | 614 | 4 |
| 4 | 229 | 99 % | 1443 € | 797 € | 59 € | 180 € | **407 €** | 94 | 841 | 4 |
| 5 | 240 | 100 % | 1458 € | 809 € | 60 € | 180 € | **410 €** | 94 | 1080 | 5 |
Gewinn gesamt: 1910 € in 5 Tagen (Ø 382 € / Tag)

Szenario: 12 Regale (60 Produkte im Sortiment, 48 Fächer), 2 Kasse(n) mit Kassierer, Start 5000 €
| Tag | Kunden | zufrieden | Umsatz | Wareneinsatz | Lieferung | Löhne | Gewinn | Ruf | XP | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 185 | 98 % | 1663 € | 912 € | 61 € | 180 € | **511 €** | 58 | 181 | 2 |
| 2 | 189 | 100 % | 1681 € | 910 € | 61 € | 180 € | **529 €** | 70 | 370 | 3 |
| 3 | 196 | 98 % | 1653 € | 907 € | 61 € | 180 € | **505 €** | 75 | 563 | 4 |
| 4 | 198 | 98 % | 1685 € | 921 € | 62 € | 180 € | **522 €** | 81 | 758 | 4 |
| 5 | 198 | 99 % | 1687 € | 923 € | 63 € | 180 € | **520 €** | 91 | 955 | 5 |
Gewinn gesamt: 2587 € in 5 Tagen (Ø 517 € / Tag)

