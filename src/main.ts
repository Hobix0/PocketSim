import './ui/style.css';
import { Game } from './core/Game';

// Einstiegspunkt: Spiel erzeugen und starten.
const game = new Game(document.getElementById('app')!, 'testgelaende');
game.start();

// Im Entwicklungsmodus ist das Spiel in der Browser-Konsole als "urbanEvolution" erreichbar.
if (import.meta.env.DEV) (window as unknown as { urbanEvolution: Game }).urbanEvolution = game;
