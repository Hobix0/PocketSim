using PocketSim.Models;
using PocketSim;

namespace PocketSim.UI;

// ============================================================
//  CHRONIK (Vollständiges Spielprotokoll)
//  Zeigt alle Log-Einträge seit Spielbeginn in chronologischer Reihenfolge.
// ============================================================
public static class LogScreen
{
    public static void Show(GameState state)
    {
        Console.Clear();
        Renderer.PrintHeader("📜  CHRONIK DER SIEDLUNG", ConsoleColor.DarkYellow);
        Console.WriteLine();

        if (!state.Log.Any())
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine("  (noch keine Einträge)");
            Console.ResetColor();
        }

        foreach (var entry in state.Log)
        {
            // Einträge je nach Inhalt einfärben
            ConsoleColor farbe = ConsoleColor.DarkGray;
            if (entry.Contains("⚠️") || entry.Contains("❌") || entry.Contains("💀"))
                farbe = ConsoleColor.Red;
            else if (entry.Contains("🎉") || entry.Contains("🏆") || entry.Contains("✅"))
                farbe = ConsoleColor.Green;
            else if (entry.Contains("🔬") || entry.Contains("🏗️"))
                farbe = ConsoleColor.Cyan;
            else if (entry.Contains("Ereignis"))
                farbe = ConsoleColor.Yellow;

            Console.ForegroundColor = farbe;
            Console.WriteLine($"  {entry}");
        }

        Console.ResetColor();
        Console.WriteLine();
        Renderer.PrintDivider();
        Console.WriteLine("  [Enter] zurück");
        Console.ReadLine();
    }
}

// ============================================================
//  SIEG- UND NIEDERLAGE-BILDSCHIRM
// ============================================================
public static class EndScreen
{
    public static void ShowVictory(GameState state)
    {
        Console.Clear();
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine("\n\n");
        Console.WriteLine("  ╔══════════════════════════════════════════════════════════╗");
        Console.WriteLine("  ║                                                          ║");
        Console.WriteLine("  ║          🏆  SIEG!  GLÜCKWUNSCH, SIEDLER!  🏆           ║");
        Console.WriteLine("  ║                                                          ║");
        Console.WriteLine($"  ║          Du hast nach {state.Runde,3} Runden gewonnen!              ║");
        Console.WriteLine("  ║                                                          ║");
        Console.WriteLine("  ╚══════════════════════════════════════════════════════════╝");
        Console.ResetColor();

        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine($"  Abgeschlossene Forschungen: {state.Forschung.Abgeschlossen.Count}");
        Console.WriteLine($"  Gebäude errichtet:          {state.Gebäude.Count}");
        Console.WriteLine($"  Bevölkerung am Ende:        {state.Bevölkerung.Aktuell}");
        Console.WriteLine($"  Gold gesammelt:             {state.Lager.Get(ResourceType.Gold)}");
        Console.ResetColor();

        Console.WriteLine("\n  Drücke [Enter] um das Spiel zu beenden...");
        Console.ReadLine();
    }

    public static void ShowDefeat(GameState state)
    {
        Console.Clear();
        Console.ForegroundColor = ConsoleColor.Red;
        Console.WriteLine("\n\n");
        Console.WriteLine("  ╔══════════════════════════════════════════════════════════╗");
        Console.WriteLine("  ║                                                          ║");
        Console.WriteLine("  ║          💀  NIEDERLAGE!  DIE SIEDLUNG FIEL...          ║");
        Console.WriteLine("  ║                                                          ║");
        Console.WriteLine($"  ║          Die Siedlung überlebte {state.Runde,3} Runden.              ║");
        Console.WriteLine("  ║                                                          ║");
        Console.WriteLine("  ╚══════════════════════════════════════════════════════════╝");
        Console.ResetColor();

        Console.WriteLine("\n  Drücke [Enter] um das Spiel zu beenden...");
        Console.ReadLine();
    }
}
