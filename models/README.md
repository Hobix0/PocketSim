# Eigene Modelle (Blender → GLB)

Jedes Gebäude und jedes Teil hat ein prozedurales Platzhaltermodell. Sobald hier ein GLB liegt und in
`manifest.json` eingetragen ist, verwendet das Spiel automatisch dein Modell, auch für die Vorschaubilder im Baumenü.

```json
{
  "buildings": { "saege": "saege.glb", "drehbank": "drehbank.glb" },
  "items": { "hammer": "items/hammer.glb" }
}
```

Die Schlüssel sind die IDs aus `src/data.js` (`BUILDINGS` bzw. `ITEMS`).

## Maßstab und Ausrichtung

| Regel | Wert |
|---|---|
| Einheit | 1 Blender-Meter = 1 Rasterfeld |
| Grundfläche | Bandsäge, Drehbank usw. 2 × 2 m, Montagezelle 3 × 3 m, Rollenbahn 1 × 1 m |
| Ursprung | Mitte der Grundfläche, auf dem Boden (Z = 0 in Blender) |
| Vorderseite = Ausgang | zeigt in Blender nach **+Y** (der glTF-Export macht daraus −Z, die Vorderseite im Spiel) |
| Arbeitshöhe | Teile liegen auf 0,5 m (`CONFIG.beltHeight`); Ein- und Ausgabeöffnungen auf diese Höhe legen |
| Wandtore | Rückseite (−Y in Blender) liegt an der Hallenwand |

Export: *File → Export → glTF 2.0*, Format **glTF Binary (.glb)**, „+Y Up“ aktiviert (Standard).
Materialien: Principled BSDF; Farbe, Roughness, Metallic und Emission werden übernommen.

## Animation per Objektnamen

Animiert wird nur, solange die Maschine arbeitet:

| Präfix | Wirkung |
|---|---|
| `spin_…` | dreht sich um die eigene Hochachse (z. B. Spindel, Lüfter) |
| `spinx_…` | dreht sich um die eigene X-Achse (z. B. Sägeblatt, Walze) |
| `bob_…` | bewegt sich auf und ab (z. B. Stempel, Hammer) |
| `glow_…` | Emission wird hochgeregelt (z. B. Ofenglut) |
| `status_…` | Signalleuchte: grün = läuft, orange = blockiert, aus = wartet |

Eingebettete glTF-Animationen (Actions) laufen ebenfalls, solange die Maschine arbeitet.

## Teile

Teile werden instanziert gezeichnet. Pro GLB wird nur die **erste Mesh** mit ihrem Material verwendet.
Ein Teil sollte also aus einer Mesh bestehen, etwa 0,2–0,35 m groß sein und mit dem Ursprung unten mittig liegen.
