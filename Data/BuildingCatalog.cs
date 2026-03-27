using PocketSim.Models;

namespace PocketSim.Data;

// ============================================================
//  GEBÄUDE-KATALOG
//  Alle verfügbaren Gebäude, sortiert nach Forschungsanforderung.
//
//  NEUES GEBÄUDE HINZUFÜGEN:
//    1. Neues BuildingDef-Objekt hier eintragen
//    2. ErfordertForschungId setzen (oder null für immer verfügbar)
//    3. Ggf. SchaltetFreiGebäude in ResearchCatalog.cs ergänzen
//    → Der Rest (Menüs, Produktion, UI) läuft automatisch!
// ============================================================
public static class BuildingCatalog
{
    public static readonly List<BuildingDef> Alle = new()
    {
        // ── IMMER VERFÜGBAR ───────────────────────────────────────────────

        new BuildingDef
        {
            Name                = "Holzfäller",
            Icon                = "🪓",
            Beschreibung        = "Produziert 2 Holz pro Runde",
            Baukosten           = new() { [ResourceType.Holz] = 5 },
            Produktion          = new() { [ResourceType.Holz] = 2 },
            ProduktionIntervall = 1,
        },
        new BuildingDef
        {
            Name                = "Brunnen",
            Icon                = "💧",
            Beschreibung        = "Produziert 1 Wasser pro Runde",
            Baukosten           = new() { [ResourceType.Holz] = 3 },
            Produktion          = new() { [ResourceType.Wasser] = 1 },
            ProduktionIntervall = 1,
        },

        // ── ACKERBAU ─────────────────────────────────────────────────────
        // Nahrungskette: Getreide → Mühle → Mehl → Bäckerei → Brot

        new BuildingDef
        {
            Name                = "Getreidefeld",
            Icon                = "🌾",
            Beschreibung        = "Produziert 2 Getreide pro Runde",
            ErfordertForschungId= "ackerbau",
            Baukosten           = new() { [ResourceType.Holz] = 5 },
            Produktion          = new() { [ResourceType.Getreide] = 2 },
            ProduktionIntervall = 1,
        },
        new BuildingDef
        {
            Name                = "Mühle",
            Icon                = "⚙️",
            Beschreibung        = "2 Getreide → 3 Mehl (alle 2 Runden)",
            ErfordertForschungId= "ackerbau",
            Baukosten           = new() { [ResourceType.Holz] = 10, [ResourceType.Stein] = 5 },
            Verbrauch           = new() { [ResourceType.Getreide] = 2 },
            Produktion          = new() { [ResourceType.Mehl] = 3 },
            ProduktionIntervall = 2,
        },
        new BuildingDef
        {
            Name                = "Bäckerei",
            Icon                = "🍞",
            Beschreibung        = "3 Mehl + 1 Wasser → 4 Brot (alle 2 Runden)",
            ErfordertForschungId= "ackerbau",
            Baukosten           = new() { [ResourceType.Holz] = 8, [ResourceType.Stein] = 8 },
            Verbrauch           = new() { [ResourceType.Mehl] = 3, [ResourceType.Wasser] = 1 },
            Produktion          = new() { [ResourceType.Brot] = 4 },
            ProduktionIntervall = 2,
        },

        // ── BERGBAU ──────────────────────────────────────────────────────
        // Grundlage der Industrie: Stein, Kohle und Eisen

        new BuildingDef
        {
            Name                = "Steinbruch",
            Icon                = "🪨",
            Beschreibung        = "Produziert 2 Stein pro Runde",
            ErfordertForschungId= "bergbau",
            Baukosten           = new() { [ResourceType.Holz] = 8 },
            Produktion          = new() { [ResourceType.Stein] = 2 },
            ProduktionIntervall = 1,
        },
        new BuildingDef
        {
            Name                = "Kohlemine",
            Icon                = "🖤",
            Beschreibung        = "Produziert 2 Kohle alle 2 Runden",
            ErfordertForschungId= "bergbau",
            Baukosten           = new() { [ResourceType.Holz] = 10, [ResourceType.Stein] = 5 },
            Produktion          = new() { [ResourceType.Kohle] = 2 },
            ProduktionIntervall = 2,
        },
        new BuildingDef
        {
            Name                = "Eisenmine",
            Icon                = "⛰️",
            Beschreibung        = "1 Brot verbrauchen → 2 Eisen (alle 3 Runden)",
            ErfordertForschungId= "bergbau",
            Baukosten           = new() { [ResourceType.Holz] = 12, [ResourceType.Stein] = 10 },
            Verbrauch           = new() { [ResourceType.Brot] = 1 },  // Bergleute brauchen Verpflegung
            Produktion          = new() { [ResourceType.Eisen] = 2 },
            ProduktionIntervall = 3,
        },

        // ── FISCHEREI ────────────────────────────────────────────────────
        // Nahrungsalternative ohne lange Produktionskette

        new BuildingDef
        {
            Name                = "Fischerhütte",
            Icon                = "🎣",
            Beschreibung        = "Produziert 3 Fisch alle 2 Runden",
            ErfordertForschungId= "fischerei",
            Baukosten           = new() { [ResourceType.Holz] = 6 },
            Produktion          = new() { [ResourceType.Fisch] = 3 },
            ProduktionIntervall = 2,
        },
        new BuildingDef
        {
            Name                = "Fischerboot",
            Icon                = "⛵",
            Beschreibung        = "Produziert 5 Fisch alle 2 Runden (effizienter)",
            ErfordertForschungId= "fischerei",
            Baukosten           = new() { [ResourceType.Holz] = 15, [ResourceType.Stein] = 5 },
            Produktion          = new() { [ResourceType.Fisch] = 5 },
            ProduktionIntervall = 2,
        },

        // ── METALLURGIE ──────────────────────────────────────────────────
        // Verarbeitung von Eisen zu Werkzeug – benötigt Kohle als Brennstoff

        new BuildingDef
        {
            Name                = "Schmiede",
            Icon                = "🔨",
            Beschreibung        = "2 Eisen + 1 Kohle → 3 Werkzeug (alle 3 Runden)",
            ErfordertForschungId= "metallurgie",
            Baukosten           = new() { [ResourceType.Holz] = 10, [ResourceType.Stein] = 12, [ResourceType.Eisen] = 2 },
            Verbrauch           = new() { [ResourceType.Eisen] = 2, [ResourceType.Kohle] = 1 },
            Produktion          = new() { [ResourceType.Werkzeug] = 3 },
            ProduktionIntervall = 3,
        },
        new BuildingDef
        {
            Name                = "Hochofen",
            Icon                = "🔥",
            Beschreibung        = "3 Eisen + 2 Kohle → 6 Werkzeug (alle 3 Runden, effizienter)",
            ErfordertForschungId= "metallurgie",
            Baukosten           = new() { [ResourceType.Stein] = 15, [ResourceType.Eisen] = 5, [ResourceType.Kohle] = 5 },
            Verbrauch           = new() { [ResourceType.Eisen] = 3, [ResourceType.Kohle] = 2 },
            Produktion          = new() { [ResourceType.Werkzeug] = 6 },
            ProduktionIntervall = 3,
        },

        // ── HANDEL ───────────────────────────────────────────────────────

        new BuildingDef
        {
            Name                = "Marktplatz",
            Icon                = "🏪",
            Beschreibung        = "5 Brot + 5 Fisch → 1 Gold (alle 8 Runden)",
            ErfordertForschungId= "handel",
            Baukosten           = new() { [ResourceType.Holz] = 15, [ResourceType.Stein] = 10 },
            Verbrauch           = new() { [ResourceType.Brot] = 5, [ResourceType.Fisch] = 5 },
            Produktion          = new() { [ResourceType.Gold] = 1 },
            ProduktionIntervall = 8,
        },

        // ── ARCHITEKTUR ──────────────────────────────────────────────────
        // Bevölkerungswachstum und Schutz

        new BuildingDef
        {
            Name                       = "Steinhaus",
            Icon                       = "🏠",
            Beschreibung               = "Erhöht Bevölkerungskapazität um 5 (einmalige Wirkung)",
            ErfordertForschungId       = "architektur",
            Baukosten                  = new() { [ResourceType.Stein] = 10, [ResourceType.Holz] = 5 },
            Einmalig                   = true,   // kein laufender Betrieb
            BevölkerungskapazitätBonus = 5,      // wird sofort beim Bau angewendet
        },
        new BuildingDef
        {
            Name                = "Festung",
            Icon                = "🏰",
            Beschreibung        = "Schützt vor Räubern. Produziert 1 Gold alle 20 Runden.",
            ErfordertForschungId= "architektur",
            Baukosten           = new() { [ResourceType.Stein] = 20, [ResourceType.Holz] = 10, [ResourceType.Werkzeug] = 5 },
            Produktion          = new() { [ResourceType.Gold] = 1 },
            ProduktionIntervall = 20,
        },

        // ── ALCHEMIE ─────────────────────────────────────────────────────
        // Goldgewinnung und Forschungsbeschleunigung

        new BuildingDef
        {
            Name                = "Goldmine",
            Icon                = "💰",
            Beschreibung        = "2 Brot + 1 Werkzeug → 1 Gold (alle 5 Runden)",
            ErfordertForschungId= "alchemie",
            Baukosten           = new() { [ResourceType.Stein] = 20, [ResourceType.Werkzeug] = 5 },
            Verbrauch           = new() { [ResourceType.Brot] = 2, [ResourceType.Werkzeug] = 1 },
            Produktion          = new() { [ResourceType.Gold] = 1 },
            ProduktionIntervall = 5,
        },
        new BuildingDef
        {
            // Das Labor wird in GameState.NextRound() speziell behandelt:
            // Es beschleunigt aktive Forschungen um 1 Runde (alle 3 Runden)
            Name                = "Labor",
            Icon                = "⚗️",
            Beschreibung        = "Beschleunigt aktive Forschung um 1 Runde (alle 3 Runden)",
            ErfordertForschungId= "alchemie",
            Baukosten           = new() { [ResourceType.Stein] = 15, [ResourceType.Werkzeug] = 10 },
            Produktion          = new(),          // Effekt wird in GameState.NextRound gehandelt
            ProduktionIntervall = 3,
        },

        // ── BURGENBAU ────────────────────────────────────────────────────
        // DAS ZIEL – Bau die Burg um zu gewinnen!

        new BuildingDef
        {
            Name                = "Burg",
            Icon                = "🏯",
            Beschreibung        = "Das ultimative Ziel! Bau die Burg um das Spiel zu GEWINNEN!",
            ErfordertForschungId= "burgenbau",
            Baukosten           = new()
            {
                [ResourceType.Stein]    = 40,
                [ResourceType.Eisen]    = 20,
                [ResourceType.Werkzeug] = 10,
                [ResourceType.Gold]     = 5
            },
            Einmalig = true,  // kein laufender Betrieb – aber Sieg!
        },
    };

    // Gebäude per Name suchen (Groß/Kleinschreibung egal)
    public static BuildingDef? FindByName(string name)
        => Alle.FirstOrDefault(b => b.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
}
