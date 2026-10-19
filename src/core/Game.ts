import * as THREE from 'three';
import { readData } from './Data';
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
  /** Angestellte (id) → ihre Spielfigur */
  private readonly workers = new Map<number, Entity>();
  /** Lief die Uhr, bevor das Menü aufging? */
  private resumeAfterMenu = false;

  private readonly timer = new THREE.Timer();
  private readonly sun: THREE.DirectionalLight;

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
    container.append(this.renderer.domElement);
    const surface = this.renderer.domElement;

    // Eingabe
    this.input = new InputMap(readData<Bindings>('eingabe/standard'));
    this.input.attach(surface);
    this.pointer.attach(surface);

    // Kulisse
    this.level = new Level(readData<LevelData>(`level/${levelId}`));
    this.scene.add(this.level.root);
    this.scene.background = new THREE.Color(this.level.data.himmel);

    // Welt mit allen Entities, gefüllt aus den Objekten des Levels
    const entities = new THREE.Group();
    entities.name = 'Entities';
    this.scene.add(entities);
    this.world = new World(entities);

    // Licht: Himmel/Boden-Licht plus Sonne mit Schatten über das ganze Gelände
    this.scene.add(new THREE.HemisphereLight('#e9f1f5', '#6b6355', 1.4));
    this.sun = new THREE.DirectionalLight('#fff1dc', 2.4);
    this.sun.position.set(18, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const b = this.level.bounds;
    const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 100 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);

    // Kamera
    const start = new THREE.Vector3(...this.level.data.kameraStart);
    this.view = new ManagementCamera(readData<CameraSettings>('kamera/standard'), this.input, this.level.bounds, start);
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
    };
    this.factory = { content: this.content, models: this.models, actions };

    // Ladenbetrieb (Kunden, Kassen, Wege, Ruf); die Kassen bekommen ihre Abrechnung über die Fabrik
    this.prices = new PriceBook(this.content.kunden.preis);
    this.store = new StoreLoop(this.world, this.content, this.player, this.level.bounds, this.level.data.kundenPunkte ?? [], () => this.factory, this.prices);
    this.factory.checkout = this.store.checkoutServices;

    // Wirtschaft: Lager (alle Ablageflächen) und Einkauf beim Großhandel
    this.storage = new CartonStorage(this.world, this.factory);
    this.purchasing = new Purchasing(this.content.produkte, this.player, this.storage);
    this.purchaseWindow = new PurchaseWindow(this.hud.root, this.content, this.purchasing, this.player, this.world, this.hud.toasts);

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
    this.goals.events.on('completed', (g) => this.hud.toasts.show(this.content.text('ziel_erreicht', { text: g.text }), 'gut'));
    this.report = new ReportWindow(this.hud.root, this.content);

    // Tageswechsel: erst den Tag abschließen (Bericht), dann Löhne für den neuen Tag
    this.clock.events.on('newDay', ({ tag }) => {
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
    this.store.events.on('sale', ({ betrag, artikel, byHand }) => {
      if (byHand) {
        this.hud.toasts.show(this.content.text('verkauft', { artikel, betrag: formatMoney(betrag) }), 'gut');
        this.goals.complete('kassieren');
      }
      if (this.store.stats.heute.umsatz >= 500) this.goals.complete('umsatz_500');
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
    this.plots.events.on('bought', (p) => this.hud.toasts.show(this.content.text('grundstueck_gekauft', { name: p.name }), 'gut'));
    this.build = new BuildController(this.world, this.content, this.player, this.input, this.pointer, this.scene, this.factory,
      { ok: accent, fehler: danger }, this.plots);
    this.buildMenu = new BuildMenu(this.hud.root, this.content, this.build, this.player, this.input, this.plots);
    // Was mit einem neuen Level freigeschaltet wird
    this.player.events.on('levelUp', ({ level }) => {
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
      if (moved) return;
      if (entity.get(ShelfComponent)) this.goals.complete('regal_bauen');
      if (entity.get(CheckoutComponent)) this.goals.complete('kasse_bauen');
    });
    this.hud.onTool('bauen', () => this.buildMenu.toggleOpen());
    this.hud.onTool('personal', () => this.personalWindow.toggleOpen());
    this.hud.onTool('editor', () => restartWith(null, 'editor'));
    this.hud.onTool('menue', () => this.openMenu('pause'));
    this.assortment = new AssortmentWindow(this.hud.root, this.content, this.prices, this.store.stats, this.world, () => this.player.level);
    this.statsWindow = new StatsWindow(this.hud.root, this.store.stats);
    this.hud.onTool('sortiment', () => this.assortment.toggleOpen());
    this.hud.onTool('bilanz', () => this.statsWindow.toggleOpen());

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
      stil: () => (this.models.voxelStyle ? 'voxel' : 'lowpoly'),
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
    this.store.update(this.clock.totalMinutes - minutesBefore, this.clock.totalMinutes % (24 * 60));
    this.world.update(simDt);

    // Solange ein Bauwerkzeug aktiv oder das Menü offen ist, wird nichts angeklickt oder hervorgehoben
    this.interactor.enabled = !this.build.active && !this.menu.isOpen;
    this.build.update(this.view.camera);
    this.interactor.update(this.view.camera);
    // Über einem Objekt zeigt der Hinweis am Zeiger, worum es geht – dann keine Feld-Markierung
    this.cursor.update(this.view.camera, this.level.bounds, this.interactor.hovered !== null || this.build.active);
    this.debug.showCell(this.cursor.cell);
    this.contextHint.update();
    this.buildMenu.update();
    this.personalWindow.update();
    this.hud.setToolActive('bauen', this.buildMenu.isOpen);
    this.hud.setToolActive('personal', this.personalWindow.isOpen);
    this.hud.setToolActive('sortiment', this.assortment.isOpen);
    this.hud.setToolActive('bilanz', this.statsWindow.isOpen);
    this.renderStore();

    this.renderer.render(this.scene, this.view.camera);
    this.input.endFrame();
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
    if (i.wasPressed('pause')) {
      if (this.report.isOpen) this.report.close();
      else if (this.build.active) this.build.cancel();
      else if (this.purchaseWindow.isOpen) this.purchaseWindow.close();
      else if (this.personalWindow.isOpen) this.personalWindow.close();
      else if (this.assortment.isOpen) this.assortment.close();
      else if (this.statsWindow.isOpen) this.statsWindow.close();
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
      const key = result.grund === 'kuehlung' ? 'einraeumen_kuehlung' : 'einraeumen_voll';
      this.hud.toasts.show(this.content.text(key, { produkt: produkt.name }), 'warnung');
      return;
    }
    this.hud.toasts.show(this.content.text('eingeraeumt', { menge: result.menge, produkt: produkt.name }), 'gut');
    this.player.addXp(Math.max(1, Math.round(this.content.arbeit.xpProKartonVonHand * result.menge / produkt.gebinde)));
    if (result.leer) this.hand.clear();
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
      systeme: { grundstuecke: this.plots.state() },
    };
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
    for (const e of this.staff.team) this.spawnWorker(e, true);
    this.store.nav.invalidate();
  }

  private spawnWorker(e: Employee, silent = false): void {
    // Was der Spieler gerade trägt, rührt das Personal nicht an
    const entity = createWorkerEntity(e, this.store.staffServices((carton) => carton !== this.hand.carried), this.factory);
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
    this.view.setAspect(w / h);
  }
}
