using PocketSim.Data;
using PocketSim.Models;
using PocketSim;
using System.Threading;

namespace PocketSim.UI;

// ============================================================
//  BAU-MENÜ
//  Zeigt alle Gebäude gruppiert nach Forschungsanforderung.
//  Grün = baubar, Rot = Ressourcen fehlen, Grau = gesperrt.
// ============================================================
public static class BuildScreen
{
    public static void Show(GameState state)
    {
        Console.Clear();
        Renderer.PrintHeader("🏗️  GEBÄUDE BAUEN", ConsoleColor.Green);

        // Gebäude nach Forschungsanforderung gruppieren
        // "Immer verfügbar" kommt zuerst, dann nach Forschungs-ID sortiert
        var gruppen = BuildingCatalog.Alle
            .GroupBy(b => b.ErfordertForschungId ?? "")
            .OrderBy(g => g.Key == "" ? "!" : g.Key);  // "" (immer) kommt vor allem anderen

        // Nummerierungsliste der tatsächlich baubaren Gebäude
        var wählbar = new List<BuildingDef>();

        foreach (var gruppe in gruppen)
        {
            string forschungsId  = gruppe.Key;
            bool gruppeErforscht = state.Forschung.IsBaubar(forschungsId.Length == 0 ? null : forschungsId);

            // Gruppenüberschrift
            string gruppenTitel = forschungsId.Length == 0
                ? "✅  IMMER VERFÜGBAR"
                : gruppeErforscht
                    ? $"✅  {ResearchCatalog.NameFürId(forschungsId).ToUpper()}"
                    : $"🔒  {ResearchCatalog.NameFürId(forschungsId).ToUpper()} (noch nicht erforscht)";

            Console.ForegroundColor = gruppeErforscht ? ConsoleColor.White : ConsoleColor.DarkGray;
            Console.WriteLine($"\n  ─── {gruppenTitel}");
            Console.ResetColor();

            foreach (var def in gruppe)
            {
                bool entsperrt  = state.Forschung.IsBaubar(def.ErfordertForschungId);
                bool leistbar   = state.Lager.CanAfford(def.Baukosten);

                if (!entsperrt)
                {
                    // Gesperrtes Gebäude – grau anzeigen
                    Console.ForegroundColor = ConsoleColor.DarkGray;
                    Console.WriteLine($"  [🔒]  {def.Icon} {def.Name,-18} – Forschung benötigt");
                    Console.ResetColor();
                    continue;
                }

                // Entsperrtes Gebäude nummerieren und anzeigen
                wählbar.Add(def);
                int nummer = wählbar.Count;
                string kosten = Renderer.FormatResources(def.Baukosten);

                Console.ForegroundColor = leistbar ? ConsoleColor.Green : ConsoleColor.DarkRed;
                Console.WriteLine($"  [{nummer,2}]  {def.Icon} {def.Name,-18}  Kosten: {kosten}");

                // Einzeilige Beschreibung + Verbrauch/Produktion
                Console.ForegroundColor = ConsoleColor.DarkGray;
                string prod = def.Einmalig
                    ? "(einmalige Wirkung)"
                    : $"→ {Renderer.FormatResources(def.Produktion)} alle {def.ProduktionIntervall} Runde(n)";
                string vbr = def.Verbrauch.Any()
                    ? $"  verbraucht: {Renderer.FormatResources(def.Verbrauch)}"
                    : "";
                Console.WriteLine($"       {def.Beschreibung}   {prod}{vbr}");
                Console.ResetColor();
            }
        }

        Console.WriteLine();
        Renderer.PrintDivider();
        Console.ForegroundColor = ConsoleColor.DarkGray;
        Console.WriteLine("  Grün = leistbar  |  Rot = Ressourcen fehlen  |  [0] Abbrechen");
        Console.ResetColor();
        Console.Write("\n  Nummer eingeben: > ");

        // Eingabe verarbeiten
        string input = Console.ReadLine() ?? "0";
        if (int.TryParse(input, out int wahl) && wahl >= 1 && wahl <= wählbar.Count)
        {
            var def = wählbar[wahl - 1];
            if (state.BaueGebäude(def))
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine($"\n  ✅ {def.Icon} {def.Name} erfolgreich gebaut!");
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("\n  ❌ Bau fehlgeschlagen! Ressourcen oder Forschung fehlt.");
            }
            Console.ResetColor();
            Thread.Sleep(900);
        }
    }
}
