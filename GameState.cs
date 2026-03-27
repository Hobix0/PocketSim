using PocketSim.Models;
using PocketSim.Data;
using PocketSim.Systems;

namespace PocketSim;

// ============================================================
//  SPIELSTAND
//  Das zentrale Datenobjekt – enthält den kompletten Spielzustand.
//  Wird durch die ganze Anwendung herumgereicht.
//
//  Zuständigkeit: Spiellogik koordinieren (wer produziert wann?
//  wann ist Forschung fertig? usw.) – NICHT für Anzeige zuständig.
// ============================================================
public class GameState
{
    // ── Kernkomponenten ──────────────────────────────────────
    public int                    Runde       { get; private set; } = 0;
    public ResourceStore          Lager       { get; } = new();
    public List<BuildingInstance> Gebäude     { get; } = new();
    public ResearchSystem         Forschung   { get; } = new();
    public PopulationSystem       Bevölkerung { get; } = new();
    public List<string>           Log         { get; } = new();

    // Letztes Ereignis dieser Runde (null wenn keins ausgelöst)
    public GameEvent? LetzteEreignis { get; private set; }

    // Spielende-Flags
    public bool Gewonnen { get; private set; } = false;
    public bool Verloren { get; private set; } = false;

    // Ziele für die Sieganzeige
    public const int GoldZiel = 25;

    // ── Log ──────────────────────────────────────────────────

    // Schreibt eine Nachricht ins Spielprotokoll (mit Rundennummer)
    public void AddLog(string msg) => Log.Add($"[{Runde:D3}] {msg}");

    // ── HAUPTRUNDE ────────────────────────────────────────────
    // Das Herzstück: verarbeitet eine komplette Spielrunde.
    // Reihenfolge ist wichtig – Produktion vor Forschung vor Ereignis.
    public void NextRound()
    {
        Runde++;
        LetzteEreignis = null;

        // ── 1. Gebäude produzieren ────────────────────────────
        int produziert   = 0;
        int stillstehend = 0;
        bool laborAktiv  = false;

        foreach (var b in Gebäude)
        {
            bool ok = b.TryProduce(Lager);

            // Labor: löst Forschungsbeschleunigung aus (alle 3 Runden)
            if (b.Def.Name == "Labor" && ok)
                laborAktiv = true;

            // Statistik nur bei Gebäuden die diese Runde "dran" waren
            if (!b.Def.Einmalig && b.Runden % b.Def.ProduktionIntervall == 0)
            {
                if (ok)           produziert++;
                else if (b.Aktiv) stillstehend++;
            }
        }

        if (produziert > 0 || stillstehend > 0)
            AddLog($"🏗️  Produktion: {produziert} aktiv" +
                   (stillstehend > 0 ? $", {stillstehend} stillstehend (Rohstoffmangel)" : ""));

        // ── 2. Forschung voranschreiten ───────────────────────
        if (laborAktiv)
            Forschung.Beschleunigen();  // Labor gibt -1 Runde Bonus

        var fertigeForschung = Forschung.Fortschritt();
        if (fertigeForschung != null)
            AddLog($"🎉 Forschung abgeschlossen: {fertigeForschung.Icon} {fertigeForschung.Name}!");

        // ── 3. Bevölkerung ernähren ───────────────────────────
        int defizit = Bevölkerung.FütternUndWachsen(Lager);
        if (defizit > 0)
            AddLog($"⚠️  Nahrungsmangel! Fehlt: {defizit} Einheit(en). Bevölkerung hungert.");

        // ── 4. Zufallsereignis ────────────────────────────────
        // EventSystem.VersucheTrigger() hat ~22% Chance ein Ereignis zurückzugeben
        var ereignis = EventSystem.VersucheTrigger();
        if (ereignis != null)
        {
            // "?.Invoke(this)" = Delegat aufrufen, falls nicht null
            // "this" = der GameState selbst wird dem Ereignis übergeben
            ereignis.Anwenden?.Invoke(this);
            LetzteEreignis = ereignis;
            AddLog($"{ereignis.Icon} Ereignis: {ereignis.Titel} – {ereignis.Beschreibung}");
        }

        // ── 5. Siegbedingungen prüfen ─────────────────────────
        // Sieg 1: Burg gebaut
        if (Gebäude.Any(b => b.Def.Name == "Burg"))
        {
            Gewonnen = true;
            AddLog("🏆 SIEG! Die Burg steht – du hast das Spiel gewonnen!");
        }
        // Sieg 2: 25 Gold gesammelt
        if (Lager.Get(ResourceType.Gold) >= GoldZiel)
        {
            Gewonnen = true;
            AddLog($"🏆 SIEG! {GoldZiel} Gold erreicht – du hast das Spiel gewonnen!");
        }
        // Niederlage: keine Einwohner mehr
        if (Bevölkerung.Aktuell <= 0)
        {
            Verloren = true;
            AddLog("💀 NIEDERLAGE! Die letzte Seele hat die Siedlung verlassen.");
        }
    }

    // ── GEBÄUDE BAUEN ─────────────────────────────────────────
    // Prüft alle Bedingungen, zieht Kosten ab und fügt das Gebäude hinzu.
    // Gibt false zurück wenn etwas nicht stimmt.
    public bool BaueGebäude(BuildingDef def)
    {
        // Voraussetzungsprüfungen
        if (!Forschung.IsBaubar(def.ErfordertForschungId)) return false;
        if (!Lager.CanAfford(def.Baukosten)) return false;

        Lager.Pay(def.Baukosten);

        var instance = new BuildingInstance(def);
        Gebäude.Add(instance);

        // Einmalige Effekte sofort beim Bau anwenden
        if (def.BevölkerungskapazitätBonus > 0)
            Bevölkerung.ErhöheMaximum(def.BevölkerungskapazitätBonus);

        AddLog($"🏗️  {def.Icon} {def.Name} wurde gebaut!");
        return true;
    }

    // ── FORSCHUNG STARTEN ────────────────────────────────────
    public bool StarteForschung(ResearchDef def)
    {
        if (!Forschung.StarteForschung(def, Lager)) return false;
        AddLog($"🔬 Forschung gestartet: {def.Icon} {def.Name} ({def.Dauer} Runden)");
        return true;
    }
}
