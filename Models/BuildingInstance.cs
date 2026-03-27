namespace PocketSim.Models;

// ============================================================
//  GEBÄUDE-INSTANZ (ein konkretes, gebautes Gebäude)
//  Verfolgt den Laufzeit-Zustand eines einzelnen Gebäudes.
//
//  Beispiel: 3× Holzfäller gebaut = 3 BuildingInstance-Objekte,
//            alle zeigen auf dieselbe BuildingDef "Holzfäller".
// ============================================================
public class BuildingInstance
{
    // Referenz auf den unveränderlichen Bauplan
    public BuildingDef Def    { get; }

    // Kann manuell deaktiviert werden (für spätere Pause-Funktion)
    public bool Aktiv  { get; set; } = true;

    // Rundenzähler: wie lange existiert dieses Gebäude schon?
    // Wird für das ProduktionIntervall genutzt (Modulo-Rechnung)
    public int Runden  { get; set; } = 0;

    public BuildingInstance(BuildingDef def) => Def = def;

    // ─────────────────────────────────────────────────────────
    // Versucht eine Produktionsrunde durchzuführen.
    // Gibt true zurück wenn TATSÄCHLICH produziert wurde.
    //
    // Ablauf:
    //  1. Deaktiviert? → abbrechen
    //  2. Einmalig?    → abbrechen (wirkt nur beim Bau)
    //  3. Runden hochzählen
    //  4. Ist es eine Produktionsrunde? (Modulo-Check)
    //  5. Genug Ressourcen? → verbrauchen & produzieren
    // ─────────────────────────────────────────────────────────
    public bool TryProduce(ResourceStore store)
    {
        if (!Aktiv || Def.Einmalig) return false;

        Runden++;

        // Modulo: 6 % 3 == 0 → produziert; 5 % 3 == 2 → nicht
        if (Runden % Def.ProduktionIntervall != 0) return false;

        // Rohstoffcheck – kein Abzug wenn nicht genug da
        if (!store.CanAfford(Def.Verbrauch)) return false;

        store.Pay(Def.Verbrauch);   // Verbrauch abziehen
        store.Add(Def.Produktion);  // Produktion hinzufügen
        return true;
    }
}
