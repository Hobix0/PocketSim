import './ui/style.css';
import { Game, savedStil } from './core/Game';
import { takeStartRequest } from './save/SaveSlots';
import { VoxelEditor } from './editor/VoxelEditor';
import { hasData, readData } from './core/Data';
import { validateSave, type SaveData } from './save/SaveGame';

// Einstiegspunkt: Spiel erzeugen und starten.
// Das Level kommt aus der Adresse, z. B. …/#musterschau oder …/#testgelaende; ohne Angabe der kleine Start-Laden.
// …/#testmarkt lädt den großen Testmarkt (ein mitgelieferter Spielstand, data/spielstaende/testmarkt.json).
const wanted = location.hash.replace(/^#/, '');
// Wunsch vom letzten Neuladen: neues Spiel oder Spielstand laden (sonst startet das Hauptmenü)
const request = takeStartRequest();
const testmarkt = wanted === 'testmarkt' && hasData('spielstaende/testmarkt') ? validateSave(readData<SaveData>('spielstaende/testmarkt')) : null;
const save = request?.aktion === 'laden' ? request.daten : testmarkt;
const levelId = save && hasData(`level/${save.level}`) ? save.level : wanted && hasData(`level/${wanted}`) ? wanted : 'start';
// …/#editor öffnet den Voxel-Editor statt des Spiels
if (wanted === 'editor') {
  const editor = new VoxelEditor(document.getElementById('app')!);
  editor.start();
  if (import.meta.env.DEV) (window as unknown as { voxelEditor: VoxelEditor }).voxelEditor = editor;
} else {
  // Darstellung: …?stil=lowpoly zeigt die Original-Modelle, …?stil=voxel die Würfel (Standard aus data/voxel)
  const param = new URLSearchParams(location.search).get('stil');
  const stil = param === 'voxel' || param === 'lowpoly' ? param : savedStil();
  // Ein anderes Level aus der Adresse (#testgelaende) startet direkt ohne Menü
  const menu = !request && !testmarkt && !(wanted && hasData(`level/${wanted}`));
  const game = new Game(document.getElementById('app')!, levelId, { stil, save, menu });
  game.start();
  // Im Entwicklungsmodus ist das Spiel in der Browser-Konsole als "urbanEvolution" erreichbar.
  if (import.meta.env.DEV) (window as unknown as { urbanEvolution: Game }).urbanEvolution = game;
}
