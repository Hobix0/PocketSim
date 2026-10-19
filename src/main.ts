import './ui/style.css';
import { Game } from './core/Game';
import { hasData } from './core/Data';

// Einstiegspunkt: Spiel erzeugen und starten.
// Das Level kommt aus der Adresse, z. B. …/#musterschau oder …/#testgelaende; ohne Angabe der kleine Start-Laden.
const wanted = location.hash.replace(/^#/, '');
const levelId = wanted && hasData(`level/${wanted}`) ? wanted : 'start';
// Darstellung: …?stil=lowpoly zeigt die Original-Modelle, …?stil=voxel die Würfel (Standard aus data/voxel)
const stil = new URLSearchParams(location.search).get('stil');
const game = new Game(document.getElementById('app')!, levelId, { stil: stil === 'voxel' || stil === 'lowpoly' ? stil : undefined });
game.start();

// Im Entwicklungsmodus ist das Spiel in der Browser-Konsole als "urbanEvolution" erreichbar.
if (import.meta.env.DEV) (window as unknown as { urbanEvolution: Game }).urbanEvolution = game;
