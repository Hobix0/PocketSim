using PocketSim.Models;
using PocketSim;

namespace PocketSim.Systems;

// ============================================================
//  EREIGNISSYSTEM
//  Zufällige Ereignisse die das Spiel lebendig machen.
//  Jede Runde: ~22% Chance auf ein Ereignis.
//
//  NEUES EREIGNIS: Einfach in AlleEreignisse eintragen.
//  Das Ereignis bekommt über "Anwenden" Zugriff auf den GameState.
// ============================================================

// Ein einzelnes Ereignis (Datenklasse)
public class GameEvent
{
    public string Titel         { get; init; } = "";
    public string Beschreibung  { get; init; } = "";
    public string Icon          { get; init; } = "❓";
    public bool   IstPositiv    { get; init; } = true;

    // Der Effekt wird als Delegat (Funktion) gespeichert.
    // "Action<GameState>" = eine Funktion die GameState bekommt und nichts zurückgibt.
    // So kann jedes Ereignis beliebigen Code ausführen ohne switch-case-Logik.
    public Action<GameState>? Anwenden { get; init; }
}

public static class EventSystem
{
    private static readonly Random _rnd = new();

    // Alle möglichen Ereignisse – Anwenden-Lambda erhält den aktuellen GameState
    public static readonly List<GameEvent> AlleEreignisse = new()
    {
        new GameEvent
        {
            Titel        = "Gute Ernte",
            Beschreibung = "Reiche Ernte auf den Feldern! +15 Getreide.",
            Icon         = "🌻",
            IstPositiv   = true,
            Anwenden     = gs => gs.Lager.Add(ResourceType.Getreide, 15)
        },
        new GameEvent
        {
            Titel        = "Dürre",
            Beschreibung = "Kein Regen seit Wochen! Getreidereserven schwinden. -10 Getreide.",
            Icon         = "🌵",
            IstPositiv   = false,
            Anwenden     = gs => gs.Lager.Remove(ResourceType.Getreide, 10)
        },
        new GameEvent
        {
            Titel        = "Wanderhändler",
            Beschreibung = "Ein Händler tauscht 20 Holz gegen 5 Gold – falls genug Holz da ist.",
            Icon         = "🧙",
            IstPositiv   = true,
            Anwenden     = gs =>
            {
                if (gs.Lager.Get(ResourceType.Holz) >= 20)
                {
                    gs.Lager.Remove(ResourceType.Holz, 20);
                    gs.Lager.Add(ResourceType.Gold, 5);
                }
            }
        },
        new GameEvent
        {
            Titel        = "Räuberüberfall",
            Beschreibung = "Räuber stehlen Holzvorräte! Festung schützt davor.",
            Icon         = "⚔️",
            IstPositiv   = false,
            Anwenden     = gs =>
            {
                // Festung schützt – kein Verlust wenn eine gebaut ist
                bool hatFestung = gs.Gebäude.Any(b => b.Def.Name == "Festung");
                if (!hatFestung)
                    gs.Lager.Remove(ResourceType.Holz, 20);
            }
        },
        new GameEvent
        {
            Titel        = "Reiche Erzader",
            Beschreibung = "Bergleute entdecken eine reiche Erzader! +15 Eisen.",
            Icon         = "💎",
            IstPositiv   = true,
            Anwenden     = gs => gs.Lager.Add(ResourceType.Eisen, 15)
        },
        new GameEvent
        {
            Titel        = "Epidemie",
            Beschreibung = "Eine Krankheit grassiert in der Siedlung. -3 Einwohner.",
            Icon         = "🤒",
            IstPositiv   = false,
            Anwenden     = gs => gs.Bevölkerung.Erkrankung(3)
        },
        new GameEvent
        {
            Titel        = "Einwanderer",
            Beschreibung = "Neue Siedler kommen an und stärken die Gemeinschaft! +4 Einwohner.",
            Icon         = "👨‍👩‍👧‍👦",
            IstPositiv   = true,
            Anwenden     = gs => gs.Bevölkerung.Einwanderer(4)
        },
        new GameEvent
        {
            Titel        = "Meisterschmied",
            Beschreibung = "Ein wandernder Schmied schenkt euch sein Werkzeug! +8 Werkzeug.",
            Icon         = "🔧",
            IstPositiv   = true,
            Anwenden     = gs => gs.Lager.Add(ResourceType.Werkzeug, 8)
        },
        new GameEvent
        {
            Titel        = "Sturmschaden",
            Beschreibung = "Ein heftiger Sturm beschädigt Lagergebäude. -15 Holz, -8 Getreide.",
            Icon         = "⛈️",
            IstPositiv   = false,
            Anwenden     = gs =>
            {
                gs.Lager.Remove(ResourceType.Holz, 15);
                gs.Lager.Remove(ResourceType.Getreide, 8);
            }
        },
        new GameEvent
        {
            Titel        = "Schatzfund",
            Beschreibung = "Arbeiter stoßen auf eine vergrabene Schatzkiste! +3 Gold.",
            Icon         = "🤩",
            IstPositiv   = true,
            Anwenden     = gs => gs.Lager.Add(ResourceType.Gold, 3)
        },
        new GameEvent
        {
            Titel        = "Kohlefund",
            Beschreibung = "Eine große Kohleader wird freigelegt! +12 Kohle.",
            Icon         = "🖤",
            IstPositiv   = true,
            Anwenden     = gs => gs.Lager.Add(ResourceType.Kohle, 12)
        },
        new GameEvent
        {
            Titel        = "Steinlawine",
            Beschreibung = "Eine Lawine blockiert den Steinbruch vorübergehend. -12 Stein.",
            Icon         = "🪨",
            IstPositiv   = false,
            Anwenden     = gs => gs.Lager.Remove(ResourceType.Stein, 12)
        },
    };

    // Zufällig ein Ereignis auslösen.
    // Gibt null zurück wenn diese Runde kein Ereignis stattfindet.
    public static GameEvent? VersucheTrigger()
    {
        // ~22% Chance pro Runde
        if (_rnd.NextDouble() > 0.22) return null;
        return AlleEreignisse[_rnd.Next(AlleEreignisse.Count)];
    }
}
