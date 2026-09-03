// Collaudo finale Rebu AI: simulazione asta completa via HTTP come utente reale.
// Uso: server prod attivo, poi `node scripts/rehearsal.mjs [baseUrl]`.
// Verifica: rose 3P/8D/8C/6A, crediti mai negativi, zero duplicati, export valido,
// 20 chat con contratto valido e <5s. P per squadra max 3 (vincolo rosa): quorum 5/ ruolo
// applicato a D/C/A, P completi a 3.
import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3118";
const DESK = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RebuDesk";
const MOB = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) RebuMobile";
const rep = { checks: [], ok: true };
let cookie = "";
let minResidui = 500;
const t = (ms: number) => new Promise((r) => setTimeout(r, ms));
void t;

async function api(method, path, body, ua = DESK) {
  const r = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie, "User-Agent": ua },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
function check(nome, cond, det = "") {
  rep.checks.push({ nome, ok: !!cond, det });
  if (!cond) { rep.ok = false; console.log("  ✗", nome, det); }
  else console.log("  ✓", nome, det);
}

console.log("== Rehearsal Rebu AI ==");
await api("POST", "/api/auth/login", { code: process.env.REBU_ACCESS_CODE ?? "rebu-dev-001" });

const NOMI = ["Rebu", "Ari", "Bia", "Cio", "Dani", "Eli", "Fede", "Gio"];
let s = await api("POST", "/api/auction/setup", { managers: NOMI.map((n, i) => ({ nome: n, nome_squadra: n + " FC", note: "", is_owner: i === 0 })) });
check("setup 8 squadre", s.j.ok, JSON.stringify(s.j.data ?? s.j));
const SID = s.j.data.sessionId;
let ver = 0;
s = await api("POST", "/api/auction/start", { sessionId: SID, expected: ver });
check("avvio congela dataset", s.j.ok); ver = s.j.data.versione;
const IDS = (await stato()).managers.map((m) => m.id); // id reali (niente hardcode)

const db = new DatabaseSync("rebu-ai/.data/rebu.db", { readOnly: true });
const DS = db.prepare("SELECT value AS v FROM settings WHERE key='dataset_attivo'").get().v;
const pool = {};
for (const r of ["P", "D", "C", "A"]) {
  pool[r] = db.prepare("SELECT official_id AS o FROM players WHERE dataset_version=? AND ruolo_classic=? ORDER BY qt_a DESC").all(DS, r).map((x) => x.o);
}
const used = new Set();
const nextOf = (r) => { const o = pool[r].find((x) => !used.has(x)); used.add(o); return o; };
async function stato() {
  const r = await api("GET", `/api/auction/state`);
  const st = r.j.state;
  ver = st.session.versione;
  for (const m of st.managers) { minResidui = Math.min(minResidui, m.residui); if (m.residui < 0) check("crediti mai negativi", false, m.nome); }
  return st;
}
async function vendi(oid, midx, prezzo, ua) {
  const mid = IDS[midx - 1];
  let r = await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oid, expected: ver }, ua);
  if (!r.j.ok) { check("nomina " + oid, false, JSON.stringify(r.j)); return; }
  ver = r.j.data.versione;
  r = await api("POST", "/api/auction/sell", { sessionId: SID, officialId: oid, managerId: mid, prezzo, idem: `reh-${oid}-${mid}-${prezzo}-${Date.now()}`, expected: ver }, ua);
  if (!r.j.ok || r.j.data.duplicato) { check(`vendi ${oid}->${mid}`, false, JSON.stringify(r.j)); return; }
  ver = r.j.data.versione;
}
const QUOTA = { P: 3, D: 8, C: 8, A: 6 };
const DOMANDE = ["fino a quanto?", "lo prendo o passo?", "vale la pena rilanciare?", "che faccio con questo chiamato?"];
let chatN = 0, chatOk = 0, chatMaxMs = 0, venduti = 0;

// --- prove speciali PRIMA del riempimento (a rose vuote) ---
const oidX = nextOf("A");
await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oidX, expected: ver });
let st0 = await stato();
await api("POST", "/api/auction/sell", { sessionId: SID, officialId: oidX, managerId: IDS[0], prezzo: 7, idem: "reh-undo1", expected: ver });
st0 = await stato();
const prima = st0.managers[0].residui;
await api("POST", "/api/auction/undo", { sessionId: SID, expected: ver });
st0 = await stato();
check("undo vendita ripristina crediti", st0.managers[0].residui === prima + 7, `${prima}→${st0.managers[0].residui}`);
await vendi(oidX, 2, 7, DESK); // team2: questa è la sua 1ª A (quota A team2 ridotta a 5)
const oidY = nextOf("A");
await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oidY, expected: ver });
await api("POST", "/api/auction/undo", { sessionId: SID });
let st = await stato();
check("undo nomina pulisce chiamato", st.nomination === null || st.nomination === undefined);
const oidZ = nextOf("A");
await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oidZ, expected: ver });
await api("POST", "/api/auction/unsold", { sessionId: SID, officialId: oidZ });
await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oidZ });
st = await stato();
check("invenduto richiamabile", st.nomination?.o === oidZ);
await api("POST", "/api/auction/unsold", { sessionId: SID, officialId: oidZ });
await api("POST", "/api/auction/control", { sessionId: SID, action: "pause" });
const blocc = await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oidY });
check("pausa blocca nomine", !blocc.j.ok && blocc.j.code === "STATO");
await api("POST", "/api/auction/control", { sessionId: SID, action: "resume" });
st = await stato();
check("ripresa in LIVE", st.session.stato === "LIVE");

for (const ruolo of ["P", "D", "C", "A"]) {
  for (let slot = 0; slot < QUOTA[ruolo]; slot++) {
    for (let m = 1; m <= 8; m++) {
      if (ruolo === "A" && m === 2 && slot === QUOTA.A - 1) continue; // team2 ha già oidX come 6ª A
      const oid = nextOf(ruolo);
      const ua = (chatN >= 10 && chatN < 20) || venduti % 7 === 3 ? MOB : DESK;
      // ogni ~10 acquisti: chat sul nominato prima di venderlo
      if (venduti % 10 === 5 && chatN < 20) {
        const rn = await api("POST", "/api/auction/nominate", { sessionId: SID, officialId: oid, expected: ver }, ua);
        ver = rn.j.data.versione;
        const q = `${NOMI[m - 1]}: ${DOMANDE[chatN % 4]}`;
        const t0 = Date.now();
        const c = await api("POST", "/api/agent/chat", { domanda: q }, chatN >= 10 ? MOB : DESK);
        const ms = Date.now() - t0;
        chatN++; chatMaxMs = Math.max(chatMaxMs, ms);
        const k = c.j.data?.contract;
        const valido = k && ["COMPRA", "RILANCIA_FINO_A", "PASSA"].includes(k.azione) && Number.isInteger(k.prezzoMassimoConsigliato)
          && ["BASSA", "MEDIA", "ALTA"].includes(k.confidenza) && k.motivazioni.length <= 3 && k.fonti.length > 0;
        if (valido && ms < 5000) chatOk++;
        check(`chat ${chatN} contratto+latenza`, valido && ms < 5000, `${ms}ms ${k?.azione ?? "?"} ${k?.prezzoMassimoConsigliato ?? "?"}`);
        const rs = await api("POST", "/api/auction/sell", { sessionId: SID, officialId: oid, managerId: IDS[m - 1], prezzo: 1, idem: `reh-c${chatN}`, expected: ver }, ua);
        ver = rs.j.data.versione; venduti++;
      } else {
        // stella: primo C e primo A di ogni squadra a prezzo alto (entro maxSpesa)
        let prezzo = 1;
        if ((ruolo === "C" || ruolo === "A") && slot === 0) {
          const st0 = await stato();
          prezzo = Math.min(20 + m, st0.managers[m - 1].maxSpesa);
        }
        await vendi(oid, m, prezzo, ua); venduti++;
      }
      if (venduti % 40 === 0) await stato();
    }
  }
  console.log(`reparto ${ruolo} completato, venduti=${venduti}`);
}
// verifiche finali rose
st = await stato();
let dup = false;
const visti = new Set();
for (const m of st.managers) {
  const c = { P: 0, D: 0, C: 0, A: 0 };
  for (const g of m.rosa) {
    c[g.ruolo]++;
    const k = `${g.nome}|${g.squadra}`;
    if (visti.has(k)) dup = true;
    visti.add(k);
  }
  if (!(c.P === 3 && c.D === 8 && c.C === 8 && c.A === 6)) check("rosa completa " + m.nome, false, JSON.stringify(c));
}
check("8 rose 3/8/8/6", st.managers.every((m) => m.rosa.length === 25), `acquisti=${st.acquisti}`);
check("nessun doppione tra rose", !dup);
check("crediti mai negativi (min osservato)", minResidui >= 0, `min=${minResidui}`);
check(`chat valide 20/20 sotto 5s (max ${chatMaxMs}ms)`, chatOk === 20 && chatN === 20, `${chatOk}/${chatN}`);

// conclusione + export valido
await api("POST", "/api/auction/control", { sessionId: SID, action: "complete" });
const csv = await fetch(`${BASE}/api/exports/csv?sessionId=${SID}`, { headers: { Cookie: cookie } });
const txt = await csv.text();
const hasBOM = txt.charCodeAt(0) === 0xfeff;
const righe = txt.split("\n");
const blocchi = txt.split("$,$,$\n").slice(1);
let expOk = csv.status === 200 && !hasBOM && txt.endsWith("\n") && !txt.endsWith("\n\n") && blocchi.length === 8;
const ids = new Set(); let roseOk = true;
for (const b of blocchi) {
  const rr = b.trim().split("\n");
  if (rr.length !== 25) roseOk = false;
  for (const r of rr) {
    const [nome, id, prz] = r.split(",");
    if (!nome || !Number.isInteger(+id) || !Number.isInteger(+prz)) roseOk = false;
    if (ids.has(+id)) roseOk = false;
    ids.add(+id);
  }
}
check("CSV valido template (8 blocchi, 25 righe, id unici, no BOM)", expOk && roseOk, `righe=${righe.length - 1} squadre=${blocchi.length}`);
writeFileSync("/tmp/rebu-finale.csv", txt);
writeFileSync("/tmp/rehearsal-report.json", JSON.stringify(rep, null, 1));
console.log(rep.ok ? "REHEARSAL OK" : "REHEARSAL FALLITO");
process.exit(rep.ok ? 0 : 1);
