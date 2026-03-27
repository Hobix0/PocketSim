using PocketSim.Models;

namespace PocketSim.Systems;

// ============================================================
//  BEVÖLKERUNGSSYSTEM
//  Simuliert die Einwohner der Siedlung.
//
//  Spielmechanik:
//  - Bevölkerung braucht Nahrung (Brot oder Fisch) pro Runde
//  - Genug Nahrung → Zufriedenheit steigt → Wachstum
//  - Hunger → Zufriedenheit sinkt → Schrumpfung
//  - Maximum steigt durch Steinhäuser
//  - Bei 0 Einwohnern → Niederlage!
// ============================================================
public class PopulationSystem
{
    public int Aktuell  { get; private set; } = 10;
    public int Maximum  { get; private set; } = 15;

    // Zufriedenheit: -5 (hungrig) bis +5 (glücklich)
    // Wächst bei ausreichend Nahrung, sinkt bei Hunger
    private int _zufriedenheit = 0;

    // ── Externe Effekte ───────────────────────────────────────

    // Wird aufgerufen wenn ein Steinhaus gebaut wird
    public void ErhöheMaximum(int um) => Maximum += um;

    // Ereignis: Epidemie / Hungersnot → direkte Bevölkerungsminderung
    public void Erkrankung(int anzahl)
        => Aktuell = Math.Max(1, Aktuell - anzahl);

    // Ereignis: Einwanderer kommen → direktes Wachstum (bis Maximum)
    public void Einwanderer(int anzahl)
        => Aktuell = Math.Min(Maximum, Aktuell + anzahl);

    // ── Hauptlogik (einmal pro Runde) ─────────────────────────

    // Füttert die Bevölkerung und berechnet Wachstum/Schrumpfung.
    // Gibt das Nahrungsdefizit zurück (0 = alle satt, >0 = Hunger).
    public int FütternUndWachsen(ResourceStore lager)
    {
        // Nahrungsbedarf: 1 Einheit pro 5 Einwohner (aufgerundet)
        int bedarf = (int)Math.Ceiling(Aktuell / 5.0);

        // Erst Brot verbrauchen, dann Fisch (falls Brot nicht reicht)
        int restBedarf = bedarf;

        int brot = Math.Min(lager.Get(ResourceType.Brot), restBedarf);
        lager.Remove(ResourceType.Brot, brot);
        restBedarf -= brot;

        int fisch = Math.Min(lager.Get(ResourceType.Fisch), restBedarf);
        lager.Remove(ResourceType.Fisch, fisch);
        restBedarf -= fisch;

        int defizit = restBedarf;  // 0 = alle satt, >0 = Hunger

        if (defizit == 0)
        {
            // Alle satt → Zufriedenheit steigt
            _zufriedenheit = Math.Min(_zufriedenheit + 1, 5);

            // Bei maximaler Zufriedenheit und freiem Platz: wachsen!
            if (_zufriedenheit >= 5 && Aktuell < Maximum)
            {
                Aktuell++;
                _zufriedenheit = 0;  // Reset: nächste Wachstumsphase beginnt
            }
        }
        else
        {
            // Hunger → Zufriedenheit sinkt deutlich
            _zufriedenheit = Math.Max(_zufriedenheit - 2, -5);

            // Bei maximaler Unzufriedenheit: Einwohner ziehen weg
            if (_zufriedenheit <= -5 && Aktuell > 1)
            {
                Aktuell = Math.Max(1, Aktuell - 1);
                _zufriedenheit = -2;  // Teilweiser Reset
            }
        }

        return defizit;
    }

    // Emoji-Stimmungsanzeige für die UI
    public string StimmungsSymbol() => _zufriedenheit switch
    {
        >= 4  => "😄",
        >= 2  => "🙂",
        >= 0  => "😐",
        >= -3 => "😟",
        _     => "😡"
    };

    // Textuelle Beschreibung der Stimmung
    public string StimmungsText() => _zufriedenheit switch
    {
        >= 4  => "Fröhlich",
        >= 2  => "Zufrieden",
        >= 0  => "Neutral",
        >= -3 => "Unzufrieden",
        _     => "Am Verhungern!"
    };
}
