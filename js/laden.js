let MATERIALIEN     = [];
let REZEPTE         = [];
let MASCHINEN       = [];
let GEBAEUDE        = [];
let GRUNDSTUECKE    = [];
let FORSCHUNG       = [];
let AUFTRAEGE_VORLAGEN = [];

async function jsonLaden(pfad) {
  let antwort = await fetch(pfad);
  return await antwort.json();
}

async function alleDatenLaden() {
  MATERIALIEN        = await jsonLaden("data/materialien.json");
  REZEPTE            = await jsonLaden("data/rezepte.json");
  MASCHINEN          = await jsonLaden("data/maschinen.json");
  GEBAEUDE           = await jsonLaden("data/gebaeude.json");
  GRUNDSTUECKE       = await jsonLaden("data/grundstuecke.json");
  FORSCHUNG          = await jsonLaden("data/forschung.json");
  AUFTRAEGE_VORLAGEN = await jsonLaden("data/auftraege.json");
  SPIELMODI          = await jsonLaden("data/spielmodi.json");

  lagerInitialisieren();
  await ereignisseLaden();
  await hallenUpgradesLaden();
  if (typeof stadtratLaden === "function") await stadtratLaden();
  console.log("✅ Alles geladen — " + [MATERIALIEN,REZEPTE,MASCHINEN,GEBAEUDE,GRUNDSTUECKE,FORSCHUNG,AUFTRAEGE_VORLAGEN].map(function(a){return a.length}).join("/") + " Einträge");
}

function lagerInitialisieren() {
  for (let m of MATERIALIEN) {
    if (lager[m.id] === undefined) lager[m.id] = 0;
  }
}