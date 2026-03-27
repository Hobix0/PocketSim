using PocketSim.Models;
using PocketSim.Data;

namespace PocketSim.Systems;

// ============================================================
//  FORSCHUNGSSYSTEM
//  Verwaltet den kompletten Forschungsfortschritt:
//  - Welche Forschungen sind abgeschlossen?
//  - Welche Forschung läuft gerade?
//  - Wie viele Runden hat sie noch?
// ============================================================
public class ResearchSystem
{
    // HashSet = sehr schnelle Suche (O(1)) – perfekt für Berechtigungs-Checks
    // Enthält die IDs aller abgeschlossener Forschungen (z.B. "bergbau", "ackerbau")
    public HashSet<string> Abgeschlossen { get; } = new();

    // Die aktuell laufende Forschung (null wenn keine aktiv)
    public ResearchDef? AktiveForschung    { get; private set; }

    // Wie viele Runden diese Forschung noch braucht
    public int VerbleibendeRunden          { get; private set; }

    // ── Abfragen ─────────────────────────────────────────────

    // Ist eine bestimmte Forschung abgeschlossen?
    public bool IsAbgeschlossen(string id) => Abgeschlossen.Contains(id);

    // Ist ein Gebäude baubar? (Entweder keine Forschung nötig, oder bereits erforscht)
    public bool IsBaubar(string? erfordertId)
        => erfordertId == null || Abgeschlossen.Contains(erfordertId);

    // Sind alle Voraussetzungen erfüllt um diese Forschung STARTEN zu können?
    public bool IstVerfügbar(ResearchDef def)
        => def.Voraussetzungen.All(v => Abgeschlossen.Contains(v));

    // Vollständige Prüfung: Kann die Forschung jetzt gestartet werden?
    public bool KannStarten(ResearchDef def, ResourceStore lager)
        => AktiveForschung == null           // keine andere Forschung läuft
        && !IsAbgeschlossen(def.Id)          // noch nicht erforscht
        && IstVerfügbar(def)                 // Voraussetzungen erfüllt
        && lager.CanAfford(def.Kosten);      // Ressourcen vorhanden

    // ── Aktionen ─────────────────────────────────────────────

    // Startet eine Forschung. Gibt false zurück wenn nicht möglich.
    // Die Kosten werden sofort beim Start bezahlt.
    public bool StarteForschung(ResearchDef def, ResourceStore lager)
    {
        if (!KannStarten(def, lager)) return false;

        lager.Pay(def.Kosten);      // Ressourcen bezahlen
        AktiveForschung    = def;
        VerbleibendeRunden = def.Dauer;
        return true;
    }

    // Runde voranschreiten. Gibt die abgeschlossene Forschung zurück (oder null).
    // Sollte einmal pro Runde aufgerufen werden.
    public ResearchDef? Fortschritt()
    {
        if (AktiveForschung == null) return null;

        VerbleibendeRunden--;
        if (VerbleibendeRunden > 0) return null;  // noch nicht fertig

        // Forschung abgeschlossen!
        var fertig = AktiveForschung;
        Abgeschlossen.Add(fertig.Id);  // zur abgeschlossenen Menge hinzufügen
        AktiveForschung    = null;
        VerbleibendeRunden = 0;
        return fertig;
    }

    // Beschleunigt die aktive Forschung um 1 Runde (durch Labor-Gebäude)
    public void Beschleunigen()
    {
        if (AktiveForschung != null && VerbleibendeRunden > 1)
            VerbleibendeRunden--;
    }

    // Fortschritts-Prozentsatz (0.0 – 1.0) für Fortschrittsbalken in der UI
    public double FortschrittProzent()
    {
        if (AktiveForschung == null) return 0;
        int erledigt = AktiveForschung.Dauer - VerbleibendeRunden;
        return (double)erledigt / AktiveForschung.Dauer;
    }
}
