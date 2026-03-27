using PocketSim.Models;
using PocketSim.Systems;
using PocketSim;

namespace PocketSim.UI;

// ============================================================
//  HAUPTBILDSCHIRM
//  Zeigt den kompletten Spielzustand auf einen Blick:
//  Header → Lager → Bevölkerung → Gebäude → Forschung → Ereignis → Log → Menü
// ============================================================
public static class MainScreen
{
    public static void Draw(GameState state)
    {
        Console.Clear();
        DrawHeader(state);
        DrawResources(state.Lager);
        DrawPopulation(state.Bevölkerung, state.Lager);
        DrawBuildings(state.Gebäude);
        DrawResearch(state.Forschung);
        DrawLastEvent(state.LetzteEreignis);
        DrawLog(state.Log);
        DrawMenu();
    }

    // ── Titelzeile mit Rundenanzahl und Ziel ─────────────────
    private static void DrawHeader(GameState state)
    {
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("╔══════════════════════════════════════════════════════════════╗");
        string title = $"🏰  POCKETSIM  │  Runde {state.Runde}";
        string goal  = $"Ziel: Burg oder {GameState.GoldZiel}💰 Gold";
        Console.WriteLine($"║  {title,-30}{goal,30}  ║");
        Console.WriteLine("╚══════════════════════════════════════════════════════════════╝");
        Console.ResetColor();
    }

    // ── Ressourcenlager in 4 Spalten ─────────────────────────
    private static void DrawResources(ResourceStore lager)
    {
        Renderer.PrintSection("LAGER", ConsoleColor.Cyan);

        var snap = lager.Snapshot();
        int col = 0;
        foreach (var kv in snap)
        {
            // Ressourcen mit 0 grau darstellen, andere weiß
            bool isEmpty = kv.Value == 0;
            Console.ForegroundColor = isEmpty ? ConsoleColor.DarkGray : ConsoleColor.White;

            // Formatierung: Emoji + Name (10 Zeichen) + Menge (4 Zeichen)
            Console.Write($"  {Renderer.Emoji(kv.Key)} {kv.Key,-10} {kv.Value,4}");
            Console.ResetColor();

            if (++col % 4 == 0) Console.WriteLine();
        }
        if (col % 4 != 0) Console.WriteLine();
    }

    // ── Bevölkerungsanzeige mit Statusbalken ─────────────────
    private static void DrawPopulation(PopulationSystem pop, ResourceStore lager)
    {
        Renderer.PrintSection("BEVÖLKERUNG", ConsoleColor.Magenta);

        // Fortschrittsbalken: aktuell / maximum
        string bar  = Renderer.ProgressBar(pop.Aktuell, pop.Maximum, 20);
        int    food = lager.Get(ResourceType.Brot) + lager.Get(ResourceType.Fisch);
        int    need = (int)Math.Ceiling(pop.Aktuell / 5.0);

        Console.ForegroundColor = ConsoleColor.Magenta;
        Console.Write($"  {pop.StimmungsSymbol()} {pop.Aktuell}/{pop.Maximum}  [{bar}]  ");
        Console.ResetColor();

        // Nahrungsanzeige: grün wenn genug, rot wenn knapp
        Console.ForegroundColor = food >= need ? ConsoleColor.Green : ConsoleColor.Red;
        Console.WriteLine($"Nahrung: {food}/{need} benötigt  ({pop.StimmungsText()})");
        Console.ResetColor();
    }

    // ── Gebaute Gebäude kompakt gruppiert ────────────────────
    private static void DrawBuildings(List<BuildingInstance> buildings)
    {
        Renderer.PrintSection("GEBÄUDE", ConsoleColor.Green);

        if (!buildings.Any())
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  (noch keine Gebäude – [b] drücken zum Bauen)");
            Console.ResetColor();
            return;
        }

        // Gleichnamige Gebäude zusammenfassen: "🪓 Holzfäller ×3"
        var groups = buildings.GroupBy(b => b.Def.Name);
        int col = 0;
        foreach (var g in groups)
        {
            var def = g.First().Def;
            Console.ForegroundColor = ConsoleColor.Green;
            Console.Write($"  {def.Icon} {def.Name} ×{g.Count()}");
            Console.ResetColor();
            if (++col % 3 == 0) Console.WriteLine();
            else Console.Write("   ");
        }
        if (col % 3 != 0) Console.WriteLine();
    }

    // ── Aktive Forschung mit Fortschrittsbalken ───────────────
    private static void DrawResearch(ResearchSystem research)
    {
        if (research.AktiveForschung == null) return;

        Renderer.PrintSection("AKTIVE FORSCHUNG", ConsoleColor.Blue);

        var r   = research.AktiveForschung;
        int done = r.Dauer - research.VerbleibendeRunden;
        string bar = Renderer.ProgressBar(done, r.Dauer, 25);

        Console.ForegroundColor = ConsoleColor.Blue;
        Console.WriteLine($"  {r.Icon} {r.Name}  [{bar}]  noch {research.VerbleibendeRunden} Runden");
        Console.ResetColor();
    }

    // ── Letztes Ereignis dieser Runde ─────────────────────────
    private static void DrawLastEvent(GameEvent? ev)
    {
        if (ev == null) return;

        var color = ev.IstPositiv ? ConsoleColor.Green : ConsoleColor.Red;
        Renderer.PrintSection("EREIGNIS DIESER RUNDE", color);

        Console.ForegroundColor = color;
        Console.WriteLine($"  {ev.Icon}  {ev.Titel}");
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($"     {ev.Beschreibung}");
        Console.ResetColor();
    }

    // ── Letzte 4 Log-Einträge ─────────────────────────────────
    private static void DrawLog(List<string> log)
    {
        Renderer.PrintSection("LETZTE EREIGNISSE", ConsoleColor.DarkGray);

        foreach (var entry in log.TakeLast(4))
        {
            // Wichtige Einträge farbig hervorheben
            ConsoleColor c = entry.Contains("⚠️") || entry.Contains("💀") ? ConsoleColor.Red
                           : entry.Contains("🎉") || entry.Contains("🏆") ? ConsoleColor.Yellow
                           : ConsoleColor.DarkGray;
            Console.ForegroundColor = c;
            Console.WriteLine($"  {entry}");
        }
        Console.ResetColor();
    }

    // ── Menüleiste ────────────────────────────────────────────
    private static void DrawMenu()
    {
        Console.WriteLine();
        Renderer.PrintDivider();
        Console.ForegroundColor = ConsoleColor.White;
        Console.WriteLine("  [Enter] Nächste Runde   [b] Bauen   [f] Forschen   [l] Chronik   [q] Beenden");
        Console.ResetColor();
        Console.Write("\n  > ");
    }
}
