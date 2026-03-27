namespace PocketSim.Models;

// ============================================================
//  RESSOURCENTYPEN
//  Alle Güter die im Spiel existieren.
//  NEU HINZUFÜGEN: Hier eintragen + Emoji in UI/Renderer.cs
// ============================================================
public enum ResourceType
{
    Holz,       // Grundrohstoff – für fast alle Gebäude
    Stein,      // Grundrohstoff – für fortgeschrittene Gebäude
    Getreide,   // Nahrungskette Stufe 1
    Mehl,       // Nahrungskette Stufe 2 (Getreide → Mühle → Mehl)
    Brot,       // Nahrungskette Stufe 3 (Mehl → Bäckerei → Brot)
    Fisch,      // Alternative Nahrungsquelle
    Eisen,      // Industrie Stufe 1
    Kohle,      // Brennstoff für Schmiede / Hochofen
    Werkzeug,   // Industrie Stufe 2 (Eisen → Schmiede → Werkzeug)
    Gold,       // Wertvollstes Gut – Siegbedingung
    Wasser      // Hilfsstoff für Bäckerei
}
