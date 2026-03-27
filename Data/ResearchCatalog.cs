using PocketSim.Models;

namespace PocketSim.Data;

// ============================================================
//  FORSCHUNGSBAUM
//
//  TIER 1 (Grundlagen – keine Voraussetzungen):
//    🌾 Ackerbau  ──►  📦 Handel (T2)
//         └───────────►  🏛️ Architektur (T2, braucht auch Bergbau)
//    ⛏️ Bergbau   ──►  🔩 Metallurgie (T2)
//         └───────────►  🏛️ Architektur (T2)
//    🎣 Fischerei  (eigenständig)
//
//  TIER 2 (Fortgeschritten):
//    📦 Handel       [braucht: Ackerbau]
//    🔩 Metallurgie  [braucht: Bergbau]    ──► ⚗️ Alchemie (T3)
//    🏛️ Architektur  [braucht: Ackerbau + Bergbau] ──► 🏯 Burgenbau (T3)
//
//  TIER 3 (Meisterschaft):
//    ⚗️ Alchemie    [braucht: Metallurgie]
//    🏯 Burgenbau   [braucht: Architektur + Metallurgie]
// ============================================================
public static class ResearchCatalog
{
    public static readonly List<ResearchDef> Alle = new()
    {
        // ── TIER 1: GRUNDLAGEN ────────────────────────────────────────────

        new ResearchDef
        {
            Id              = "ackerbau",
            Name            = "Ackerbau",
            Icon            = "🌾",
            Beschreibung    = "Systematischer Anbau von Nutzpflanzen",
            Tier            = 1,
            Dauer           = 3,
            Kosten          = new() { [ResourceType.Holz] = 10 },
            Voraussetzungen = new(),
            SchaltetFreiGebäude = new() { "Getreidefeld", "Mühle", "Bäckerei" },
            Effekt          = "Schaltet Getreidefeld, Mühle und Bäckerei frei"
        },

        new ResearchDef
        {
            Id              = "bergbau",
            Name            = "Bergbau",
            Icon            = "⛏️",
            Beschreibung    = "Mineralien und Erze aus dem Erdreich gewinnen",
            Tier            = 1,
            Dauer           = 4,
            Kosten          = new() { [ResourceType.Holz] = 15, [ResourceType.Stein] = 5 },
            Voraussetzungen = new(),
            SchaltetFreiGebäude = new() { "Steinbruch", "Kohlemine", "Eisenmine" },
            Effekt          = "Schaltet Steinbruch, Kohlemine und Eisenmine frei"
        },

        new ResearchDef
        {
            Id              = "fischerei",
            Name            = "Fischerei",
            Icon            = "🎣",
            Beschreibung    = "Effektive Methoden des Fischfangs",
            Tier            = 1,
            Dauer           = 2,
            Kosten          = new() { [ResourceType.Holz] = 8 },
            Voraussetzungen = new(),
            SchaltetFreiGebäude = new() { "Fischerhütte", "Fischerboot" },
            Effekt          = "Schaltet Fischerhütte und das schnellere Fischerboot frei"
        },

        // ── TIER 2: FORTGESCHRITTEN ───────────────────────────────────────

        new ResearchDef
        {
            Id              = "metallurgie",
            Name            = "Metallurgie",
            Icon            = "🔩",
            Beschreibung    = "Erze schmelzen, Metalle veredeln und verarbeiten",
            Tier            = 2,
            Dauer           = 5,
            Kosten          = new() { [ResourceType.Stein] = 10, [ResourceType.Eisen] = 5 },
            Voraussetzungen = new() { "bergbau" },
            SchaltetFreiGebäude = new() { "Schmiede", "Hochofen" },
            Effekt          = "Schaltet Schmiede und effizienteren Hochofen frei"
        },

        new ResearchDef
        {
            Id              = "handel",
            Name            = "Handel",
            Icon            = "📦",
            Beschreibung    = "Handelsrouten mit anderen Siedlungen etablieren",
            Tier            = 2,
            Dauer           = 4,
            Kosten          = new() { [ResourceType.Brot] = 10, [ResourceType.Gold] = 3 },
            Voraussetzungen = new() { "ackerbau" },
            SchaltetFreiGebäude = new() { "Marktplatz" },
            Effekt          = "Schaltet Marktplatz frei – wandelt Überschüsse in Gold um"
        },

        new ResearchDef
        {
            Id              = "architektur",
            Name            = "Architektur",
            Icon            = "🏛️",
            Beschreibung    = "Massive Steinbauwerke und Befestigungen errichten",
            Tier            = 2,
            Dauer           = 6,
            Kosten          = new() { [ResourceType.Stein] = 20, [ResourceType.Holz] = 15 },
            Voraussetzungen = new() { "ackerbau", "bergbau" },
            SchaltetFreiGebäude = new() { "Steinhaus", "Festung" },
            Effekt          = "Schaltet Steinhaus (+Bevölkerung) und Festung (Schutz) frei"
        },

        // ── TIER 3: MEISTERSCHAFT ─────────────────────────────────────────

        new ResearchDef
        {
            Id              = "alchemie",
            Name            = "Alchemie",
            Icon            = "⚗️",
            Beschreibung    = "Geheimnisse der Metallumwandlung und Goldgewinnung",
            Tier            = 3,
            Dauer           = 8,
            Kosten          = new() { [ResourceType.Gold] = 10, [ResourceType.Werkzeug] = 5 },
            Voraussetzungen = new() { "metallurgie" },
            SchaltetFreiGebäude = new() { "Goldmine", "Labor" },
            Effekt          = "Schaltet Goldmine und Labor (Forschungsbooster) frei"
        },

        new ResearchDef
        {
            Id              = "burgenbau",
            Name            = "Burgenbau",
            Icon            = "🏯",
            Beschreibung    = "Die Kunst des Burgenbaus – Schlüssel zum Sieg!",
            Tier            = 3,
            Dauer           = 10,
            Kosten          = new()
            {
                [ResourceType.Stein]    = 30,
                [ResourceType.Eisen]    = 15,
                [ResourceType.Werkzeug] = 10
            },
            Voraussetzungen = new() { "architektur", "metallurgie" },
            SchaltetFreiGebäude = new() { "Burg" },
            Effekt          = "Schaltet die Burg frei – baue sie um das Spiel zu GEWINNEN!"
        },
    };

    // Sucht eine Forschung anhand ihrer ID
    public static ResearchDef? FindById(string id)
        => Alle.FirstOrDefault(r => r.Id.Equals(id, StringComparison.OrdinalIgnoreCase));

    // Gibt den Anzeigenamen einer Forschung zurück (für UI-Texte)
    public static string NameFürId(string id)
        => FindById(id)?.Name ?? id;
}
