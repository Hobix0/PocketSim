using PocketSim.Models;

namespace PocketSim.UI;

// ============================================================
//  RENDERER – Gemeinsame UI-Hilfsmethoden
//  Alle Screens nutzen diese Klasse für einheitliches Aussehen.
//  Zentralisierung: Farben/Stile nur hier ändern → überall wirksam.
// ============================================================
public static class Renderer
{
    // Emoji für jede Ressource – NEU: hier eintragen
    private static readonly Dictionary<ResourceType, string> _emojis = new()
    {
        [ResourceType.Holz]     = "🪵",
        [ResourceType.Stein]    = "🪨",
        [ResourceType.Getreide] = "🌾",
        [ResourceType.Mehl]     = "🌫️",
        [ResourceType.Brot]     = "🍞",
        [ResourceType.Fisch]    = "🐟",
        [ResourceType.Eisen]    = "🔩",
        [ResourceType.Kohle]    = "🖤",
        [ResourceType.Werkzeug] = "🔧",
        [ResourceType.Gold]     = "💰",
        [ResourceType.Wasser]   = "💧",
    };

    // Gibt das Emoji für eine Ressource zurück
    public static string Emoji(ResourceType r)
        => _emojis.TryGetValue(r, out var e) ? e : "?";

    // Konvertiert ein Ressourcen-Dictionary in lesbaren Text
    // Beispiel: { Holz: 5, Stein: 3 } → "🪵5  🪨3"
    public static string FormatResources(Dictionary<ResourceType, int> res)
        => res.Any()
            ? string.Join("  ", res.Select(kv => $"{Emoji(kv.Key)}{kv.Value}"))
            : "(keine)";

    // ── Fortschrittsbalken ────────────────────────────────────
    // Beispiel: ProgressBar(3, 5, 10) → "██████░░░░"
    public static string ProgressBar(double current, double max, int width = 20)
    {
        if (max <= 0) return new string('░', width);
        int filled = (int)Math.Round(current / max * width);
        filled = Math.Clamp(filled, 0, width);
        return new string('█', filled) + new string('░', width - filled);
    }

    // ── Box / Rahmen ──────────────────────────────────────────

    // Großer Titelrahmen (für Hauptscreen und Unterseiten)
    public static void PrintHeader(string title, ConsoleColor color = ConsoleColor.Yellow)
    {
        int w = 62;
        Console.ForegroundColor = color;
        Console.WriteLine("╔" + new string('═', w) + "╗");
        // Text zentrieren
        int pad = (w - title.Length) / 2;
        string centered = title.PadLeft(pad + title.Length).PadRight(w);
        Console.WriteLine("║" + centered + "║");
        Console.WriteLine("╚" + new string('═', w) + "╝");
        Console.ResetColor();
    }

    // Abschnittsüberschrift (z.B. "── LAGER ──────────────────")
    public static void PrintSection(string title, ConsoleColor color = ConsoleColor.Cyan)
    {
        int dashCount = Math.Max(0, 52 - title.Length);
        Console.ForegroundColor = color;
        Console.WriteLine($"\n  ── {title} {new string('─', dashCount)}");
        Console.ResetColor();
    }

    // Farbigen Text ausgeben (ohne Zeilenumbruch)
    public static void PrintColored(string text, ConsoleColor color)
    {
        Console.ForegroundColor = color;
        Console.Write(text);
        Console.ResetColor();
    }

    // Farbige Zeile ausgeben (mit Zeilenumbruch)
    public static void PrintLine(string text, ConsoleColor color)
    {
        Console.ForegroundColor = color;
        Console.WriteLine(text);
        Console.ResetColor();
    }

    // Horizontale Trennlinie
    public static void PrintDivider()
    {
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine("  " + new string('─', 60));
        Console.ResetColor();
    }

    // Eingabeaufforderung
    public static string Prompt(string text = "> ")
    {
        Console.ForegroundColor = ConsoleColor.White;
        Console.Write($"\n  {text}");
        Console.ResetColor();
        return Console.ReadLine()?.Trim().ToLower() ?? "";
    }
}
