using PocketSim;
using PocketSim.UI;
using PocketSim.Models;

// ============================================================
//  EINSTIEGSPUNKT – HAUPTSCHLEIFE
//
//  Das klassische Game-Loop-Muster:
//    1. Zustand anzeigen
//    2. Auf Eingabe warten
//    3. Eingabe verarbeiten
//    4. Wiederholen bis Ende
// ============================================================

// Encoding aktivieren damit Emojis und Box-Zeichen korrekt angezeigt werden
Console.OutputEncoding = System.Text.Encoding.UTF8;
Console.Title = "PocketSim";

// Spielstand erstellen – alle Systeme starten hier
var state = new GameState();
state.AddLog("🏰 Willkommen in PocketSim! Baue eine Burg oder sammle 25 Gold um zu siegen.");
state.AddLog("📌 Tipp: Starte mit [f] eine Forschung und dann mit [b] dein erstes Gebäude.");

// ── HAUPTSCHLEIFE ─────────────────────────────────────────────────────────────
bool läuft = true;
while (läuft && !state.Gewonnen && !state.Verloren)
{
    // Hauptbildschirm zeichnen
    MainScreen.Draw(state);

    // Eingabe lesen (ReadLine wird direkt nach DrawMenu() aufgerufen)
    // MainScreen.Draw() endet mit Console.Write("> ") – kein zweites Prompt nötig
    string eingabe = Console.ReadLine()?.Trim().ToLower() ?? "";

    // Eingabe auswerten
    switch (eingabe)
    {
        case "":   // [Enter] = nächste Runde
            state.NextRound();
            break;

        case "b":  // [b] = Baumenü
            BuildScreen.Show(state);
            break;

        case "f":  // [f] = Forschungsmenü
            ResearchScreen.Show(state);
            break;

        case "l":  // [l] = Chronik/Log
            LogScreen.Show(state);
            break;

        case "q":  // [q] = Beenden
            läuft = false;
            break;

        // Alle anderen Eingaben werden ignoriert (kein Absturz)
    }
}

// ── SPIELENDE ────────────────────────────────────────────────
if (state.Gewonnen)
    EndScreen.ShowVictory(state);
else if (state.Verloren)
    EndScreen.ShowDefeat(state);
else
{
    // Manuell beendet
    Console.Clear();
    Console.ForegroundColor = ConsoleColor.Yellow;
    Console.WriteLine($"\n  Spiel beendet nach {state.Runde} Runden. Bis zum nächsten Mal! 👋\n");
    Console.ResetColor();
}
