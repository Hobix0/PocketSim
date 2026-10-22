import * as THREE from 'three';
import { hasData, readData } from './Data';
import { InputMap, type Bindings } from '../input/InputMap';
import { Pointer } from '../input/Pointer';
import { ManagementCamera, type CameraSettings } from '../camera/ManagementCamera';
import { Level, expandObjects, type LevelData } from '../world/Level';
import { ModelLibrary, type VoxelSettings } from '../assets/ModelLibrary';
import { GridCursor } from '../world/GridCursor';
import { Content } from '../content/Content';
import { World } from '../ecs/World';
import type { Entity } from '../ecs/Entity';
import { createBuildEntity } from '../factory/createBuildEntity';
import { createProductEntity } from '../factory/createProductEntity';
import { createWorkerEntity, staffStatus } from '../factory/createWorkerEntity';
import type { FactoryContext, GameActions } from '../factory/FactoryContext';
import { Selection } from '../interaction/Selection';
import { Interactor } from '../interaction/Interactor';
import { Hand } from '../interaction/Hand';
import { PlayerState, type LevelTable, type PlayerStart } from '../state/PlayerState';
import { GameClock, type ClockSettings } from '../state/GameClock';
import { Purchasing } from '../economy/Purchasing';
import { Staff, type Employee } from '../economy/Staff';
import { stockFromCarton } from '../economy/Stocking';
import { StoreLoop } from './StoreLoop';
import { Goals } from '../state/Goals';
import type { GoalDef } from '../content/definitions';
import { CartonStorage } from '../world/CartonStorage';
import { BuildController } from '../building/BuildController';
import { CartonComponent } from '../components/CartonComponent';
import { ShelfComponent } from '../components/ShelfComponent';
import { CheckoutComponent } from '../components/CheckoutComponent';
import { Hud } from '../ui/Hud';
import { DebugPanel } from '../ui/DebugPanel';
import { ContextHint } from '../ui/ContextHint';
import { InfoPanel } from '../ui/InfoPanel';
import { PurchaseWindow } from '../ui/PurchaseWindow';
import { BuildMenu } from '../ui/BuildMenu';
import { PersonalWindow } from '../ui/PersonalWindow';
import { ReportWindow } from '../ui/ReportWindow';
import { GoalPanel } from '../ui/GoalPanel';
import { esc } from '../ui/html';
import { registerCustomModels } from '../editor/ModelStore';
import { formatMoney } from '../ui/format';
import { PriceBook } from '../economy/Prices';
import { SAVE_VERSION, applyWorld, collectWorld, type SaveData } from '../save/SaveGame';
import { downloadSave, newestSlot, readSaveFile, readSlot, restartWith, writeSlot, type SlotId } from '../save/SaveSlots';
import { GameMenu } from '../ui/GameMenu';
import { AssortmentWindow } from '../ui/AssortmentWindow';
import { StatsWindow } from '../ui/StatsWindow';
import { Plots } from '../world/Plots';
import { Utilities } from '../economy/Utilities';
import { Production } from '../economy/Production';
import { MachineComponent } from '../components/MachineComponent';
import { ShelfWindow } from '../ui/ShelfWindow';
import { BuyerSystem } from '../world/BuyerSystem';
import { Effects } from '../fx/Effects';
import { Ambience, type AmbienceSettings } from '../world/Ambience';
import { CozyLook, type CozyLookSettings } from '../render/CozyLook';
import { AudioSystem, type AudioSettings } from '../audio/AudioSystem';
import { TruckComponent } from '../components/TruckComponent';
import { MachineWindow } from '../ui/MachineWindow';
import { UtilityWindow } from '../ui/UtilityWindow';
import { Deliveries, type DeliveriesState, type ShipmentLine } from '../economy/Deliveries';
import { TruckFleet } from '../world/TruckFleet';
import { place } from '../world/CartonStorage';
import { StorageSurfaceComponent } from '../components/StorageSurfaceComponent';
import { LogisticsWindow } from '../ui/LogisticsWindow';
import { LampLights } from '../world/LampLights';
import { daylight } from '../world/DayCycle';
import { RoofLayer } from '../world/RoofLayer';
import { Terrain } from '../world/Terrain';
import { TerrainView } from '../world/TerrainView';
import { TerrainCutComponent } from '../components/TerrainCutComponent';
import { TerrainTool } from '../building/TerrainTool';
import { PaintLayer } from '../world/PaintLayer';
import { PaintTool } from '../building/PaintTool';
import { FootprintComponent, type Rect } from '../components/FootprintComponent';

/** Wie das Spiel startet */
export interface GameOptions {
  stil?: 'voxel' | 'lowpoly';
  /** Spielstand laden statt mit dem Level-Aufbau zu beginnen */
  save?: SaveData | null;
  /** Mit dem Hauptmenü beginnen (Spiel steht dahinter still) */
  menu?: boolean;
}

const STIL_KEY = 'urbanevolution.stil';

/** Gespeicherte Darstellung (Voxel oder Low-Poly) */
export function savedStil(): 'voxel' | 'lowpoly' | undefined {
  try { const s = localStorage.getItem(STIL_KEY); return s === 'voxel' || s === 'lowpoly' ? s : undefined; } catch { return undefined; }
}

// Zentrale Spielklasse: Renderer, Szene, Spielschleife.
// Sie verbindet die Systeme, enthält aber selbst keine Spiellogik.

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly content: Content;
  readonly models: ModelLibrary;
  readonly world: World;
  readonly input: InputMap;
  readonly pointer = new Pointer();
  readonly level: Level;
  readonly view: ManagementCamera;
  readonly cursor: GridCursor;
  readonly selection = new Selection();
  readonly interactor: Interactor;
  /** Was der Spieler gerade trägt (gehört zum Spieler, nicht zur Welt) */
  readonly hand = new Hand();
  /** Spielerwerte (Geld, XP, Level) – getrennt von jeder Darstellung. */
  readonly player: PlayerState;
  readonly clock: GameClock;
  readonly hud: Hud;
  readonly debug: DebugPanel;
  readonly contextHint: ContextHint;
  readonly info: InfoPanel;
  /** Was die Fabriken zum Bauen von Entities brauchen. */
  readonly factory: FactoryContext;
  readonly storage: CartonStorage;
  readonly purchasing: Purchasing;
  /** Einkäufer: Nachbestellen, was einmal im Regal stand */
  readonly buyers: BuyerSystem;
  /** Partikel, schwebende Texte und Bewegungen (data/effekte) */
  readonly effects: Effects;
  /** Leben in der Welt: Passanten, Autos, Tauben, Schmetterlinge, Wolken (data/leben) */
  readonly ambience: Ambience;
  private nacht = 0;
  /** Nachbearbeitung: Bloom, Miniatur-Unschärfe, Vignette (data/kamera → look) */
  readonly look: CozyLook;
  /** Töne und Musik (data/audio) */
  readonly audio: AudioSystem;
  private smokeTimer = 0;
  readonly purchaseWindow: PurchaseWindow;
  readonly staff: Staff;
  readonly personalWindow: PersonalWindow;
  readonly build: BuildController;
  readonly buildMenu: BuildMenu;
  /** Ladenbetrieb: Kunden, Kassen, Wegfindung, Ruf */
  readonly store: StoreLoop;
  readonly goals: Goals;
  readonly report: ReportWindow;
  /** Eigene Verkaufspreise */
  readonly prices: PriceBook;
  readonly menu: GameMenu;
  readonly assortment: AssortmentWindow;
  readonly statsWindow: StatsWindow;
  /** Grundstücke: wo gebaut werden darf */
  readonly plots: Plots;
  /** Strom und Wasser */
  readonly utilities: Utilities;
  /** Maschinen, Rezepte, Rohstoffe */
  readonly production: Production;
  readonly machineWindow: MachineWindow;
  readonly shelfWindow: ShelfWindow;
  readonly utilityWindow: UtilityWindow;
  /** Lieferungen per LKW (null, wenn das Level keine Anlieferung hat – dann kommt Ware sofort) */
  readonly deliveries: Deliveries | null;
  readonly fleet: TruckFleet | null;
  readonly logisticsWindow: LogisticsWindow;
  private readonly refreshTerrainCuts: () => void;
  /** Angestellte (id) → ihre Spielfigur */
  private readonly workers = new Map<number, Entity>();
  /** Lief die Uhr, bevor das Menü aufging? */
  private resumeAfterMenu = false;

  private readonly timer = new THREE.Timer();
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly lampLights: LampLights;
  /** Dach über den Innenräumen (herausgezoomt sichtbar, Taste „Dach“ blendet aus) */
  private readonly roof: RoofLayer | null;
  /** Gelände (Höhenfeld) und seine Darstellung */
  readonly terrain: Terrain;
  private readonly terrainView: TerrainView;
  readonly terrainTool: TerrainTool;
  /** Bodenmarkierungen: Malschicht und Mal-Werkzeug */
  readonly paint: PaintLayer;
  readonly paintTool: PaintTool;
  private paintFloors: { minX: number; maxX: number; minZ: number; maxZ: number; top: number }[] = [];
  /** Gebautes (für das Gelände-Werkzeug: darunter wird nichts verändert) */
  private builtRects: Rect[] = [];
  private terrainVersion = -1;
  /** Farben für Tag und Nacht (Himmel, Sonne) */
  private readonly sky: { tag: THREE.Color; nacht: THREE.Color; daemmerung: THREE.Color; sonne: THREE.Color; sonneNacht: THREE.Color; sonneDaemmerung: THREE.Color };

  constructor(container: HTMLElement, readonly levelId: string, private readonly options: GameOptions = {}) {
    // Inhalte zuerst: Fehler in den Daten sollen sofort auffallen
    this.content = new Content();

    // Modelle: Voxel-Stil laut Daten, die Adresse kann ihn ein- oder ausschalten
    const voxel = readData<VoxelSettings>('voxel/standard');
    this.models = new ModelLibrary({ ...voxel, aktiv: options.stil ? options.stil === 'voxel' : voxel.aktiv });
    // Eigene Modelle aus dem Voxel-Editor (data/modelle und Browser-Speicher) ins Baumenü „Eigene“
    registerCustomModels(this.content, this.models);

    // Spielzustand ohne Darstellung (Koop-tauglich)
    this.player = new PlayerState('lokal', readData<PlayerStart>('spieler/start'), readData<LevelTable>('spieler/level'));
    this.clock = new GameClock(readData<ClockSettings>('zeit/standard'));
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#5fd08a';
    const danger = css.getPropertyValue('--danger').trim() || '#f08a7a';

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.content.licht.stimmung.belichtung;
    container.append(this.renderer.domElement);
    const surface = this.renderer.domElement;

    // Eingabe
    this.input = new InputMap(readData<Bindings>('eingabe/standard'));
    this.input.attach(surface);
    this.pointer.attach(surface);

    // Kulisse
    this.level = new Level(readData<LevelData>(`level/${levelId}`));
    this.scene.add(this.level.root);
    // Gelände: verformbares Höhenfeld unter dem ganzen Level
    this.terrain = new Terrain(this.level.bounds, this.content.gelaende.zelle, this.content.gelaende.maxHoehe, this.content.gelaende.stufe);
    this.terrainView = new TerrainView(this.level.ground, this.terrain, this.level.data.boden.farbe, this.content.gelaende.erde);
    this.scene.background = new THREE.Color(this.level.data.himmel);

    // Welt mit allen Entities, gefüllt aus den Objekten des Levels
    const entities = new THREE.Group();
    entities.name = 'Entities';
    this.scene.add(entities);
    this.world = new World(entities);
    // Absenkungen durch Bauteile (Rampenabfahrt) folgen der Welt
    const cuts = () => this.terrain.setCuts([...this.world.query(TerrainCutComponent)].map(([, c]) => c.cut()));
    this.world.events.on('added', (e) => { if (e.get(TerrainCutComponent)) cuts(); });
    this.world.events.on('removed', (e) => { if (e.get(TerrainCutComponent)) cuts(); });
    this.refreshTerrainCuts = cuts;

    // Licht: Himmel/Boden-Licht plus Sonne mit Schatten über das ganze Gelände
    // Warmes Licht von oben und vom Boden – gemütlicher Grundton
    const stimmung = this.content.licht.stimmung;
    this.ambient = new THREE.HemisphereLight(stimmung.himmelLicht, stimmung.bodenLicht, 1.4);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(stimmung.sonne, 2.4);
    this.sun.position.set(18, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const b = this.level.bounds;
    const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 100 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.radius = stimmung.schattenWeich;
    // Leichter Dunst in der Ferne (Farbe folgt dem Himmel)
    this.scene.fog = new THREE.Fog(this.level.data.himmel, stimmung.nebel.nah, stimmung.nebel.fern);
    this.scene.add(this.sun);
    const licht = this.content.licht;
    this.sky = {
      tag: new THREE.Color(this.level.data.himmel), nacht: new THREE.Color(licht.nacht.himmel), daemmerung: new THREE.Color(licht.daemmerung.himmel),
      sonne: new THREE.Color(licht.stimmung.sonne), sonneNacht: new THREE.Color(licht.nacht.sonnenfarbe), sonneDaemmerung: new THREE.Color(licht.daemmerung.sonnenfarbe),
    };
    // Lampen: feste Zahl echter Lichtquellen für die Lampen nahe der Kamera
    this.lampLights = new LampLights(this.scene, this.world, licht.lampen.anzahl, licht.lampen.buendeln);
    const dach = this.content.baumenue.dach;
    this.roof = dach ? new RoofLayer(this.scene, this.world, { hoehe: this.content.baumenue.deckenhoehe, ...dach }) : null;

    // Kamera
    const start = new THREE.Vector3(...this.level.data.kameraStart);
    const kamera = readData<CameraSettings & { look: CozyLookSettings }>('kamera/standard');
    this.view = new ManagementCamera(kamera, this.input, this.level.bounds, start);
    this.look = new CozyLook(this.renderer, this.scene, this.view.camera, { ...kamera.look });
    this.audio = new AudioSystem(readData<AudioSettings>('audio/standard'));
    try {
      const get = (k: string) => localStorage.getItem(`urbanevolution.${k}`);
      if (get('look') !== null) this.look.an = get('look') === '1';
      if (get('musik') !== null) this.audio.setMusik(Number(get('musik')));
      if (get('toene') !== null) this.audio.setToene(Number(get('toene')));
    } catch { /* ohne Speicher: Standard */ }
    if (this.level.data.kameraAbstand) this.view.setDistance(this.level.data.kameraAbstand);
    this.view.attach(surface);

    // Feld unter der Maus
    this.cursor = new GridCursor(this.level.data.raster, accent, this.pointer);
    this.scene.add(this.cursor.mesh);

    // Interaktion: was liegt unter dem Zeiger, was passiert beim Klick.
    // Der getragene Karton bleibt markiert.
    this.interactor = new Interactor(this.world, this.input, this.pointer, this.selection, accent);
    this.interactor.marked = () => this.hand.carried;

    // Oberfläche
    this.hud = new Hud(this.input, this.content, this.player, this.clock, this.level.data.name);
    this.debug = new DebugPanel(this.hud.root, this.content, this.world, this.player);
    this.contextHint = new ContextHint(this.interactor, this.input, this.pointer, this.content);
    this.info = new InfoPanel(this.selection, this.input, this.content, this.world);

    // Aktionen, die Komponenten per Klick auslösen
    const actions: GameActions = {
      openPurchase: () => this.purchaseWindow.open(),
      carriedCarton: () => this.hand.carried,
      pickUpCarton: (carton) => this.hand.take(carton),
      dropCarton: () => this.hand.clear(),
      stockInto: (shelf) => this.stockByHand(shelf),
      placeCarton: (surface) => this.placeByHand(surface),
      openMachine: (m) => this.machineWindow.open(m),
      openShelf: (e) => this.shelfWindow.open(e),
    };
    this.factory = { content: this.content, models: this.models, actions };

    // Ladenbetrieb (Kunden, Kassen, Wege, Ruf); die Kassen bekommen ihre Abrechnung über die Fabrik
    this.prices = new PriceBook(this.content.kunden.preis);
    this.store = new StoreLoop(this.world, this.content, this.player, this.level.bounds, this.level.data.kundenPunkte ?? [], () => this.factory, this.prices);
    this.factory.checkout = this.store.checkoutServices;

    // Wirtschaft: Lager (alle Ablageflächen) und Einkauf beim Großhandel
    this.storage = new CartonStorage(this.world, this.factory);
    // Lieferungen per LKW, wenn das Level eine Anlieferung hat (sonst kommt die Ware sofort)
    const route = this.level.data.anlieferung;
    this.fleet = route ? new TruckFleet(this.world, this.factory, this.content.logistik, route, this.storage, this.player, this.level.bounds,
      (x, z) => this.terrain.editAt(x, z)) : null;
    this.deliveries = this.fleet
      ? new Deliveries(this.content.logistik, this.storage, () => this.clock.totalMinutes, () => this.fleet!.onTrucks())
      : null;
    this.purchasing = new Purchasing(this.content.waren, this.player, this.deliveries ?? this.storage);
    this.buyers = new BuyerSystem(this.world, this.content.produkte, this.purchasing, this.player, this.content.personal.einkauf, this.deliveries ?? undefined);
    // Versorgung und Produktion: Maschinen holen Rohstoffe aus dem Lager und liefern dorthin
    this.utilities = new Utilities(this.content.versorgung, this.player);
    this.production = new Production(this.world, this.content, this.storage, this.utilities, () => this.player.level,
      () => [...this.world.query(MachineComponent)].map(([, m]) => m));
    this.factory.machine = {
      production: this.production,
      minutesPerSecond: readData<ClockSettings>('zeit/standard').spielminutenProSekunde,
      started: (byHand) => {
        if (byHand) this.player.addXp(this.content.arbeit.xpProProduktionVonHand ?? 3);
        this.goals.complete('maschine_starten');
      },
      finished: (r) => {
        this.goals.complete('produziert');
        this.hud.toasts.show(this.content.text('produziert_fertig', { menge: r.ausgang.menge, ware: this.content.waren.get(r.ausgang.ware).name }), 'gut');
      },
    };
    this.machineWindow = new MachineWindow(this.hud.root, this.content, this.production, () => this.player.level);
    this.shelfWindow = new ShelfWindow(this.hud.root, this.content, () => this.player.level);
    this.utilityWindow = new UtilityWindow(this.hud.root, this.utilities, this.production, () => this.player.level);
    this.buyers.events.on('ordered', ({ name, kartons, kosten }) => this.hud.toasts.show(this.content.text('einkaeufer_bestellt', { name, kartons, betrag: formatMoney(kosten) }), 'info'));
    this.buyers.events.on('blocked', ({ name, grund }) => this.hud.toasts.show(this.content.text(`einkaeufer_${grund}`, { name }), 'warnung'));
    this.utilities.events.on('upgraded', () => this.hud.toasts.show(this.content.text('anschluss_ausgebaut'), 'gut'));
    this.purchaseWindow = new PurchaseWindow(this.hud.root, this.content, this.purchasing, this.player, this.world, this.hud.toasts,
      this.deliveries ? { arrival: (art) => this.deliveries!.arrival(art), now: () => this.clock.totalMinutes } : undefined);
    this.logisticsWindow = new LogisticsWindow(this.hud.root, this.content, this.world, this.storage, this.deliveries, this.fleet, () => this.clock.totalMinutes);
    if (this.deliveries && this.fleet) {
      const fleet = this.fleet;
      this.deliveries.events.on('arrived', (s) => fleet.receive(s));
      fleet.events.on('arrived', ({ kartons }) => { this.hud.toasts.show(this.content.text('lkw_da', { kartons }), 'gut'); this.audio.play('lkw'); });
      fleet.events.on('driverUnloaded', ({ kartons, kosten }) => this.hud.toasts.show(this.content.text('lkw_fahrer_abgeladen', { kartons, kosten: formatMoney(kosten) })));
      fleet.events.on('unreachable', () => this.hud.toasts.show(this.content.text('lkw_tor_zugebaut'), 'warnung'));
      fleet.events.on('returned', ({ kartons, betrag }) => this.hud.toasts.show(this.content.text('lkw_zurueck', { kartons, betrag: formatMoney(betrag) }), 'warnung'));
    }

    // Personal: Verwaltung ohne Grafik, Spielfiguren entstehen über die Ereignisse
    this.staff = new Staff(this.content.rollen, this.content.personal, this.content.namen, this.player);
    this.personalWindow = new PersonalWindow(this.hud.root, this.content, this.staff,
      (e) => { const w = this.workers.get(e.id); return w ? { statusText: () => staffStatus(w) ?? '' } : undefined; });
    this.staff.events.on('hired', (e) => this.spawnWorker(e));
    this.staff.events.on('left', ({ employee, grund }) => {
      const w = this.workers.get(employee.id);
      if (w) this.world.remove(w);
      this.workers.delete(employee.id);
      if (grund === 'kein_lohn') this.hud.toasts.show(this.content.text('personal_gekuendigt', { name: employee.name }), 'warnung');
    });

    // Ziele für den Einstieg (nur, wenn das Level welche hat)
    this.goals = new Goals(this.level.data.ziele ? readData<GoalDef[]>(`ziele/${this.level.data.ziele}`) : [], this.player);
    new GoalPanel(this.hud.root, this.content, this.goals);
    this.goals.events.on('completed', (g) => {
      this.hud.toasts.show(this.content.text('ziel_erreicht', { text: g.text }), 'gut');
      this.effects.sparkle(this.view.focus.clone().setY(1), 24);
      this.audio.play('ziel');
    });
    this.report = new ReportWindow(this.hud.root, this.content);

    // Tageswechsel: erst den Tag abschließen (Bericht), dann Löhne für den neuen Tag
    this.clock.events.on('newDay', ({ tag }) => {
      // Strom und Wasser des abgelaufenen Tages bezahlen, dann den Tag abschließen
      this.utilities.bill();
      const report = this.store.stats.closeDay(tag);
      this.staff.payDay();
      this.goals.complete('tag_beenden');
      // Automatisch speichern, damit kein Tag verloren geht
      writeSlot('auto', this.toSave());
      const wasPaused = this.clock.paused;
      this.clock.setPaused(true);
      this.report.open(report, () => { if (!wasPaused) this.clock.setPaused(false); });
    });
    this.store.events.on('opened', () => this.hud.toasts.show(this.content.text('laden_oeffnet'), 'gut'));
    this.store.events.on('closed', () => this.hud.toasts.show(this.content.text('laden_schliesst')));
    this.store.events.on('sale', ({ betrag, artikel, byHand, kasse, kunde }) => {
      // Münzen springen aus der Kasse, der Betrag schwebt auf, der Kunde freut sich
      this.effects.coins(kasse.clone().setY(kasse.y + 1.1), 4 + Math.min(8, artikel));
      this.effects.floatText(kasse.clone().setY(kasse.y + 1.6), `+${formatMoney(betrag)}`, '#ffe08a');
      this.effects.heart(kunde.clone().setY(kunde.y + 2.1));
      this.audio.play('kasse');
      if (byHand) {
        this.hud.toasts.show(this.content.text('verkauft', { artikel, betrag: formatMoney(betrag) }), 'gut');
        this.goals.complete('kassieren');
      }
      if (this.store.stats.heute.umsatz >= 500) this.goals.complete('umsatz_500');
    });
    // Gedankenblasen: zeigen, was fehlt oder zu teuer ist (mit Wahrscheinlichkeit, je Kunde nicht zu oft)
    const gedanken = readData<AmbienceSettings>('leben/standard').gedanken;
    const zuletzt = new WeakMap<THREE.Object3D, number>();
    this.store.events.on('thought', ({ art, produkt, preis, kunde }) => {
      const jetzt = performance.now();
      if (Math.random() > (gedanken[art] ?? 0) || jetzt - (zuletzt.get(kunde) ?? -1e9) < 5000) return;
      zuletzt.set(kunde, jetzt);
      const vorlagen = gedanken.texte[art] ?? [];
      const text = (vorlagen[Math.floor(Math.random() * vorlagen.length)] ?? '').replace('{produkt}', produkt?.name ?? '').replace('{preis}', preis !== undefined ? formatMoney(preis) : '');
      if (text) this.effects.thought(kunde, text, art);
    });
    let warnedNoCheckout = false;
    this.store.events.on('visit', ({ outcome }) => {
      if (outcome === 'keine_kasse' && !warnedNoCheckout) { warnedNoCheckout = true; this.hud.toasts.show(this.content.text('kunde_keine_kasse'), 'warnung'); }
      if (outcome === 'zu_lange') this.hud.toasts.show(this.content.text('kunde_zu_lange'), 'warnung');
    });
    this.player.events.on('transaction', ({ grund }) => { if (grund === 'einkauf') this.goals.complete('ware_kaufen'); });
    this.staff.events.on('hired', () => this.goals.complete('personal'));

    // Bauen (nur auf eigenen Grundstücken)
    this.plots = new Plots(this.level.data.grundstuecke ?? [], this.player);
    this.plots.events.on('bought', (p) => {
      this.hud.toasts.show(this.content.text('grundstueck_gekauft', { name: p.name }), 'gut');
      this.goals.complete('grundstueck');
    });
    this.build = new BuildController(this.world, this.content, this.player, this.input, this.pointer, this.scene, this.factory,
      { ok: accent, fehler: danger }, this.plots, () => this.utilities.anschluss('strom') - this.production.baseDemand().strom,
      (r) => this.terrain.maxEditIn(r.minX, r.maxX, r.minZ, r.maxZ));
    // Gelände-Werkzeug: nur auf eigenem Grund und nicht unter Gebautem
    this.terrainTool = new TerrainTool(this.terrain, this.level.ground, this.scene, this.input, this.pointer, this.player, this.content.gelaende,
      (x, z) => this.plots.allows(x, z, 0) && !this.builtRects.some((r) => x > r.minX - 0.6 && x < r.maxX + 0.6 && z > r.minZ - 0.6 && z < r.maxZ + 0.6));
    // Effekte: Plopp beim Bauen, Verpuffen beim Abriss, Staub
    this.effects = new Effects(this.scene, this.content.effekte);
    this.build.motion = this.content.effekte.vorschau;
    this.ambience = new Ambience(this.scene, this.world, this.models, this.content.figuren, this.level.data.leben, readData<AmbienceSettings>('leben/standard'), {
      sound: (name) => this.audio.play(name),
    });
    try { const e = localStorage.getItem('urbanevolution.effekte'); if (e !== null) this.effects.settings.an = e === '1'; } catch { /* Standard */ }
    // Töne zu dem, was passiert
    this.build.events.on('placed', () => this.audio.play('bauen'));
    this.build.events.on('removing', () => this.audio.play('abriss'));
    this.build.events.on('rotated', () => this.audio.play('drehen'));
    this.build.events.on('picked', () => this.audio.play('klick'));
    this.build.events.on('message', ({ art }) => { if (art === 'warnung') this.audio.play('fehler'); });
    // Klick auf Knöpfe der Oberfläche
    this.hud.root.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) this.audio.play('klick'); });
    const footprintSize = (e: Entity) => { const g = e.get(FootprintComponent)?.groesse; return g ? Math.max(g[0], g[2]) : 1; };
    this.build.events.on('placed', ({ entity }) => {
      this.effects.pop(entity.object);
      this.effects.dust(entity.object.position, Math.min(2, footprintSize(entity)));
    });
    this.build.events.on('removing', ({ entity }) => {
      this.effects.vanish(entity.object);
      this.effects.dust(entity.object.position, Math.min(2, footprintSize(entity)));
    });
    this.build.events.on('picked', ({ entity }) => this.effects.dust(entity.object.position, 0.6));
    this.terrainTool.events.on('message', ({ key, art }) => this.hud.toasts.show(this.content.text(key), art));
    // Bodenmarkierungen: nur auf eigenem Grund und auf ebenem Boden
    this.paint = new PaintLayer(this.scene, this.level.bounds, this.content.markierungen);
    this.paintTool = new PaintTool(this.paint, this.scene, this.input, this.pointer, this.player, this.content.markierungen,
      (x, z) => this.plots.allows(x, z, 0) && Math.abs(this.terrain.heightAt(x, z)) < 0.03,
      (x, z) => this.paintFloors.reduce((h, f) => (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ ? Math.max(h, f.top) : h), 0));
    // Die Malschicht liegt auf jeder Bodenplatte (ohne abgesenkte Teile wie die Rampenabfahrt)
    const floors = () => {
      this.paintFloors = [...this.world.query(FootprintComponent)]
        .filter(([e, f]) => f.ebene === 'boden' && !e.get(TerrainCutComponent))
        .map(([, f]) => ({ ...f.rect(), top: f.top() }));
      this.paint.setFloors(this.paintFloors);
    };
    const floorChanged = (e: Entity) => { if (e.get(FootprintComponent)?.ebene === 'boden') floors(); };
    this.world.events.on('added', floorChanged);
    this.world.events.on('removed', floorChanged);
    this.build.events.on('placed', ({ entity }) => floorChanged(entity));
    floors();
    this.paintTool.events.on('message', ({ key, art }) => this.hud.toasts.show(this.content.text(key), art));
    this.buildMenu = new BuildMenu(this.hud.root, this.content, this.build, this.player, this.input, this.plots, this.terrainTool, this.paintTool);
    // Was mit einem neuen Level freigeschaltet wird
    this.player.events.on('levelUp', ({ level }) => {
      // Großes Funkeln mitten im Bild
      const f = this.view.focus.clone();
      this.effects.sparkle(f.clone().setY(1.2), 70);
      this.effects.floatText(f.clone().setY(2.4), `Level ${level}!`, '#ffd166', 1.5);
      this.audio.play('levelup');
      const neu = [
        ...this.content.bau.all().filter((d) => d.freischaltLevel === level && this.build.isBuildable(d)).map((d) => d.name),
        ...[...new Set(this.content.produkte.all().filter((p) => p.freischaltLevel === level).map((p) => this.content.kategorien.find(p.kategorie)?.name ?? p.kategorie))],
        ...this.plots.list.filter((p) => p.freischaltLevel === level && !p.besessen).map((p) => `Grundstück ${p.name}`),
      ];
      if (neu.length) this.hud.toasts.show(this.content.text('freigeschaltet', { liste: neu.join(', ') }), 'gut');
    });
    this.build.events.on('message', ({ key, werte, art }) => this.hud.toasts.show(this.content.text(key, werte), art));
    this.build.events.on('placed', ({ entity, moved }) => {
      this.store.nav.invalidate();
      this.fleet?.invalidate();
      this.roof?.invalidate();
      if (entity.get(TerrainCutComponent)) this.refreshTerrainCuts();
      if (moved) return;
      if (entity.get(ShelfComponent)) this.goals.complete('regal_bauen');
      if (entity.get(CheckoutComponent)) this.goals.complete('kasse_bauen');
    });
    this.hud.onTool('bauen', () => this.buildMenu.toggleOpen());
    this.hud.onTool('personal', () => this.personalWindow.toggleOpen());
    this.hud.onTool('menue', () => this.openMenu('pause'));
    this.assortment = new AssortmentWindow(this.hud.root, this.content, this.prices, this.store.stats, this.world, () => this.player.level, this.buyers.listing);
    this.statsWindow = new StatsWindow(this.hud.root, this.store.stats);
    this.hud.onTool('sortiment', () => this.assortment.toggleOpen());
    this.hud.onTool('bilanz', () => this.statsWindow.toggleOpen());
    this.hud.onTool('versorgung', () => this.utilityWindow.toggleOpen());
    this.hud.onTool('lager', () => this.logisticsWindow.toggleOpen());
    this.hud.onTool('dach', () => this.toggleRoof());

    // Hand: Anzeige im HUD und Markierung des getragenen Kartons
    let lastCarried: Entity | null = null;
    this.hand.events.on('changed', () => {
      this.interactor.refresh(lastCarried);
      lastCarried = this.hand.carried;
      this.renderHand();
    });
    this.world.events.on('changed', (e) => {
      if (e === this.hand.carried) this.renderHand();
      if ((e.get(ShelfComponent)?.bestand ?? 0) > 0) this.goals.complete('einraeumen');
    });
    this.world.events.on('removed', (e) => { if (e === this.hand.carried) this.hand.clear(); });

    // Menü (Haupt- und Pausemenü)
    this.menu = new GameMenu(this.hud.root, {
      weiter: () => {
        // Im Hauptmenü eines frischen Spiels: den letzten Stand laden, wenn es einen gibt
        const newest = newestSlot();
        if (this.options.menu && !this.options.save && newest && this.menuMode === 'haupt') this.loadSlot(newest);
        else this.closeMenu();
      },
      neu: () => restartWith({ aktion: 'neu' }),
      laden: (slot) => this.loadSlot(slot),
      speichern: (slot) => writeSlot(slot, this.toSave()),
      exportieren: () => downloadSave(this.toSave()),
      importieren: (file) => {
        readSaveFile(file).then((daten) => restartWith({ aktion: 'laden', daten }))
          .catch((err: unknown) => this.hud.toasts.show(`Datei nicht lesbar: ${String(err)}`, 'warnung'));
      },
      editor: () => restartWith(null, 'editor'),
      hauptmenue: () => restartWith(null),
      testmarkt: hasData('spielstaende/testmarkt') ? () => restartWith(null, 'testmarkt') : undefined,
      stil: () => (this.models.voxelStyle ? 'voxel' : 'lowpoly'),
      optionen: () => ({ look: this.look.an, effekte: this.effects.settings.an, musik: this.audio?.musik ?? 0, toene: this.audio?.toene ?? 0 }),
      setOption: (k, v) => {
        if (k === 'look') this.look.an = v as boolean;
        else if (k === 'effekte') this.effects.settings.an = v as boolean;
        else if (k === 'musik') this.audio?.setMusik(v as number);
        else if (k === 'toene') this.audio?.setToene(v as number);
        try { localStorage.setItem(`urbanevolution.${k}`, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)); } catch { /* nur für diesmal */ }
      },
      setStil: (s) => {
        try { localStorage.setItem(STIL_KEY, s); } catch { /* dann nur für diesmal */ }
        // Neu laden mit dem aktuellen Stand, damit nichts verloren geht
        restartWith(this.options.menu && !this.options.save ? null : { aktion: 'laden', daten: this.toSave() });
      },
    });

    // Erst jetzt Objekte setzen, damit die Anzeigen sie mitzählen: aus dem Spielstand oder aus dem Level
    if (options.save) this.applySave(options.save);
    else {
      for (const o of expandObjects(this.level.data.objekte)) {
        const entity = o.produkt !== undefined
          ? createProductEntity(this.content.produkte.get(o.produkt), o, this.factory)
          : createBuildEntity(this.content.bau.get(o.typ ?? ''), o, this.factory);
        this.world.add(entity);
      }
    }
    this.store.sync(this.clock.totalMinutes % (24 * 60));
    if (options.menu) this.openMenu('haupt');

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start(): void {
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  private tick(time: number): void {
    this.timer.update(time);
    // Echte Zeit seit dem letzten Bild. Höchstens 1 s, damit ein Tab im Hintergrund
    // keinen Riesensprung erzeugt – aber auch auf langsamen Rechnern geht keine Spielzeit verloren.
    const realDt = Math.min(this.timer.getDelta(), 1);
    this.handleGlobalKeys();

    // Kamera in Echtzeit (gegen Ruckeln enger begrenzt), Simulation im Spieltempo (steht in der Pause)
    this.view.update(Math.min(realDt, 0.1));
    // Nachts im leeren Laden läuft die Zeit schneller
    this.clock.boost = !this.store.offen && this.store.kundenImLaden === 0 ? this.content.kunden.nachtVorlauf : 1;
    const minutesBefore = this.clock.totalMinutes;
    const simDt = this.clock.update(realDt);
    const minutes = this.clock.totalMinutes - minutesBefore;
    this.store.update(minutes, this.clock.totalMinutes % (24 * 60));
    this.utilities.run(minutes, this.production.demand());
    this.deliveries?.update(this.clock.totalMinutes);
    this.buyers.update(this.clock.totalMinutes);
    this.fleet?.update(minutes);
    this.world.update(simDt);
    this.updateDaylight(realDt);
    this.effects.update(realDt);
    this.truckSmoke(simDt);
    this.ambience.update(simDt, this.clock.totalMinutes % (24 * 60), this.nacht, realDt);
    this.roof?.update(realDt, this.view.abstand, this.toolActive);
    this.terrainView.update();
    this.paint.update();

    // Solange ein Bauwerkzeug aktiv oder das Menü offen ist, wird nichts angeklickt oder hervorgehoben
    this.interactor.enabled = !this.toolActive && !this.menu.isOpen;
    this.build.update(this.view.camera, realDt);
    if (this.terrainTool.active) {
      this.builtRects = [...this.world.query(FootprintComponent)].map(([, f]) => f.rect());
      this.terrainTool.update(this.view.camera, realDt);
    }
    this.paintTool.update(this.view.camera);
    // Gelände geändert: LKW-Wege neu berechnen
    if (this.terrain.version !== this.terrainVersion) { this.terrainVersion = this.terrain.version; this.fleet?.invalidate(); }
    this.interactor.update(this.view.camera);
    // Über einem Objekt zeigt der Hinweis am Zeiger, worum es geht – dann keine Feld-Markierung
    this.cursor.update(this.view.camera, this.level.bounds, this.interactor.hovered !== null || this.toolActive);
    this.debug.showCell(this.cursor.cell);
    this.contextHint.update();
    this.buildMenu.update();
    this.personalWindow.update();
    this.hud.setToolActive('bauen', this.buildMenu.isOpen);
    this.hud.setToolActive('personal', this.personalWindow.isOpen);
    this.hud.setToolActive('sortiment', this.assortment.isOpen);
    this.hud.setToolActive('bilanz', this.statsWindow.isOpen);
    this.hud.setToolActive('versorgung', this.utilityWindow.isOpen);
    this.machineWindow.update();
    this.shelfWindow.update();
    this.utilityWindow.update();
    this.logisticsWindow.update();
    this.hud.setToolActive('lager', this.logisticsWindow.isOpen);
    this.hud.setToolActive('dach', !!this.roof && !this.roof.hidden);
    this.renderStore();

    const { min, max } = this.view.settings.abstand;
    this.look.zoom = THREE.MathUtils.clamp((this.view.abstand - min) / (max - min), 0, 1);
    this.look.render(this.scene, this.view.camera);
    this.input.endFrame();
  }

  /** Dach ausblenden bzw. wieder zeigen (herausgezoomt) */
  private toggleRoof(): void {
    if (!this.roof) return;
    this.roof.hidden = !this.roof.hidden;
    this.hud.toasts.show(this.content.text(this.roof.hidden ? 'dach_aus' : 'dach_an'));
  }

  /** Tag und Nacht: Sonne, Umgebungslicht und Himmel folgen der Uhrzeit; Lampen leuchten nachts stärker. */
  private updateDaylight(realDt: number): void {
    const l = this.content.licht;
    const d = daylight(l, this.clock.totalMinutes % (24 * 60));
    this.sun.intensity = d.sonne;
    this.ambient.intensity = d.umgebung;
    this.sun.color.copy(this.sky.sonneNacht).lerp(this.sky.sonne, d.tag).lerp(this.sky.sonneDaemmerung, d.daemmerung * 0.6);
    (this.scene.background as THREE.Color).copy(this.sky.nacht).lerp(this.sky.tag, d.tag).lerp(this.sky.daemmerung, d.daemmerung * 0.5);
    (this.scene.fog as THREE.Fog | null)?.color.copy(this.scene.background as THREE.Color);
    this.lampLights.update(realDt, this.view.focus, 1 + (1 - d.tag) * (l.lampen.nachtVerstaerkung - 1));
    this.look.nacht = 1 - d.tag;
    this.nacht = 1 - d.tag;
    this.audio.nacht = 1 - d.tag;
  }

  /** Tasten, die überall gelten. Esc schließt immer nur das Oberste. */
  private handleGlobalKeys(): void {
    const i = this.input;
    // Im Menü gilt nur Esc (zurück bzw. weiterspielen)
    if (this.menu.isOpen) {
      if (i.wasPressed('pause')) this.menu.back();
      return;
    }
    if (i.wasPressed('debug_anzeige')) this.debug.toggle();
    if (i.wasPressed('zeit_anhalten')) this.clock.togglePause();
    for (let s = 1; s <= this.clock.stufen; s++) if (i.wasPressed(`zeit_stufe_${s}`)) this.clock.setStufe(s);
    if (i.wasPressed('bauen_menue')) this.buildMenu.toggleOpen();
    if (i.wasPressed('personal_menue')) this.personalWindow.toggleOpen();
    if (i.wasPressed('sortiment_menue')) this.assortment.toggleOpen();
    if (i.wasPressed('bilanz_menue')) this.statsWindow.toggleOpen();
    if (i.wasPressed('versorgung_menue')) this.utilityWindow.toggleOpen();
    if (i.wasPressed('lager_menue')) this.logisticsWindow.toggleOpen();
    if (i.wasPressed('dach_umschalten')) this.toggleRoof();
    if (i.wasPressed('ton_stumm')) this.hud.toasts.show(this.audio.toggleStumm() ? 'Ton aus (M)' : 'Ton an (M)');
    if (i.wasPressed('pause')) {
      if (this.report.isOpen) this.report.close();
      else if (this.build.active) this.build.cancel();
      else if (this.terrainTool.active) this.terrainTool.cancel();
      else if (this.paintTool.active) this.paintTool.cancel();
      else if (this.purchaseWindow.isOpen) this.purchaseWindow.close();
      else if (this.personalWindow.isOpen) this.personalWindow.close();
      else if (this.assortment.isOpen) this.assortment.close();
      else if (this.statsWindow.isOpen) this.statsWindow.close();
      else if (this.machineWindow.isOpen) this.machineWindow.close();
      else if (this.shelfWindow.isOpen) this.shelfWindow.close();
      else if (this.utilityWindow.isOpen) this.utilityWindow.close();
      else if (this.logisticsWindow.isOpen) this.logisticsWindow.close();
      else if (this.buildMenu.isOpen) this.buildMenu.close();
      else if (this.hand.carried) this.hand.clear();
      else if (this.selection.current) this.selection.clear();
      else this.openMenu('pause');
    }
  }

  /** Getragenen Karton von Hand einräumen – Handarbeit bringt XP. */
  private stockByHand(shelf: Entity): void {
    const carton = this.hand.carried;
    if (!carton) return;
    const produkt = carton.require(CartonComponent).produkt;
    const result = stockFromCarton(carton, shelf);
    if (!result.ok) {
      const key = result.grund === 'kuehlung' ? 'einraeumen_kuehlung' : result.grund === 'rohstoff' ? 'einraeumen_rohstoff' : 'einraeumen_voll';
      this.hud.toasts.show(this.content.text(key, { produkt: produkt.name }), 'warnung');
      return;
    }
    this.hud.toasts.show(this.content.text('eingeraeumt', { menge: result.menge, produkt: produkt.name }), 'gut');
    this.effects.floatText(shelf.object.position.clone().setY(shelf.object.position.y + 2), `+${result.menge} ${produkt.name}`, '#bff0cf', 0.8);
    this.effects.dust(shelf.object.position, 0.5);
    this.audio.play('einraeumen');
    this.player.addXp(Math.max(1, Math.round(this.content.arbeit.xpProKartonVonHand * result.menge / produkt.gebinde)));
    if (result.leer) this.hand.clear();
  }

  /** Getragenen Karton auf eine Ablage stellen (umlagern) – vom LKW abladen bringt XP. */
  private placeByHand(surfaceEntity: Entity): void {
    const carton = this.hand.carried;
    const target = surfaceEntity.get(StorageSurfaceComponent);
    const c = carton?.get(CartonComponent);
    if (!carton || !target || !c || c.reservedBy !== null) return;
    if (target.free <= 0) { this.hud.toasts.show(this.content.text('abstellen_voll'), 'warnung'); return; }
    const vomLkw = c.ablage?.temporaer ?? false;
    c.leaveStorage();
    place(carton, target);
    this.hand.clear();
    if (vomLkw) {
      this.player.addXp(this.content.logistik.xpProKartonAbladen);
      this.goals.complete('lieferung');
    }
  }

  // ── Spielstand und Menü ─────────────────────────────────────────

  private menuMode: 'haupt' | 'pause' = 'haupt';

  private openMenu(mode: 'haupt' | 'pause'): void {
    if (this.menu.isOpen) return;
    this.menuMode = mode;
    this.resumeAfterMenu = !this.clock.paused;
    this.clock.setPaused(true);
    this.build.cancel();
    this.menu.open(mode);
  }

  private closeMenu(): void {
    this.menu.close();
    if (this.resumeAfterMenu) this.clock.setPaused(false);
  }

  private loadSlot(slot: SlotId): void {
    const daten = readSlot(slot);
    if (daten) restartWith({ aktion: 'laden', daten });
    else this.hud.toasts.show('Dieser Spielstand ist nicht lesbar', 'warnung');
  }

  /** Alles für einen Spielstand einsammeln. */
  toSave(): SaveData {
    return {
      version: SAVE_VERSION,
      level: this.levelId,
      gespeichert: new Date().toISOString(),
      spieler: { geld: this.player.geld, xp: this.player.xp },
      uhr: this.clock.state(),
      ...collectWorld(this.world, this.content),
      personal: this.staff.state(),
      laden: this.store.stats.state(),
      ziele: this.goals.erledigt,
      preise: this.prices.state(),
      systeme: {
        grundstuecke: this.plots.state(),
        versorgung: this.utilities.state(),
        gelaende: this.terrain.state(),
        markierungen: this.paint.state(),
        einkauf: this.buyers.listing.state(),
        // Was noch auf einem LKW steht, kommt beim Laden gleich wieder per LKW
        ...(this.deliveries && this.fleet ? { logistik: { ...this.deliveries.state(), aufLkw: this.fleet.cargo() } } : {}),
      },
    };
  }

  /** Fahrende LKW lassen kleine Wölkchen aus dem Auspuff */
  private truckSmoke(dt: number): void {
    if (dt <= 0) return;
    this.smokeTimer -= dt;
    if (this.smokeTimer > 0) return;
    this.smokeTimer = 0.14;
    const [ax, ay, az] = this.content.effekte.lkwAuspuff;
    for (const [e, t] of this.world.query(TruckComponent)) {
      if (t.state === 'steht') continue;
      this.effects.smoke(e.object.localToWorld(new THREE.Vector3(ax, ay, az)));
    }
  }

  /** Ist gerade ein Bau-, Gelände- oder Mal-Werkzeug aktiv? */
  private get toolActive(): boolean {
    return this.build.active || this.terrainTool.active || this.paintTool.active;
  }

  /** Spielstand übernehmen: Welt aufbauen, dann die Systeme. */
  private applySave(d: SaveData): void {
    applyWorld(d, this.world, this.content, this.factory);
    this.player.restore(d.spieler);
    this.clock.restore(d.uhr);
    this.store.stats.restore(d.laden, (id) => this.content.produkte.find(id));
    this.prices.restore(d.preise ?? {});
    this.goals.restore(d.ziele ?? []);
    this.staff.restore(d.personal);
    const grund = d.systeme?.grundstuecke;
    if (Array.isArray(grund)) this.plots.restore(grund.filter((x): x is string => typeof x === 'string'));
    const vers = d.systeme?.versorgung;
    if (vers && typeof vers === 'object') this.utilities.restore(vers as Parameters<Utilities['restore']>[0]);
    if (d.systeme?.gelaende) this.terrain.restore(d.systeme.gelaende);
    this.paint.restore(d.systeme?.markierungen);
    this.buyers.restore(d.systeme?.einkauf);
    const log = d.systeme?.logistik as (Partial<DeliveriesState> & { aufLkw?: ShipmentLine[] }) | undefined;
    if (log && this.deliveries) {
      const known = (id: string) => this.content.waren.has(id);
      this.deliveries.restore(log, known);
      this.deliveries.addNow((log.aufLkw ?? []).filter((k) => known(k.produkt) && k.menge > 0));
    }
    for (const e of this.staff.team) this.spawnWorker(e, true);
    this.store.nav.invalidate();
  }

  private spawnWorker(e: Employee, silent = false): void {
    // Was der Spieler gerade trägt, rührt das Personal nicht an
    const entity = createWorkerEntity(e, this.store.staffServices((carton) => carton !== this.hand.carried, this.storage), this.factory);
    this.workers.set(e.id, entity);
    this.world.add(entity);
    if (!silent) this.hud.toasts.show(this.content.text('personal_eingestellt', { name: e.name, rolle: this.content.rollen[e.rolle].name }), 'gut');
  }

  private renderHand(): void {
    const carton = this.hand.carried?.get(CartonComponent);
    if (!carton) { this.hud.showHand(null); return; }
    const key = (a: string) => `<span class="key">${esc(this.input.keyLabel(a))}</span>`;
    this.hud.showHand(
      this.content.text('hand_traegt', { produkt: carton.produkt.name, menge: carton.menge }),
      `${key('auswaehlen')} ${esc(this.content.text('einraeumen'))} · ${key('pause')} ${esc(this.content.text('ablegen'))}`,
    );
  }

  /** Ladenstatus im HUD: geöffnet/geschlossen, Kunden, Ruf. */
  private renderStore(): void {
    const offen = this.store.offen;
    const status = offen ? this.content.text('laden_offen') : this.content.text('laden_zu', { zeit: this.content.kunden.oeffnung });
    this.hud.setStore(offen, status, this.store.kundenImLaden, this.store.stats.ruf);
  }

  private resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.look?.setSize(w, h);
    this.view.setAspect(w / h);
  }
}
