namespace PocketSim.Models;

// ============================================================
//  RESSOURCENLAGER
//  Verwaltet die Mengen aller Ressourcen des Spielers.
//  Kapselt das Dictionary sauber – kein direkter Zugriff von außen.
// ============================================================
public class ResourceStore
{
    // Das eigentliche Lager: ResourceType → Menge
    private readonly Dictionary<ResourceType, int> _stock = new();

    public ResourceStore()
    {
        // Alle Ressourcen auf 0 initialisieren (kein KeyNotFoundException möglich)
        foreach (ResourceType r in Enum.GetValues<ResourceType>())
            _stock[r] = 0;

        // Startwerte – genug um erste Gebäude zu bauen
        _stock[ResourceType.Holz]   = 25;
        _stock[ResourceType.Stein]  = 15;
        _stock[ResourceType.Wasser] = 10;
    }

    // Aktuellen Bestand einer Ressource abfragen
    public int Get(ResourceType r) => _stock.GetValueOrDefault(r, 0);

    // Prüft ob alle Kosten bezahlbar sind (OHNE etwas abzuziehen)
    public bool CanAfford(Dictionary<ResourceType, int> cost)
        => cost.All(kv => Get(kv.Key) >= kv.Value);

    // Zieht Ressourcen ab – immer VORHER CanAfford() prüfen!
    public void Pay(Dictionary<ResourceType, int> cost)
    {
        foreach (var kv in cost)
            _stock[kv.Key] = Math.Max(0, _stock[kv.Key] - kv.Value);
    }

    // Fügt eine einzelne Ressource hinzu
    public void Add(ResourceType r, int amount)
        => _stock[r] = _stock.GetValueOrDefault(r) + Math.Max(0, amount);

    // Fügt mehrere Ressourcen auf einmal hinzu (Produktion)
    public void Add(Dictionary<ResourceType, int> items)
    {
        foreach (var kv in items)
            Add(kv.Key, kv.Value);
    }

    // Entnimmt eine Ressource (wird nie negativ)
    public void Remove(ResourceType r, int amount)
        => _stock[r] = Math.Max(0, _stock.GetValueOrDefault(r) - amount);

    // Gibt eine schreibgeschützte Kopie zurück (Snapshot für die UI)
    // "Kopie" ist wichtig: UI-Code kann so nicht versehentlich das Original ändern
    public Dictionary<ResourceType, int> Snapshot()
        => new(_stock);
}
