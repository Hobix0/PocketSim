namespace PocketSim.Models;

// ============================================================
//  GEBÄUDE-BAUPLAN (unveränderlich)
//  Beschreibt EINEN Gebäudetyp: Kosten, Verbrauch, Produktion.
//  Wird NIE direkt ins Spiel gestellt – dafür gibt es BuildingInstance.
//
//  NEUES GEBÄUDE: In Data/BuildingCatalog.cs eintragen.
// ============================================================
public class BuildingDef
{
    // "init" = nur beim Erstellen des Objekts setzbar, danach schreibgeschützt
    public string Name          { get; init; } = "";
    public string Icon          { get; init; } = "🏠";
    public string Beschreibung  { get; init; } = "";

    // ID der Forschung die benötigt wird. null = immer baubar.
    public string? ErfordertForschungId { get; init; } = null;

    // Einmalige Baukosten
    public Dictionary<ResourceType, int> Baukosten  { get; init; } = new();

    // Ressourcen die pro Produktionszyklus verbraucht werden (Eingabe)
    public Dictionary<ResourceType, int> Verbrauch  { get; init; } = new();

    // Ressourcen die pro Produktionszyklus erzeugt werden (Ausgabe)
    public Dictionary<ResourceType, int> Produktion { get; init; } = new();

    // Alle X Runden wird produziert (1 = jede Runde, 3 = jede 3. Runde)
    public int ProduktionIntervall { get; init; } = 1;

    // Einmalige Gebäude: wirken nur beim Bau, produzieren danach nichts
    public bool Einmalig { get; init; } = false;

    // Wie viel die Bevölkerungskapazität beim Bau steigt (für Steinhaus etc.)
    public int BevölkerungskapazitätBonus { get; init; } = 0;
}
