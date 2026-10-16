import './ui/style.css';
import { Game } from './core/Game';
import { hasData } from './core/Data';

// Einstiegspunkt: Spiel erzeugen und starten.
// Das Level kommt aus der Adresse, z. B. …/#musterschau; ohne Angabe das Testgelände.
const wanted = location.hash.replace(/^#/, '');
const levelId = wanted && hasData(`level/${wanted}`) ? wanted : 'testgelaende';
const game = new Game(document.getElementById('app')!, levelId);
game.start();

// Im Entwicklungsmodus ist das Spiel in der Browser-Konsole als "urbanEvolution" erreichbar.
if (import.meta.env.DEV) (window as unknown as { urbanEvolution: Game }).urbanEvolution = game;
