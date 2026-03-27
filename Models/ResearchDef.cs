namespace PocketSim.Models;

// ============================================================
//  FORSCHUNGS-BAUPLAN (unveränderlich)
//  Beschreibt eine einzelne Forschung im Technologiebaum.
//
//  NEUE FORSCHUNG: In Data/ResearchCatalog.cs eintragen.
// ============================================================
public class ResearchDef
{
    // Eindeutiger Bezeichner (Kleinbuchstaben, z.B. "bergbau")
    // Wird als Schlüssel für Voraussetzungen und Gebäude-Entsperrung genutzt
    public string Id            { get; init; } = "";
    public string Name          { get; init; } = "";
    public string Icon          { get; init; } = "🔬";
    public string Beschreibung  { get; init; } = "";

    // Tier 1 = Grundlagen, Tier 2 = Fortgeschritten, Tier 3 = Meisterschaft
    public int Tier   { get; init; } = 1;

    // Wie viele Runden die Forschung dauert
    public int Dauer  { get; init; } = 3;

    // Einmalige Ressourcenkosten um die Forschung zu starten
    public Dictionary<ResourceType, int> Kosten { get; init; } = new();

    // IDs der Forschungen die VORHER abgeschlossen sein müssen
    // Leer = keine Voraussetzungen (Tier-1-Forschungen)
    public List<string> Voraussetzungen      { get; init; } = new();

    // Namen der Gebäude die nach Abschluss baubar werden
    public List<string> SchaltetFreiGebäude { get; init; } = new();

    // Kurzbeschreibung des Effekts (für die UI)
    public string Effekt { get; init; } = "";
}
