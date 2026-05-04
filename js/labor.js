// ── Labor & Forschung ──

// Globale Variablen für das Tech-Tree
let techTreeSvg;
let techTreeZoom = 1;
let techTreePanX = 0;
let techTreePanY = 0;
let isDragging = false;
let dragStartX, dragStartY;
let currentCategory = 'produktion'; // Standard: Produktion
let tooltipElement;

function getTechCategories() {
  const order = ['produktion', 'logistik', 'automation', 'maschinen', 'gebaeude', 'wirtschaft'];
  const categories = [];
  FORSCHUNG.forEach(f => {
    if (!f.kategorie) return;
    if (!categories.includes(f.kategorie)) categories.push(f.kategorie);
  });
  categories.sort((a, b) => {
    const ia = order.indexOf(a) >= 0 ? order.indexOf(a) : 999;
    const ib = order.indexOf(b) >= 0 ? order.indexOf(b) : 999;
    return ia - ib;
  });
  return categories;
}

function getCategoryLabel(category) {
  const labels = {
    'produktion': '⚙️ Produktion',
    'logistik': '🚚 Logistik',
    'elektronik': '💾 Elektronik',
    'wirtschaft': '💰 Wirtschaft',
    'automation': '🤖 Automation',
    'maschinen': '🛠 Maschinen',
    'gebaeude': '🏭 Gebäude',
    'energie': '⚡ Energie',
    'basis': '🔬 Grundlagen'
  };
  return labels[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

function getCategoryEmoji(category) {
  const emojis = {
    'produktion': '⚙️',
    'logistik': '🚚',
    'automation': '🤖',
    'maschinen': '🛠',
    'gebaeude': '🏭',
    'wirtschaft': '💰'
  };
  return emojis[category] || '🔹';
}

function getCategoryColor(category) {
  const colors = {
    'produktion': '#185FA5',
    'logistik': '#BA7517',
    'elektronik': '#534AB7',
    'wirtschaft': '#0F6E56',
    'automation': '#9C27B0',
    'maschinen': '#F59E0B',
    'gebaeude': '#10B981',
    'energie': '#5F5E5A',
    'basis': '#EF9F27'
  };
  return colors[category] || '#666';
}

function istErforscht(forschungsId) {
  return erforschte_technologien.includes(forschungsId);
}

function getForschungsBedingungen(forschung) {
  if (!forschung || !forschung.bedingung) return [];
  return Array.isArray(forschung.bedingung) ? forschung.bedingung : [forschung.bedingung];
}

function forschungsBedingungErfuellt(forschung) {
  const bedingungen = getForschungsBedingungen(forschung);
  return bedingungen.every(cond => istErforscht(cond));
}

function getMissingForschungsBedingungen(forschung) {
  const bedingungen = getForschungsBedingungen(forschung);
  return bedingungen.filter(cond => !istErforscht(cond));
}

function forschungStarten(forschungsId) {
  if (!hatGebaeude("labor")) {
    alert("Du brauchst ein Forschungslabor!");
    return;
  }

  let forschung = FORSCHUNG.find(f => f.id === forschungsId);
  if (!forschung) return;

  if (istErforscht(forschungsId)) {
    alert("Bereits erforscht!");
    return;
  }
  if (aktive_forschung) {
    alert("Es wird bereits etwas erforscht! Warte bis die aktuelle Forschung abgeschlossen ist.");
    return;
  }
  if (!forschungsBedingungErfuellt(forschung)) {
    const missing = getMissingForschungsBedingungen(forschung).map(id => {
      const req = FORSCHUNG.find(f => f.id === id);
      return req ? `${req.emoji} ${req.name}` : id;
    });
    alert("🔒 Fehlende Voraussetzungen:\n- " + missing.join("\n- "));
    return;
  }
  if (geld < forschung.kosten) {
    alert("Nicht genug Geld! Benötigt: " + forschung.kosten.toLocaleString("de-DE") + " €");
    return;
  }

  geld -= forschung.kosten;
  aktive_forschung = {
    id: forschungsId,
    rundenVerbleibend: forschung.forschungszeit
  };
  soundForschungStart();
  geldAnzeigenAktualisieren();
  laborAnzeigenAktualisieren();
  spielstandSpeichern();
}

function forschungsFortschritt() {
  if (!aktive_forschung) return;
  aktive_forschung.rundenVerbleibend--;

  if (aktive_forschung.rundenVerbleibend <= 0) {
    forschungAbschliessen(aktive_forschung.id);
  } else {
    laborAnzeigenAktualisieren();
  }
}

function forschungAbschliessen(forschungsId) {
  let forschung = FORSCHUNG.find(f => f.id === forschungsId);
  if (!forschung) return;

  erforschte_technologien.push(forschungsId);
  aktive_forschung = null;

  forschungsEffektAnwenden(forschung.effekt);
  soundForschungFertig();
  shopGenerieren();
  laborAnzeigenAktualisieren();
  spielstandSpeichern();

  // Grüne Notification
  let notification = document.getElementById("betrieb-status");
  notification.style.display = "block";
  notification.style.background = "var(--green)";
  notification.style.color = "#000";
  notification.textContent = "🔬 Forschung abgeschlossen: " + forschung.name + "!";
  setTimeout(() => {
    notification.style.display = "none";
    notification.style.background = "var(--red)";
    notification.style.color = "#fff";
  }, 5000);
}

function forschungsEffektAnwenden(effekt) {
  if (!effekt) return;

  const handler = effektHandler[effekt.typ];

  if (handler) {
    handler(effekt);
  } else {
    console.warn("Unbekannter Effekt:", effekt.typ);
  }
}

const effektHandler = {

  produktionBonus(effekt) {
    forschungsBonus.produktionMultiplikator = effekt.wert;
  },

  kostenBonus(effekt) {
    forschungsBonus.kostenMultiplikator = effekt.wert;
  },

  lohnBonus(effekt) {
    forschungsBonus.lohnMultiplikator = effekt.wert;
  },

  personalBonus(effekt) {
    forschungsBonus.personalReduktion =
      (forschungsBonus.personalReduktion || 0) + Math.abs(effekt.wert);
  },

  freischalten(effekt) {
    let liste = Array.isArray(effekt.was) ? effekt.was : [effekt.was];
    for (let id of liste) {
      if (!forschungsBonus.freigeschaltete_maschinen.includes(id)) {
        forschungsBonus.freigeschaltete_maschinen.push(id);
      }
    }
  },

  linienBonus(effekt) {
    if (!forschungsBonus.linienBoni) forschungsBonus.linienBoni = {};
    forschungsBonus.linienBoni[effekt.linie] = effekt.wert;
  },

  kritChance(effekt) {
    forschungsBonus.kritChance = effekt.chance;
    forschungsBonus.kritMulti = effekt.multiplikator;
  },

  overclock(effekt) {
    forschungsBonus.overclockSpeed = effekt.speed;
    forschungsBonus.overclockEnergie = effekt.energie;
  },

  autoOptimierung() {
    forschungsBonus.autoOptimierung = true;
  },

  transportBonus(effekt) {
    forschungsBonus.transportBonus = effekt.wert;
  },

  recycling() {
    forschungsBonus.recycling = true;
  },

  lagerKapazitaetBonus(effekt) {
    forschungsBonus.lagerKapazitaetBonus = effekt.wert;
  },

  energieNetzwerk() {
    forschungsBonus.energieNetzwerk = true;
  },

  premiumChance(effekt) {
    forschungsBonus.premiumChance = effekt.chance;
    forschungsBonus.premiumWert = effekt.wert;
  }
};

// ── Tech-Tree Rendering ──

function initTechTree() {
  const container = document.getElementById('tech-tree-container');
  if (!container) return;

  // Tabs erstellen
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tech-category-tabs';

  const categoryIds = getTechCategories();
  if (!categoryIds.length) return;
  if (!categoryIds.includes(currentCategory)) {
    currentCategory = categoryIds[0];
  }

  categoryIds.forEach(catId => {
    const tab = document.createElement('button');
    tab.className = 'tech-tab';
    tab.textContent = getCategoryLabel(catId);
    tab.setAttribute('data-category', catId);
    tab.onclick = () => switchCategory(catId);
    tabsContainer.appendChild(tab);
  });

  // Container für Tabs und SVG
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.height = '100%';

  wrapper.appendChild(tabsContainer);

  // Tooltip erstellen
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'tech-tooltip';
  tooltipElement.style.display = 'none';
  document.body.appendChild(tooltipElement);

  // SVG Container
  const svgContainer = document.createElement('div');
  svgContainer.style.flex = '1';
  svgContainer.style.overflow = 'auto';
  svgContainer.style.position = 'relative';

  // SVG erstellen
  techTreeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  techTreeSvg.setAttribute('width', '100%');
  techTreeSvg.setAttribute('height', '100%');
  techTreeSvg.style.background = 'var(--bg1)';
  svgContainer.appendChild(techTreeSvg);

  wrapper.appendChild(svgContainer);
  container.innerHTML = '';
  container.appendChild(wrapper);

  // Zoom und Pan Event Listener
  techTreeSvg.addEventListener('wheel', handleZoom, { passive: false });
  techTreeSvg.addEventListener('pointerdown', startPan);
  techTreeSvg.addEventListener('pointermove', pan);
  techTreeSvg.addEventListener('pointerup', endPan);
  techTreeSvg.addEventListener('pointercancel', endPan);
  techTreeSvg.addEventListener('pointerleave', endPan);
  techTreeSvg.style.touchAction = 'none';

  // Initiale Kategorie setzen
  switchCategory('produktion');
}

function handleZoom(e) {
  e.preventDefault();

  // Mausposition relativ zum SVG
  const rect = techTreeSvg.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Alte Zoomstufe
  const oldZoom = techTreeZoom;

  // Neue Zoomstufe berechnen
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  techTreeZoom *= zoomFactor;
  techTreeZoom = Math.max(0.1, Math.min(5, techTreeZoom));

  // Pan anpassen, damit Zoom zur Mausposition erfolgt
  const scaleChange = techTreeZoom / oldZoom;
  techTreePanX = mouseX - (mouseX - techTreePanX) * scaleChange;
  techTreePanY = mouseY - (mouseY - techTreePanY) * scaleChange;

  updateTransform();
}

function getPointerCoords(e) {
  if (e.touches && e.touches.length) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function startPan(e) {
  const coords = getPointerCoords(e);
  isDragging = true;
  dragStartX = coords.x - techTreePanX;
  dragStartY = coords.y - techTreePanY;
  if (e.cancelable) e.preventDefault();
}

function pan(e) {
  if (!isDragging) return;
  const coords = getPointerCoords(e);
  techTreePanX = coords.x - dragStartX;
  techTreePanY = coords.y - dragStartY;
  updateTransform();
  if (e.cancelable) e.preventDefault();
}

function endPan() {
  isDragging = false;
}

function updateTransform() {
  const g = techTreeSvg.querySelector('g');
  if (g) {
    g.setAttribute('transform', `translate(${techTreePanX}, ${techTreePanY}) scale(${techTreeZoom})`);
  }
}

function switchCategory(category) {
  currentCategory = category;
  // Tabs aktualisieren
  document.querySelectorAll('.tech-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  const activeTab = document.querySelector(`[data-category="${category}"]`);
  if (activeTab) {
    activeTab.classList.add('active');
  }
  renderTechTree();
}

function showTooltip(tech, x, y) {
  if (!tooltipElement) return;

  let status = "Verfügbar";
  let statusColor = "#2196F3";
  if (istErforscht(tech.id)) {
    status = "✅ Erforscht";
    statusColor = "#4CAF50";
  } else if (aktive_forschung && aktive_forschung.id === tech.id) {
    status = "⏳ In Forschung";
    statusColor = "#FF9800";
  } else if (!forschungsBedingungErfuellt(tech)) {
    status = "🔒 Gesperrt";
    statusColor = "#666";
  }

  let effektText = "Kein Effekt";
  let effektDetails = "";
  if (tech.effekt) {
    switch (tech.effekt.typ) {
      case "freischalten":
        effektText = `🆕 Neue Maschine`;
        effektDetails = `Ermöglicht den Bau von ${tech.effekt.was}`;
        break;
      case "linienBonus":
        effektText = `⚙️ Produktionsbonus`;
        effektDetails = `+${Math.round((tech.effekt.wert - 1) * 100)}% Effizienz für ${tech.effekt.linie}-Maschinen`;
        break;
      case "kritChance":
        effektText = `🎯 Kritische Produktion`;
        effektDetails = `${tech.effekt.chance * 100}% Chance auf ${tech.effekt.multiplikator}x Produktion`;
        break;
      case "overclock":
        effektText = `🔥 Overclocking`;
        effektDetails = `Maschinen ${tech.effekt.speed}x schneller, aber ${tech.effekt.energie}x mehr Energie`;
        break;
      case "transportBonus":
        effektText = `🚚 Logistik`;
        effektDetails = `Transportgeschwindigkeit +${Math.round((tech.effekt.wert - 1) * 100)}%`;
        break;
      case "lagerKapazitaetBonus":
        effektText = `📦 Smart Storage`;
        effektDetails = `Lagerkapazität ${tech.effekt.wert}x effizienter`;
        break;
      case "recycling":
        effektText = `♻️ Recycling`;
        effektDetails = "Abfallprodukte können wiederverwertet werden";
        break;
      case "autoOptimierung":
        effektText = `🧠 KI-Steuerung`;
        effektDetails = "Maschinen wählen automatisch profitabelste Rezepte";
        break;
      case "energieNetzwerk":
        effektText = `⚡ Energienetzwerk`;
        effektDetails = "Energie wird effizient zwischen Maschinen verteilt";
        break;
      case "premiumChance":
        effektText = `💎 Premiumproduktion`;
        effektDetails = `${tech.effekt.chance * 100}% Chance auf ${tech.effekt.wert}x wertvollere Produkte`;
        break;
      default:
        effektText = tech.effekt.typ;
        effektDetails = JSON.stringify(tech.effekt);
    }
  }

  let bedingungText = "Keine Voraussetzung";
  if (tech.bedingung) {
    const bedingungen = getForschungsBedingungen(tech);
    bedingungText = bedingungen.map(id => {
      const f = FORSCHUNG.find(f => f.id === id);
      return f ? `${f.emoji} ${f.name}` : id;
    }).join(" + ");
  }

  let progressInfo = "";
  if (aktive_forschung && aktive_forschung.id === tech.id) {
    const prozent = Math.round((1 - aktive_forschung.rundenVerbleibend / tech.forschungszeit) * 100);
    progressInfo = `<div class='tech-tooltip-progress'>Fortschritt: ${prozent}% (${aktive_forschung.rundenVerbleibend} Runden verbleibend)</div>`;
  }

  tooltipElement.innerHTML = `
    <div class='tech-tooltip-header'>
      <div class='tech-tooltip-emoji'>${tech.emoji}</div>
      <div class='tech-tooltip-main'>
        <div class='tech-tooltip-title'>${tech.name}</div>
        <div class='tech-tooltip-status' style='color: ${statusColor}'>${status}</div>
      </div>
    </div>
    <div class='tech-tooltip-desc'>${tech.beschreibung}</div>
    ${progressInfo}
    <div class='tech-tooltip-section'>
      <div class='tech-tooltip-label'>💰 Kosten:</div>
      <div class='tech-tooltip-value'>${tech.kosten.toLocaleString()} €</div>
    </div>
    <div class='tech-tooltip-section'>
      <div class='tech-tooltip-label'>⏱️ Dauer:</div>
      <div class='tech-tooltip-value'>${tech.forschungszeit} Runden</div>
    </div>
    <div class='tech-tooltip-section'>
      <div class='tech-tooltip-label'>🔗 Voraussetzung:</div>
      <div class='tech-tooltip-value'>${bedingungText}</div>
    </div>
    <div class='tech-tooltip-effect-header'>⚡ Effekt:</div>
    <div class='tech-tooltip-effect-title'>${effektText}</div>
    <div class='tech-tooltip-effect-desc'>${effektDetails}</div>
  `;

  tooltipElement.style.left = (x + 15) + 'px';
  tooltipElement.style.top = (y - 15) + 'px';
  tooltipElement.style.display = 'block';
}

function hideTooltip() {
  if (tooltipElement) tooltipElement.style.display = 'none';
}

function renderTechTree() {
  if (!techTreeSvg) return;

  // Filter nach Kategorie
  let filteredForschung = FORSCHUNG;
  if (currentCategory !== 'all') {
    filteredForschung = FORSCHUNG.filter(f => f.kategorie === currentCategory);
  }

  // Kategorie-Farben
  const kategorieFarben = {
    'produktion': getCategoryColor('produktion'),
    'wirtschaft': getCategoryColor('wirtschaft'),
    'automation': getCategoryColor('automation'),
    'maschinen': getCategoryColor('maschinen'),
    'gebaeude': getCategoryColor('gebaeude'),
    'logistik': getCategoryColor('logistik')
  };

  // Berechne Positionen
  const nodeSpacingX = 250;
  const nodeSpacingY = 180;
  const categorySpacing = 300;

  let positions = {};
  let currentY = 100;

  // Gruppiere nach Kategorie
  const kategorien = {};
  filteredForschung.forEach(f => {
    if (!kategorien[f.kategorie]) kategorien[f.kategorie] = [];
    kategorien[f.kategorie].push(f);
  });

  Object.keys(kategorien).forEach(kat => {
    const techs = kategorien[kat];
    // Sortiere nach Spalte
    techs.sort((a, b) => (a.position?.spalte || 0) - (b.position?.spalte || 0));

    let maxRow = 0;
    techs.forEach(tech => {
      const col = tech.position?.spalte || 0;
      const row = tech.position?.reihe || 0;
      positions[tech.id] = {
        x: 150 + col * nodeSpacingX,
        y: currentY + row * nodeSpacingY,
        kategorie: kat
      };
      maxRow = Math.max(maxRow, row);
    });
    currentY += (maxRow + 1) * nodeSpacingY + categorySpacing;
  });

  // SVG Inhalt leeren
  techTreeSvg.innerHTML = '';

  // Hauptgruppe für Transform
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${techTreePanX}, ${techTreePanY}) scale(${techTreeZoom})`);
  techTreeSvg.appendChild(g);

  // Linien zeichnen
  filteredForschung.forEach(tech => {
    const bedingungen = getForschungsBedingungen(tech);
    bedingungen.forEach(cond => {
      if (!positions[cond] || !positions[tech.id]) return;
      const from = positions[cond];
      const to = positions[tech.id];
      const isUnlocked = istErforscht(cond);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x + 50); // Mitte des Rechtecks (100x100)
      line.setAttribute('y1', from.y + 50);
      line.setAttribute('x2', to.x + 50);
      line.setAttribute('y2', to.y + 50);
      line.setAttribute('stroke', isUnlocked ? '#f59e0b' : '#666');
      line.setAttribute('stroke-width', '3');
      line.setAttribute('marker-end', `url(#arrowhead-${isUnlocked ? 'green' : 'gray'})`);
      g.appendChild(line);
    });
  });

  // Nodes zeichnen
  filteredForschung.forEach(tech => {
    const pos = positions[tech.id];
    if (!pos) return;

    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodeGroup.setAttribute('class', 'tech-node');
    nodeGroup.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

    // Rechteck für Node (statt Kreis)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', 0);
    rect.setAttribute('y', 0);
    rect.setAttribute('width', 100);
    rect.setAttribute('height', 100);
    rect.setAttribute('rx', 8); // Abgerundete Ecken
    rect.setAttribute('fill', getNodeColor(tech));
    rect.setAttribute('stroke', kategorieFarben[tech.kategorie] || '#666');
    rect.setAttribute('stroke-width', '3');
    nodeGroup.appendChild(rect);

    // Emoji
    const emoji = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    emoji.setAttribute('x', 50);
    emoji.setAttribute('y', 35);
    emoji.setAttribute('text-anchor', 'middle');
    emoji.setAttribute('font-size', '24px');
    emoji.textContent = tech.emoji;
    nodeGroup.appendChild(emoji);

    // Name
    const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    name.setAttribute('x', 50);
    name.setAttribute('y', 60);
    name.setAttribute('text-anchor', 'middle');
    name.setAttribute('font-size', '12px');
    name.setAttribute('fill', '#fff');
    name.setAttribute('font-weight', 'bold');
    name.textContent = tech.name;
    nodeGroup.appendChild(name);

    // Kosten
    const kosten = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    kosten.setAttribute('x', 50);
    kosten.setAttribute('y', 80);
    kosten.setAttribute('text-anchor', 'middle');
    kosten.setAttribute('font-size', '10px');
    kosten.setAttribute('fill', '#ccc');
    kosten.textContent = `${tech.kosten.toLocaleString()}€`;
    nodeGroup.appendChild(kosten);

    // Fortschritt für aktive Forschung
    if (aktive_forschung && aktive_forschung.id === tech.id) {
      const progressRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const prozent = (1 - aktive_forschung.rundenVerbleibend / tech.forschungszeit) * 100;
      progressRect.setAttribute('x', 0);
      progressRect.setAttribute('y', 85);
      progressRect.setAttribute('width', (prozent / 100) * 100);
      progressRect.setAttribute('height', 8);
      progressRect.setAttribute('fill', '#FFD700');
      progressRect.setAttribute('rx', 4);
      nodeGroup.appendChild(progressRect);

      // Runden Text
      const runden = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      runden.setAttribute('x', 50);
      runden.setAttribute('y', 95);
      runden.setAttribute('text-anchor', 'middle');
      runden.setAttribute('font-size', '10px');
      runden.setAttribute('fill', '#FFD700');
      runden.setAttribute('font-weight', 'bold');
      runden.textContent = aktive_forschung.rundenVerbleibend + ' R';
      nodeGroup.appendChild(runden);
    }

    // Hover Events für Tooltip
    nodeGroup.addEventListener('mouseenter', (e) => {
      const rect = techTreeSvg.getBoundingClientRect();
      showTooltip(tech, e.clientX - rect.left, e.clientY - rect.top);
    });
    nodeGroup.addEventListener('mouseleave', hideTooltip);

    // Click Event
    nodeGroup.addEventListener('click', () => forschungStarten(tech.id));
    nodeGroup.style.cursor = 'pointer';

    g.appendChild(nodeGroup);
  });

  // Pfeil-Marker definieren
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // Grauer Pfeil
  const markerGray = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  markerGray.setAttribute('id', 'arrowhead-gray');
  markerGray.setAttribute('markerWidth', '12');
  markerGray.setAttribute('markerHeight', '9');
  markerGray.setAttribute('refX', '11');
  markerGray.setAttribute('refY', '4.5');
  markerGray.setAttribute('orient', 'auto');
  const polygonGray = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygonGray.setAttribute('points', '0 0, 12 4.5, 0 9');
  polygonGray.setAttribute('fill', '#666');
  markerGray.appendChild(polygonGray);
  defs.appendChild(markerGray);

  // Grüner Pfeil (jetzt Gelb)
  const markerGreen = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  markerGreen.setAttribute('id', 'arrowhead-green');
  markerGreen.setAttribute('markerWidth', '12');
  markerGreen.setAttribute('markerHeight', '9');
  markerGreen.setAttribute('refX', '11');
  markerGreen.setAttribute('refY', '4.5');
  markerGreen.setAttribute('orient', 'auto');
  const polygonGreen = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygonGreen.setAttribute('points', '0 0, 12 4.5, 0 9');
  polygonGreen.setAttribute('fill', '#f59e0b'); // Gelb statt Grün
  markerGreen.appendChild(polygonGreen);
  defs.appendChild(markerGreen);

  techTreeSvg.insertBefore(defs, g);

  // Automatisch zoomen und zentrieren
  autoFit();
}

function autoFit() {
  if (!techTreeSvg) return;

  // Berechne die Grenzen aller Nodes
  const nodes = techTreeSvg.querySelectorAll('.tech-node');
  if (nodes.length === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  nodes.forEach(node => {
    const transform = node.getAttribute('transform');
    const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (match) {
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + 100); // Node width
      maxY = Math.max(maxY, y + 100); // Node height
    }
  });

  // Container-Größe
  const container = techTreeSvg.parentElement;
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;

  // Berechne benötigte Zoomstufe
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const scaleX = containerWidth / contentWidth;
  const scaleY = containerHeight / contentHeight;
  const scale = Math.min(scaleX, scaleY) * 0.9; // 90% für etwas Abstand

  // Begrenze Zoom
  techTreeZoom = Math.max(0.1, Math.min(2, scale)); // Max 2x zoom out

  // Zentriere den Inhalt
  const contentCenterX = (minX + maxX) / 2;
  const contentCenterY = (minY + maxY) / 2;
  const containerCenterX = containerWidth / 2;
  const containerCenterY = containerHeight / 2;

  techTreePanX = containerCenterX - contentCenterX * techTreeZoom;
  techTreePanY = containerCenterY - contentCenterY * techTreeZoom;

  updateTransform();
}

function getNodeColor(tech) {
  if (istErforscht(tech.id)) return '#f59e0b'; // Gelb für erforscht (wie Geld)
  if (aktive_forschung && aktive_forschung.id === tech.id) return '#FF9800'; // Orange für aktiv
  if (!forschungsBedingungErfuellt(tech)) return '#666'; // Grau für gesperrt
  return '#2196F3'; // Blau für verfügbar
}

// Baut den kompletten Labor-Screen auf
function laborAnzeigenAktualisieren() {
  let bereich = document.getElementById("labor-bereich");
  if (!bereich) return;

  let html = "";

  // Aktive Forschung Banner oben
  if (aktive_forschung) {
    let forschung = FORSCHUNG.find(f => f.id === aktive_forschung.id);
    let prozent = Math.round((1 - aktive_forschung.rundenVerbleibend / forschung.forschungszeit) * 100);
    html +=
      "<div class='labor-aktiv-banner'>" +
        "<div class='labor-aktiv-links'>" +
          "<div class='labor-aktiv-titel'>🔬 AKTIVE FORSCHUNG</div>" +
          "<div class='labor-aktiv-name'>" + forschung.emoji + " " + forschung.name + "</div>" +
        "</div>" +
        "<div class='labor-aktiv-rechts'>" +
          "<div class='labor-aktiv-prozent'>" + prozent + "%</div>" +
          "<div class='labor-aktiv-runden'>" + aktive_forschung.rundenVerbleibend + " Runden</div>" +
        "</div>" +
      "</div>" +
      "<div class='labor-aktiv-balken'>" +
        "<div class='labor-aktiv-balken-fill' style='width:" + prozent + "%'></div>" +
      "</div>";
  }

  // Kategorie-Tabs (werden jetzt in initTechTree erstellt)
  // html += "<div class='labor-baum-titel'>Forschungsbaum</div>";
  // html += "<div class='tech-category-tabs'>";
  // const kategorien = ['produktion', 'wirtschaft', 'automation', 'material', 'logistik'];
  // const kategorieNamen = {
  //   'produktion': '⚙️ Produktion',
  //   'wirtschaft': '💰 Wirtschaft',
  //   'automation': '🤖 Automation',
  //   'material': '🧪 Material',
  //   'logistik': '🚚 Logistik'
  // };
  // kategorien.forEach(kat => {
  //   const isActive = currentCategory === kat;
  //   html += `<button class='tech-tab${isActive ? ' active' : ''}' onclick='switchCategory("${kat}")'>${kategorieNamen[kat]}</button>`;
  // });
  // html += "</div>";

  const totalForschung = FORSCHUNG.length;
  const abgeschlossen = erforschte_technologien.length;
  const offen = totalForschung - abgeschlossen;

  html += "<div class='tech-summary-bar'>" +
            "<div class='tech-summary-item'>🔬 Offen: <strong>" + offen + "</strong></div>" +
            "<div class='tech-summary-item'>✅ Erforscht: <strong>" + abgeschlossen + "</strong> / " + totalForschung + "</div>" +
          "</div>";
  html += "<div id='tech-tree-container' class='tech-tree-container'></div>";

  bereich.innerHTML = html;

  // Tech-Tree initialisieren
  setTimeout(initTechTree, 100); // Warte bis DOM ready
}