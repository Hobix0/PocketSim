using PocketSim.Data;
using PocketSim.Models;
using PocketSim.Systems;
using PocketSim;
using System.Threading;

namespace PocketSim.UI;

// ============================================================
//  FORSCHUNGSBILDSCHIRM
//  Zeigt den kompletten Technologiebaum visuell an.
//  Ermöglicht das Starten neuer Forschungen.
// ============================================================
public static class ResearchScreen
{
    public static void Show(GameState state)
    {
        while (true)
        {
            Console.Clear();
            Renderer.PrintHeader("🔬  FORSCHUNGSBAUM", ConsoleColor.Blue);

            ZeigeBaum(state.Forschung);
            ZeigeAktiveForschung(state);
            var verfügbar = GetVerfügbareForschungen(state);
            ZeigeStartoptionen(verfügbar, state);

            Console.WriteLine();
            Renderer.PrintDivider();
            Console.Write("\n  Forschung starten (Nummer) oder [0] Zurück: > ");

            string input = Console.ReadLine() ?? "0";
            if (input == "0" || input == "") break;

            if (int.TryParse(input, out int wahl) && wahl >= 1 && wahl <= verfügbar.Count)
            {
                var def = verfügbar[wahl - 1];
                if (state.StarteForschung(def))
                {
                    Console.ForegroundColor = ConsoleColor.Green;
                    Console.WriteLine($"\n  ✅ Forschung gestartet: {def.Icon} {def.Name}");
                    Console.ResetColor();
                    Thread.Sleep(900);
                    break;
                }
                else
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("\n  ❌ Kann nicht gestartet werden (läuft bereits eine Forschung oder Ressourcen fehlen).");
                    Console.ResetColor();
                    Thread.Sleep(900);
                }
            }
        }
    }

    // ── Technologiebaum visualisieren ─────────────────────────
    // Zeigt alle Forschungen nach Tier mit Status-Icons und Verbindungslinien
    private static void ZeigeBaum(ResearchSystem research)
    {
        Console.WriteLine();

        for (int tier = 1; tier <= 3; tier++)
        {
            ZeigeTierHeader(tier);
            var forschungenDesTiers = ResearchCatalog.Alle.Where(r => r.Tier == tier).ToList();

            foreach (var def in forschungenDesTiers)
                ZeigeForschungsKnoten(def, research);

            // Verbindungslinien zwischen Tiers (außer nach dem letzten)
            if (tier < 3)
            {
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine();
                Console.WriteLine("         │ höhere Forschungen bauen auf Tier " + tier + " auf │");
                Console.WriteLine("         └──────────────────────────────────────────────┘");
                Console.ResetColor();
                Console.WriteLine();
            }
        }
    }

    private static void ZeigeTierHeader(int tier)
    {
        string label = tier switch
        {
            1 => "TIER 1 – GRUNDLAGEN",
            2 => "TIER 2 – FORTGESCHRITTEN",
            3 => "TIER 3 – MEISTERSCHAFT",
            _ => $"TIER {tier}"
        };
        Console.ForegroundColor = ConsoleColor.DarkYellow;
        Console.WriteLine($"  ┌── {label} " + new string('─', Math.Max(0, 44 - label.Length)) + "┐");
        Console.ResetColor();
    }

    private static void ZeigeForschungsKnoten(ResearchDef def, ResearchSystem research)
    {
        bool abgeschlossen = research.IsAbgeschlossen(def.Id);
        bool aktiv         = research.AktiveForschung?.Id == def.Id;
        bool verfügbar     = research.IstVerfügbar(def) && !abgeschlossen && !aktiv;

        // Status-Symbol und Farbe bestimmen
        string status;
        ConsoleColor farbe;
        if (abgeschlossen)      { status = "✅"; farbe = ConsoleColor.Green;    }
        else if (aktiv)         { status = "🔬"; farbe = ConsoleColor.Cyan;     }
        else if (verfügbar)     { status = "🟡"; farbe = ConsoleColor.Yellow;   }
        else                    { status = "🔒"; farbe = ConsoleColor.DarkGray; }

        // Voraussetzungen als Text (IDs → Namen übersetzen)
        string voraussText = def.Voraussetzungen.Any()
            ? "[braucht: " + string.Join(" + ", def.Voraussetzungen.Select(ResearchCatalog.NameFürId)) + "]"
            : "";

        Console.ForegroundColor = farbe;
        Console.Write($"  │  {status} {def.Icon}  {def.Name,-18}  ⏱ {def.Dauer} Runden  ");

        // Fortschrittsbalken wenn aktiv
        if (aktiv)
        {
            double pct = research.FortschrittProzent();
            string bar = Renderer.ProgressBar(pct, 1.0, 12);
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.Write($"[{bar}] {research.VerbleibendeRunden} Runden verbleibend");
        }
        else
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.Write(voraussText);
        }

        Console.WriteLine();

        // Effekt-Zeile
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($"  │     └─ {def.Effekt}");
        Console.ResetColor();
    }

    // ── Aktive Forschung hervorheben ──────────────────────────
    private static void ZeigeAktiveForschung(GameState state)
    {
        if (state.Forschung.AktiveForschung == null) return;

        Renderer.PrintSection("AKTIVE FORSCHUNG", ConsoleColor.Cyan);
        var r   = state.Forschung.AktiveForschung;
        int done = r.Dauer - state.Forschung.VerbleibendeRunden;
        string bar = Renderer.ProgressBar(done, r.Dauer, 30);

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine($"  {r.Icon}  {r.Name}  [{bar}]  noch {state.Forschung.VerbleibendeRunden}/{r.Dauer} Runden");
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine($"  Schaltet frei: {string.Join(", ", r.SchaltetFreiGebäude)}");
        Console.ResetColor();
    }

    // ── Neue Forschungen die gestartet werden können ──────────
    private static void ZeigeStartoptionen(List<ResearchDef> verfügbar, GameState state)
    {
        if (state.Forschung.AktiveForschung != null)
        {
            Renderer.PrintSection("INFO", ConsoleColor.DarkGray);
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  Neue Forschung kann erst gestartet werden wenn die aktuelle fertig ist.");
            Console.ResetColor();
            return;
        }

        if (!verfügbar.Any())
        {
            Renderer.PrintSection("KEINE FORSCHUNG VERFÜGBAR", ConsoleColor.DarkGray);
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  Alle verfügbaren Forschungen sind abgeschlossen oder Voraussetzungen fehlen.");
            Console.ResetColor();
            return;
        }

        Renderer.PrintSection("FORSCHUNG STARTEN", ConsoleColor.Yellow);
        for (int i = 0; i < verfügbar.Count; i++)
        {
            var def       = verfügbar[i];
            bool leistbar = state.Lager.CanAfford(def.Kosten);
            string kosten = Renderer.FormatResources(def.Kosten);

            Console.ForegroundColor = leistbar ? ConsoleColor.Yellow : ConsoleColor.DarkRed;
            Console.WriteLine($"  [{i + 1}]  {def.Icon} {def.Name,-18}  Kosten: {kosten}  ⏱ {def.Dauer} Runden");
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine($"       {def.Effekt}");
            Console.ResetColor();
        }
    }

    // Forschungen die gerade startbar sind (Voraussetzungen erfüllt, nicht abgeschlossen, nicht aktiv)
    private static List<ResearchDef> GetVerfügbareForschungen(GameState state)
    {
        return ResearchCatalog.Alle
            .Where(r => !state.Forschung.IsAbgeschlossen(r.Id)
                     && state.Forschung.AktiveForschung?.Id != r.Id
                     && state.Forschung.IstVerfügbar(r))
            .ToList();
    }
}
