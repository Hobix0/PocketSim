// ============================================================
//  POCKETSIM – Ressourcen-Simulator
//
//  AUFBAU DER DATEI (von oben nach unten):
//  1. ResourceType  – Aufzählung aller Ressourcen im Spiel
//  2. ResourceStore – Das Lager: verwaltet Mengen aller Ressourcen
//  3. BuildingDef   – Vorlage/Bauplan für einen Gebäudetyp
//  4. BuildingInstance – Ein konkretes, gebautes Gebäude
//  5. BuildingCatalog  – Liste aller verfügbaren Gebäudetypen
//  6. GameState        – Der Spielstand (Runde, Lager, Gebäude, Log)
//  7. UI               – Alle Terminal-Ausgaben und Menüs
//  8. Program          – Einstiegspunkt, Hauptschleife
// ============================================================

// "using" lädt Bibliotheken, die wir brauchen:
using System;                       // Basis: Console, Math, etc.
using System.Collections.Generic;   // Dictionary<>, List<>
using System.Linq;                  // .Any(), .All(), .GroupBy(), etc.
using System.Threading;             // Thread.Sleep() für kurze Pausen

// Ein "namespace" fasst zusammengehörigen Code unter einem Namen zusammen.
// Verhindert Namenskollisionen wenn man mehrere Bibliotheken nutzt.
namespace PocketSim
{
    // ===========================================================
    // 1. RESSOURCENTYPEN
    // ===========================================================
    // Ein "enum" (Aufzählung) definiert eine feste Menge benannter Werte.
    // Intern sind das einfach Zahlen (Holz=0, Stein=1, ...), aber mit
    // lesbaren Namen. Das macht den Code verständlicher als "Ressource Nr.3".
    //
    // NEUE RESSOURCE HINZUFÜGEN:
    //   Einfach hier einen neuen Namen ergänzen, z.B. "Kohle".
    //   Dann in UI.Emojis ein passendes Emoji eintragen – fertig!
    public enum ResourceType
    {
        Holz,       // Grundrohstoff, für fast alle Gebäude nötig
        Stein,      // Grundrohstoff, für stabile Gebäude nötig
        Getreide,   // Wird in der Mühle zu Mehl verarbeitet
        Mehl,       // Zwischenprodukt: Getreide → Mehl (Mühle)
        Brot,       // Zwischenprodukt: Mehl → Brot (Bäckerei)
        Fisch,      // Einfache Nahrungsquelle
        Eisen,      // Wird in der Schmiede zu Werkzeug
        Werkzeug,   // Endprodukt der Schmiede, für Goldmine nötig
        Gold,       // Wertvollstes Gut, Endziel
        Wasser      // Wird von der Bäckerei verbraucht
    }


    // ===========================================================
    // 2. RESSOURCENLAGER
    // ===========================================================
    // Diese Klasse ist das "Lager" des Spielers.
    // Sie speichert, wie viele Einheiten von jeder Ressource vorhanden sind,
    // und bietet Methoden zum Prüfen, Abziehen und Hinzufügen.
    public class ResourceStore
    {
        // Dictionary = Schlüssel-Wert-Paare, hier: Ressourcentyp → Menge
        // "private readonly" = nur innerhalb dieser Klasse les- und schreibbar,
        // und nach dem Erstellen nicht mehr neu zuweisbar (aber Inhalt änderbar)
        private readonly Dictionary<ResourceType, int> _stock = new();

        // Konstruktor: wird beim "new ResourceStore()" automatisch aufgerufen
        public ResourceStore()
        {
            // Erst alle Ressourcen auf 0 setzen, damit keine fehlt im Dictionary
            // Enum.GetValues<ResourceType>() liefert alle Werte des Enums als Liste
            foreach (ResourceType r in Enum.GetValues<ResourceType>())
                _stock[r] = 0;

            // Dann die Startwerte setzen – so beginnt das Spiel nicht bei Null
            _stock[ResourceType.Holz]     = 20;
            _stock[ResourceType.Stein]    = 15;
            _stock[ResourceType.Getreide] = 10;
            _stock[ResourceType.Wasser]   = 10;
        }

        // Gibt die aktuelle Menge einer bestimmten Ressource zurück
        // "=>" ist eine Kurzschreibweise für eine einzeilige Methode
        public int Get(ResourceType r) => _stock[r];

        // Prüft ob alle Ressourcen in "cost" ausreichend vorhanden sind.
        // cost ist ein Dictionary wie z.B. { Holz: 5, Stein: 3 }
        // .All() gibt true zurück wenn die Bedingung für JEDES Element gilt.
        // kv = "key-value", also ein Eintrag aus dem Dictionary
        public bool CanAfford(Dictionary<ResourceType, int> cost)
            => cost.All(kv => _stock[kv.Key] >= kv.Value);

        // Zieht alle Ressourcen in "cost" vom Lager ab (z.B. Baukosten bezahlen)
        // Vorher immer CanAfford() prüfen!
        public void Pay(Dictionary<ResourceType, int> cost)
        {
            foreach (var kv in cost)
                _stock[kv.Key] -= kv.Value;  // -= bedeutet: aktueller Wert minus kv.Value
        }

        // Fügt Ressourcen zum Lager hinzu (z.B. Produktion eines Gebäudes)
        public void Add(Dictionary<ResourceType, int> output)
        {
            foreach (var kv in output)
                _stock[kv.Key] += kv.Value;  // += bedeutet: aktueller Wert plus kv.Value
        }

        // Gibt eine KOPIE des aktuellen Lagers zurück (sog. "Snapshot").
        // Wichtig: Kopie, damit externe Stellen das Original nicht versehentlich ändern.
        // "new(_stock)" erstellt ein neues Dictionary mit denselben Einträgen.
        public Dictionary<ResourceType, int> Snapshot()
            => new(_stock);
    }


    // ===========================================================
    // 3. GEBÄUDE-VORLAGE (Bauplan)
    // ===========================================================
    // BuildingDef = "Building Definition" = der Bauplan für einen Gebäudetyp.
    // Hier steht, was ein Gebäude kostet, was es verbraucht, was es produziert.
    // Eine BuildingDef-Instanz ist UNVERÄNDERLICH (init-Properties).
    // Das echte, gebaute Objekt im Spiel ist BuildingInstance (siehe unten).
    //
    // NEUES GEBÄUDE HINZUFÜGEN:
    //   Im BuildingCatalog ein neues BuildingDef-Objekt anlegen – das reicht!
    public class BuildingDef
    {
        // "init" bedeutet: nur im Konstruktor/Objektinitialisierer setzbar,
        // danach schreibgeschützt. Perfekt für unveränderliche Definitionen.

        public string Name         { get; init; } = "";    // Anzeigename
        public string Icon         { get; init; } = "🏠";  // Emoji-Symbol
        public string Beschreibung { get; init; } = "";    // Kurzerklärung für den Katalog

        // Ressourcen, die man einmalig bezahlt um das Gebäude zu bauen
        public Dictionary<ResourceType, int> Baukosten  { get; init; } = new();

        // Ressourcen, die das Gebäude jede Produktionsrunde verbraucht (Eingabe)
        public Dictionary<ResourceType, int> Verbrauch  { get; init; } = new();

        // Ressourcen, die das Gebäude jede Produktionsrunde erzeugt (Ausgabe)
        public Dictionary<ResourceType, int> Produktion { get; init; } = new();

        // Wie oft produziert das Gebäude? 1 = jede Runde, 2 = jede 2. Runde, usw.
        public int ProduktionIntervall { get; init; } = 1;
    }


    // ===========================================================
    // 4. GEBÄUDE-INSTANZ (ein konkretes gebautes Gebäude)
    // ===========================================================
    // BuildingInstance = ein einzelnes, tatsächlich gebautes Exemplar.
    // Speichert den Zustand (aktiv/inaktiv, wie viele Runden schon gelaufen).
    // Jedes Gebäude das der Spieler baut, erzeugt eine neue Instanz.
    // Beispiel: 3x Holzfäller gebaut = 3 BuildingInstance-Objekte,
    //           alle zeigen auf dieselbe BuildingDef "Holzfäller".
    public class BuildingInstance
    {
        // Referenz auf den Bauplan (readonly = nur im Konstruktor setzbar)
        public BuildingDef Def   { get; }

        // Ist das Gebäude aktiv? (Für spätere Erweiterung: Pause-Funktion)
        public bool Aktiv  { get; set; } = true;

        // Zählt wie viele Runden dieses Gebäude schon existiert
        // (wird für das Produktionsintervall genutzt)
        public int Runden  { get; set; } = 0;

        // Konstruktor: bekommt den Bauplan übergeben und speichert ihn
        public BuildingInstance(BuildingDef def) => Def = def;

        // Versucht in dieser Runde zu produzieren.
        // Gibt true zurück wenn tatsächlich produziert wurde, sonst false.
        // store = das Lager, aus dem Verbrauch gezogen und Produktion rein kommt
        public bool TryProduce(ResourceStore store)
        {
            // Wenn Gebäude deaktiviert → nichts tun
            if (!Aktiv) return false;

            // Rundenzeiger erhöhen (zählt wie lange das Gebäude schon läuft)
            Runden++;

            // Modulorechnung: Runden % Intervall == 0 bedeutet "ist jetzt eine Produktionsrunde?"
            // Beispiel: Intervall=3, Runden=6 → 6%3=0 → produziert
            //           Intervall=3, Runden=5 → 5%3=2 → produziert NICHT
            if (Runden % Def.ProduktionIntervall != 0) return false;

            // Hat das Lager genug Ressourcen für den Verbrauch?
            if (!store.CanAfford(Def.Verbrauch)) return false;

            // Verbrauch vom Lager abziehen (z.B. Getreide für die Mühle)
            store.Pay(Def.Verbrauch);

            // Produktion ins Lager legen (z.B. Mehl aus der Mühle)
            store.Add(Def.Produktion);

            // Alles geklappt → true zurückgeben
            return true;
        }
    }


    // ===========================================================
    // 5. GEBÄUDE-KATALOG
    // ===========================================================
    // Zentrale Liste aller verfügbaren Gebäudetypen.
    // "static" = gehört zur Klasse selbst, kein Objekt nötig.
    // "readonly" = die Liste selbst kann nicht ausgetauscht werden
    //              (aber Einträge hinzufügen/entfernen ist möglich).
    //
    // NEUES GEBÄUDE HINZUFÜGEN:
    //   Einfach ein neues "new BuildingDef { ... }" hier in die Liste eintragen.
    //   Der Rest (Menüs, Katalog, Produktionslogik) funktioniert automatisch!
    public static class BuildingCatalog
    {
        public static readonly List<BuildingDef> Alle = new()
        {
            // -- Holzfäller ----------------------------------------
            // Einfachstes Gebäude: Kein Verbrauch, produziert Holz.
            // Grundstein für alle anderen Gebäude.
            new BuildingDef
            {
                Name                = "Holzfäller",
                Icon                = "🪓",
                Beschreibung        = "Produziert jede Runde 2 Holz",
                Baukosten           = new() { [ResourceType.Holz] = 5 },
                Verbrauch           = new(),  // leeres Dictionary = kein Verbrauch
                Produktion          = new() { [ResourceType.Holz] = 2 },
                ProduktionIntervall = 1,      // produziert jede Runde
            },

            // -- Steinmetz -----------------------------------------
            // Produziert Stein. Teurer als Holzfäller, aber Stein ist
            // essenziell für fortgeschrittene Gebäude.
            new BuildingDef
            {
                Name                = "Steinmetz",
                Icon                = "⛏️",
                Beschreibung        = "Produziert jede Runde 1 Stein",
                Baukosten           = new() { [ResourceType.Holz] = 8, [ResourceType.Stein] = 3 },
                Verbrauch           = new(),
                Produktion          = new() { [ResourceType.Stein] = 1 },
                ProduktionIntervall = 1,
            },

            // -- Mühle ---------------------------------------------
            // Erste Verarbeitungsstufe: Wandelt Getreide in Mehl um.
            // Produziert nur alle 2 Runden (Verarbeitung braucht Zeit).
            new BuildingDef
            {
                Name                = "Mühle",
                Icon                = "⚙️",
                Beschreibung        = "Wandelt 2 Getreide → 3 Mehl (alle 2 Runden)",
                Baukosten           = new() { [ResourceType.Holz] = 10, [ResourceType.Stein] = 5 },
                Verbrauch           = new() { [ResourceType.Getreide] = 2 }, // braucht Getreide
                Produktion          = new() { [ResourceType.Mehl] = 3 },     // erzeugt Mehl
                ProduktionIntervall = 2,
            },

            // -- Bäckerei ------------------------------------------
            // Zweite Stufe der Nahrungskette: Mehl + Wasser → Brot.
            // Brot wird von der Eisenmine benötigt (Verpflegung der Bergleute).
            new BuildingDef
            {
                Name                = "Bäckerei",
                Icon                = "🍞",
                Beschreibung        = "Wandelt 3 Mehl + 1 Wasser → 4 Brot (alle 2 Runden)",
                Baukosten           = new() { [ResourceType.Holz] = 8, [ResourceType.Stein] = 8 },
                Verbrauch           = new() { [ResourceType.Mehl] = 3, [ResourceType.Wasser] = 1 },
                Produktion          = new() { [ResourceType.Brot] = 4 },
                ProduktionIntervall = 2,
            },

            // -- Fischerhütte --------------------------------------
            // Alternative Nahrungsquelle ohne Produktionskette.
            // Günstig zu bauen, kein Verbrauch.
            new BuildingDef
            {
                Name                = "Fischerhütte",
                Icon                = "🎣",
                Beschreibung        = "Produziert alle 2 Runden 3 Fisch",
                Baukosten           = new() { [ResourceType.Holz] = 6 },
                Verbrauch           = new(),
                Produktion          = new() { [ResourceType.Fisch] = 3 },
                ProduktionIntervall = 2,
            },

            // -- Eisenmine -----------------------------------------
            // Produziert Eisen, aber braucht Brot als Verpflegung.
            // → Zuerst Brot-Kette aufbauen: Getreide→Mühle→Mehl→Bäckerei→Brot
            new BuildingDef
            {
                Name                = "Eisenmine",
                Icon                = "⛰️",
                Beschreibung        = "Produziert alle 3 Runden 2 Eisen (braucht 1 Brot/Runde)",
                Baukosten           = new() { [ResourceType.Holz] = 12, [ResourceType.Stein] = 10 },
                Verbrauch           = new() { [ResourceType.Brot] = 1 }, // Bergleute brauchen Verpflegung
                Produktion          = new() { [ResourceType.Eisen] = 2 },
                ProduktionIntervall = 3, // langsame Produktion
            },

            // -- Schmiede ------------------------------------------
            // Veredelt Eisen zu Werkzeug. Werkzeug ist für Goldmine nötig.
            new BuildingDef
            {
                Name                = "Schmiede",
                Icon                = "🔨",
                Beschreibung        = "Wandelt 2 Eisen → 3 Werkzeug (alle 3 Runden)",
                Baukosten           = new() { [ResourceType.Holz] = 10, [ResourceType.Stein] = 12, [ResourceType.Eisen] = 2 },
                Verbrauch           = new() { [ResourceType.Eisen] = 2 },
                Produktion          = new() { [ResourceType.Werkzeug] = 3 },
                ProduktionIntervall = 3,
            },

            // -- Goldmine ------------------------------------------
            // Das Endziel: produziert Gold, braucht aber viel Infrastruktur.
            // Benötigt Brot (Nahrungskette) UND Werkzeug (Eisenkette).
            // Produziert nur alle 5 Runden → Geduld ist gefragt!
            new BuildingDef
            {
                Name                = "Goldmine",
                Icon                = "💰",
                Beschreibung        = "Produziert alle 5 Runden 1 Gold (braucht 2 Brot + 1 Werkzeug)",
                Baukosten           = new() { [ResourceType.Stein] = 20, [ResourceType.Werkzeug] = 5 },
                Verbrauch           = new() { [ResourceType.Brot] = 2, [ResourceType.Werkzeug] = 1 },
                Produktion          = new() { [ResourceType.Gold] = 1 },
                ProduktionIntervall = 5,
            },
        };

        // Hilfsmethode: Gebäude anhand des Namens suchen.
        // "?" nach BuildingDef bedeutet: gibt BuildingDef oder null zurück.
        // FirstOrDefault() gibt das erste passende Element oder null zurück.
        // StringComparison.OrdinalIgnoreCase = Groß/Kleinschreibung egal
        public static BuildingDef? FindByName(string name)
            => Alle.FirstOrDefault(b => b.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
    }


    // ===========================================================
    // 6. SPIELSTAND
    // ===========================================================
    // GameState hält alles zusammen: Runde, Lager, Gebäude, Log.
    // Es ist das zentrale Datenobjekt das durch das ganze Spiel weitergereicht wird.
    public class GameState
    {
        // Aktuelle Rundennummer (beginnt bei 0, wird bei NextRound() erhöht)
        public int Runde { get; set; } = 0;

        // Das Ressourcenlager (ein ResourceStore-Objekt)
        // "new()" erstellt sofort eine neue Instanz beim Anlegen von GameState
        public ResourceStore Lager { get; } = new();

        // Liste aller gebauten Gebäude (BuildingInstance-Objekte)
        public List<BuildingInstance> Gebäude { get; } = new();

        // Chronologisches Spielprotokoll als Textnachrichten
        public List<string> Log { get; } = new();

        // Fügt eine neue Zeile ins Log ein, immer mit aktueller Rundenangabe
        public void AddLog(string msg) => Log.Add($"[Runde {Runde}] {msg}");

        // -- Runde vorwärts ----------------------------------------
        // Wird aufgerufen wenn der Spieler Enter drückt.
        // Erhöht die Rundennummer und lässt alle Gebäude produzieren.
        public void NextRound()
        {
            Runde++;  // Runde hochzählen

            int produced = 0;  // Zähler: wie viele Gebäude haben produziert?
            int failed   = 0;  // Zähler: wie viele haben es NICHT geschafft?

            // Jedes gebaute Gebäude darf versuchen zu produzieren
            foreach (var b in Gebäude)
            {
                // TryProduce() zählt intern die Runden hoch und produziert ggf.
                bool ok = b.TryProduce(Lager);

                // War diese Runde eine Produktionsrunde für dieses Gebäude?
                // b.Runden ist bereits hochgezählt in TryProduce
                if (b.Runden % b.Def.ProduktionIntervall == 0)
                {
                    if (ok)           produced++;  // Produktion erfolgreich
                    else if (b.Aktiv) failed++;    // Aktiv aber gescheitert → Rohstoffmangel
                }
            }

            // Zusammenfassung der Runde ins Log schreiben
            AddLog($"Runde abgeschlossen – {produced} Gebäude produzierten, {failed} standen still (Rohstoffmangel)");
        }

        // -- Gebäude kaufen ----------------------------------------
        // Prüft ob die Baukosten bezahlbar sind, zieht sie ab und
        // fügt das neue Gebäude der Gebäudeliste hinzu.
        // Gibt true zurück bei Erfolg, false wenn zu wenig Ressourcen.
        public bool BuyBuilding(BuildingDef def)
        {
            // Kann der Spieler die Baukosten bezahlen?
            if (!Lager.CanAfford(def.Baukosten)) return false;

            // Baukosten vom Lager abziehen
            Lager.Pay(def.Baukosten);

            // Neues Gebäude-Objekt erstellen und zur Liste hinzufügen.
            // "new BuildingInstance(def)" übergibt den Bauplan an die neue Instanz.
            Gebäude.Add(new BuildingInstance(def));

            // Ereignis ins Log schreiben
            AddLog($"{def.Icon} {def.Name} gebaut!");

            return true;
        }
    }


    // ===========================================================
    // 7. BENUTZEROBERFLÄCHE (Terminal-UI)
    // ===========================================================
    // Alle Methoden hier zeichnen Inhalte ins Terminal.
    // "static class" = keine Instanz nötig, alle Methoden direkt aufrufbar.
    // Trennung von Logik (GameState) und Darstellung (UI) ist gutes Design:
    // Man könnte später z.B. eine GUI bauen ohne GameState anzufassen.
    public static class UI
    {
        // Zuordnung: Ressourcentyp → Emoji-Symbol.
        // Wird in mehreren Methoden genutzt um Ressourcen anschaulich darzustellen.
        private static readonly Dictionary<ResourceType, string> Emojis = new()
        {
            [ResourceType.Holz]     = "🪵",
            [ResourceType.Stein]    = "🪨",
            [ResourceType.Getreide] = "🌾",
            [ResourceType.Mehl]     = "🌫️",
            [ResourceType.Brot]     = "🍞",
            [ResourceType.Fisch]    = "🐟",
            [ResourceType.Eisen]    = "🔩",
            [ResourceType.Werkzeug] = "🔨",
            [ResourceType.Gold]     = "💰",
            [ResourceType.Wasser]   = "💧",
        };

        // Gibt das Emoji für eine Ressource zurück (oder "?" wenn unbekannt).
        // TryGetValue ist sicherer als [r], weil es keinen Absturz bei fehlendem Key gibt.
        public static string ResourceEmoji(ResourceType r)
            => Emojis.TryGetValue(r, out var e) ? e : "?";

        // -- Kopfzeile ---------------------------------------------
        // Zeichnet den Spieltitel mit aktueller Rundennummer.
        // {runde,-4} = linksbündig in 4 Zeichen (damit das Layout stabil bleibt)
        public static void DrawHeader(int runde)
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("╔══════════════════════════════════════════════════════════╗");
            Console.WriteLine($"║           🏰  POCKETSIM  │  Runde {runde,-4}                   ║");
            Console.WriteLine("╚══════════════════════════════════════════════════════════╝");
            Console.ResetColor();  // Farbe zurücksetzen, damit folgende Ausgaben normal aussehen
        }

        // -- Lageranzeige ------------------------------------------
        // Zeigt alle Ressourcen mit aktuellem Bestand an.
        // Snapshot() liefert eine Kopie, damit Werte sich nicht mitten in der Anzeige ändern.
        public static void DrawResources(ResourceStore store)
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("\n── LAGER ──────────────────────────────────────────────────");
            Console.ResetColor();

            var snap = store.Snapshot();  // Momentaufnahme des Lagers

            int col = 0;  // Spaltenzähler für 3-spaltige Darstellung
            foreach (var kv in snap)
            {
                // Formatierung: Emoji + Name linksbündig (10 Zeichen) + Menge rechtsbündig (4 Zeichen)
                string entry = $"  {ResourceEmoji(kv.Key)} {kv.Key,-10} {kv.Value,4}";
                Console.Write(entry);  // Write (ohne ln) damit es in einer Zeile bleibt

                // Nach jeder 3. Spalte Zeilenumbruch einfügen
                if (++col % 3 == 0) Console.WriteLine();
            }

            // Letzte Zeile abschließen falls Anzahl nicht durch 3 teilbar ist
            if (col % 3 != 0) Console.WriteLine();
        }

        // -- Gebäudeanzeige ----------------------------------------
        // Zeigt alle gebauten Gebäude gruppiert nach Typ an.
        // GroupBy() fasst gleiche Gebäude zusammen: "Holzfäller x3" statt 3 einzelne Zeilen.
        public static void DrawBuildings(List<BuildingInstance> buildings)
        {
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("\n── GEBÄUDE ─────────────────────────────────────────────────");
            Console.ResetColor();

            // .Any() prüft ob die Liste mindestens ein Element enthält
            if (!buildings.Any())
            {
                Console.WriteLine("  (noch keine Gebäude gebaut)");
                return;  // Frühes Beenden der Methode, kein weiterer Code nötig
            }

            // Gebäude nach Name gruppieren: alle Holzfäller zusammen, usw.
            var groups = buildings.GroupBy(b => b.Def.Name);
            foreach (var g in groups)
            {
                var def   = g.First().Def;  // Bauplan aus Gruppe holen (alle gleich)
                int count = g.Count();      // Wie viele von diesem Typ gibt es?
                Console.WriteLine($"  {def.Icon} {def.Name} x{count}  –  {def.Beschreibung}");
            }
        }

        // -- Kurz-Log ----------------------------------------------
        // Zeigt nur die letzten "lines" Einträge (Standard: 4).
        // TakeLast(n) gibt die letzten n Elemente einer Liste zurück.
        public static void DrawLog(List<string> log, int lines = 4)
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("\n── LOG ─────────────────────────────────────────────────────");
            Console.ResetColor();

            foreach (var entry in log.TakeLast(lines))
                Console.WriteLine($"  {entry}");
        }

        // -- Hauptmenü ---------------------------------------------
        // Zeigt die verfügbaren Aktionen und wartet auf Eingabe.
        public static void DrawMenu()
        {
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine("\n── AKTIONEN ────────────────────────────────────────────────");
            Console.ResetColor();
            Console.WriteLine("  [Enter]  Nächste Runde");
            Console.WriteLine("  [b]      Gebäude bauen");
            Console.WriteLine("  [k]      Gebäude-Katalog anzeigen");
            Console.WriteLine("  [l]      Vollständiges Log");
            Console.WriteLine("  [q]      Beenden");
            Console.Write("\n> ");  // Eingabeaufforderung ohne Zeilenumbruch
        }

        // -- Gebäude-Katalog ---------------------------------------
        // Zeigt ALLE Gebäude mit Details an.
        // Grün = leistbar, Rot = zu wenig Ressourcen.
        // Wartet am Ende auf Enter bevor es zurückgeht.
        public static void DrawCatalog(ResourceStore store)
        {
            Console.Clear();  // Terminal leeren für saubere Darstellung
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("══ GEBÄUDE-KATALOG ══════════════════════════════════════════\n");
            Console.ResetColor();

            foreach (var def in BuildingCatalog.Alle)
            {
                // Prüfen ob der Spieler sich dieses Gebäude leisten kann
                bool canAfford = store.CanAfford(def.Baukosten);

                // Farbe je nach Leistbarkeit: grün = ja, dunkelrot = nein
                Console.ForegroundColor = canAfford ? ConsoleColor.Green : ConsoleColor.DarkRed;
                Console.WriteLine($"  {def.Icon}  {def.Name}");
                Console.ResetColor();
                Console.WriteLine($"     {def.Beschreibung}");

                // Baukosten anzeigen (nur wenn vorhanden)
                if (def.Baukosten.Any())
                {
                    // LINQ-Select wandelt jeden Dictionary-Eintrag in einen String um.
                    // string.Join("  ", ...) verbindet alle Strings mit Doppelleerzeichen.
                    string kosten = string.Join("  ", def.Baukosten.Select(kv =>
                        $"{ResourceEmoji(kv.Key)}{kv.Value}"));
                    Console.WriteLine($"     Kosten: {kosten}");
                }

                // Verbrauch pro Runde (nur wenn vorhanden)
                if (def.Verbrauch.Any())
                {
                    string vbr = string.Join("  ", def.Verbrauch.Select(kv =>
                        $"{ResourceEmoji(kv.Key)}{kv.Value}"));
                    Console.WriteLine($"     Verbrauch/Runde: {vbr}");
                }

                // Produktion (immer anzeigen)
                string prod = string.Join("  ", def.Produktion.Select(kv =>
                    $"{ResourceEmoji(kv.Key)}{kv.Value}"));
                Console.WriteLine($"     Produktion: {prod}  (alle {def.ProduktionIntervall} Runden)");

                Console.WriteLine();  // Leerzeile zwischen den Gebäuden
            }

            // Legende unten
            Console.ForegroundColor = ConsoleColor.Green;
            Console.Write("  Grün = leistbar  |  ");
            Console.ForegroundColor = ConsoleColor.DarkRed;
            Console.Write("Rot = zu wenig Ressourcen");
            Console.ResetColor();
            Console.WriteLine("\n\n[Enter] zurück");
            Console.ReadLine();  // Warten bis der Spieler Enter drückt
        }

        // -- Bau-Menü ----------------------------------------------
        // Zeigt eine nummerierte Liste aller Gebäude.
        // Spieler tippt eine Zahl → Gebäude wird gebaut (wenn leistbar).
        public static void DrawBuildMenu(GameState state)
        {
            Console.Clear();
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("══ GEBÄUDE BAUEN ════════════════════════════════════════════\n");
            Console.ResetColor();

            // Gebäude nummeriert auflisten (i beginnt bei 0, Anzeige bei 1)
            for (int i = 0; i < BuildingCatalog.Alle.Count; i++)
            {
                var def        = BuildingCatalog.Alle[i];
                bool canAfford = state.Lager.CanAfford(def.Baukosten);

                Console.ForegroundColor = canAfford ? ConsoleColor.Green : ConsoleColor.DarkRed;

                // Baukosten als lesbaren String zusammenbauen
                string kosten = def.Baukosten.Any()
                    ? string.Join(" ", def.Baukosten.Select(kv => $"{ResourceEmoji(kv.Key)}{kv.Value}"))
                    : "kostenlos";

                // i+1 weil Arrays 0-basiert sind, aber [1] für den Spieler verständlicher ist
                Console.WriteLine($"  [{i + 1}] {def.Icon} {def.Name,-15}  Kosten: {kosten}");
                Console.ResetColor();
            }

            Console.WriteLine("\n  [0] Abbrechen");
            Console.Write("\nWelches Gebäude bauen? > ");

            // Eingabe lesen und sicher in eine Zahl umwandeln.
            // "?? "0"" = falls ReadLine() null zurückgibt, "0" als Fallback nehmen.
            string input = Console.ReadLine() ?? "0";

            // int.TryParse: versucht String in Zahl umzuwandeln, kein Absturz bei Fehleingabe.
            // "out int choice" = Ergebnis wird in "choice" geschrieben.
            if (int.TryParse(input, out int choice) && choice >= 1 && choice <= BuildingCatalog.Alle.Count)
            {
                // choice-1 weil Anzeige 1-basiert, Liste aber 0-basiert ist
                var def = BuildingCatalog.Alle[choice - 1];

                if (state.BuyBuilding(def))
                {
                    // Erfolg
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine($"\n✅ {def.Name} erfolgreich gebaut!");
                }
                else
                {
                    // Fehlgeschlagen (zu wenig Ressourcen)
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("\n❌ Nicht genug Ressourcen!");
                }

                Console.ResetColor();
                Thread.Sleep(1000);  // 1 Sekunde warten damit die Meldung lesbar ist
            }
            // Keine else-Behandlung nötig: bei 0 oder ungültiger Eingabe einfach zurück
        }

        // -- Vollständiges Log -------------------------------------
        // Zeigt ALLE Logeinträge seit Spielbeginn.
        public static void DrawFullLog(List<string> log)
        {
            Console.Clear();
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("══ VOLLSTÄNDIGES LOG ════════════════════════════════════════\n");
            Console.ResetColor();

            foreach (var entry in log)
                Console.WriteLine($"  {entry}");

            Console.WriteLine("\n[Enter] zurück");
            Console.ReadLine();
        }
    }


    // ===========================================================
    // 8. EINSTIEGSPUNKT / HAUPTSCHLEIFE
    // ===========================================================
    // Program.Main() ist der Startpunkt des Programms – hier beginnt die Ausführung.
    // Die Hauptschleife (Game Loop) läuft solange bis der Spieler "q" drückt.
    class Program
    {
        static void Main()
        {
            // UTF-8 aktivieren damit Emojis im Terminal richtig angezeigt werden
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            // Fenstertitel des Terminals setzen (sichtbar in der Taskleiste)
            Console.Title = "PocketSim";

            // Neuen Spielstand erstellen (Runde 0, Startressourcen, keine Gebäude)
            var state = new GameState();
            state.AddLog("Spiel gestartet. Viel Erfolg, Siedler! 🏰");

            // Solange "running" true ist, läuft das Spiel weiter
            bool running = true;

            // ── GAME LOOP ──────────────────────────────────────────
            // Das Herzstück jedes Spiels: immer wieder
            //   1. Zustand anzeigen
            //   2. Auf Eingabe warten
            //   3. Eingabe verarbeiten
            while (running)
            {
                // Bildschirm leeren und alles neu aufbauen
                Console.Clear();

                // Alle UI-Bereiche zeichnen
                UI.DrawHeader(state.Runde);       // Titelzeile oben
                UI.DrawResources(state.Lager);    // Lagerbestand
                UI.DrawBuildings(state.Gebäude);  // Gebäudeliste
                UI.DrawLog(state.Log);            // Letzte Log-Einträge
                UI.DrawMenu();                    // Aktionsmenü + Eingabe-Prompt

                // Spielereingabe lesen, Leerzeichen entfernen, Kleinbuchstaben wandeln.
                // "??" = Nullcoalescing: falls ReadLine() null ist, "" nehmen.
                string input = Console.ReadLine()?.Trim().ToLower() ?? "";

                // Je nach Eingabe die passende Aktion ausführen
                switch (input)
                {
                    case "":   // Enter ohne Text → nächste Runde starten
                        state.NextRound();
                        break;

                    case "b":  // Bau-Menü öffnen
                        UI.DrawBuildMenu(state);
                        break;

                    case "k":  // Katalog anzeigen (nur Lager übergeben, kein ganzer GameState)
                        UI.DrawCatalog(state.Lager);
                        break;

                    case "l":  // Vollständiges Log anzeigen
                        UI.DrawFullLog(state.Log);
                        break;

                    case "q":  // Beenden: Loop-Variable auf false → while-Bedingung schlägt fehl
                        running = false;
                        break;

                    // Alle anderen Eingaben werden stillschweigend ignoriert
                }
            }

            // Abschlussmeldung nach dem Beenden
            Console.Clear();
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine($"\n  Spiel beendet nach {state.Runde} Runden. Tschüss! 👋\n");
            Console.ResetColor();
        }
    }
}