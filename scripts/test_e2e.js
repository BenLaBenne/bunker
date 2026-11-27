// scripts/test_e2e.js — Test end-to-end : inscription, connexion, session cookie,
// boutique, amis, clan, pass, quêtes, cadeaux, admin, puis partie WebSocket avec bots.
// Usage : node scripts/test_e2e.js [baseUrl]
import { getCookieJar } from './cookie_jar.js';

const BASE = process.argv[2] || 'http://localhost:3000';
let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name} ${extra}`); failures++; }
}

const jar1 = getCookieJar();
const jar2 = getCookieJar();
const jar3 = getCookieJar();

async function req(jar, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jar.header()) },
    body: body ? JSON.stringify(body) : undefined
  });
  jar.absorb(res);
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

const stamp = Date.now().toString(36);
const U1 = 'test_a_' + stamp.slice(-4);
const U2 = 'test_b_' + stamp.slice(-4);
const U3 = 'test_c_' + stamp.slice(-4);

async function main() {
  console.log('== 1. Santé & méta ==');
  const health = await req(jar1, 'GET', '/api/health');
  check('health ok', health.status === 200 && health.data.ok);
  const meta = await req(jar1, 'GET', '/api/meta');
  check('meta fighters>=5', (meta.data.fighters || []).length >= 5);
  check('meta maps>=1', (meta.data.maps || []).length >= 1);
  check('meta sounds>=12', (meta.data.sounds || []).length >= 12);

  console.log('== 2. Auth ==');
  const badReg = await req(jar1, 'POST', '/api/auth/register', { uname: 'x', pword: 'weak' });
  check('register rejeté (validation)', badReg.status === 400);
  const reg1 = await req(jar1, 'POST', '/api/auth/register', { uname: U1, pword: 'Passw0rd123' });
  check(`register ${U1}`, reg1.status === 200 && reg1.data.user);
  check('premier inscrit = admin', reg1.data.user.is_admin === true, `is_admin=${reg1.data.user?.is_admin}`);
  const reg2 = await req(jar2, 'POST', '/api/auth/register', { uname: U2, pword: 'Passw0rd123' });
  check(`register ${U2}`, reg2.status === 200 && reg2.data.user.is_admin === false);
  await req(jar3, 'POST', '/api/auth/register', { uname: U3, pword: 'Passw0rd123' });
  const dup = await req(jar3, 'POST', '/api/auth/register', { uname: U1, pword: 'Passw0rd123' });
  check('pseudo dupliqué rejeté', dup.status === 409);
  const me = await req(jar1, 'GET', '/api/me');
  check('me ok', me.data.user?.uname === U1);
  const badLogin = await req(jar1, 'POST', '/api/auth/login', { uname: U1, pword: 'wrongpass1' });
  check('mauvais mot de passe rejeté', badLogin.status === 401);

  console.log('== 3. Sécurité admin ==');
  const adminDenied = await req(jar2, 'GET', '/api/admin/players');
  check('route admin refusée pour non-admin', adminDenied.status === 403);
  const adminOk = await req(jar1, 'GET', '/api/admin/players');
  check('route admin OK pour admin', adminOk.status === 200 && adminOk.data.players.length >= 3);

  console.log('== 4. Boutique & monnaies ==');
  const buy = await req(jar1, 'POST', '/api/shop/buy', { itemId: 'emote_gg' });
  check('achat emote', buy.status === 200);
  const inv = await req(jar1, 'GET', '/api/inventory');
  check('emote dans inventaire', inv.data.items?.some(i => i.type === 'emote' && i.id === 'emote_gg'));
  const poorBuy = await req(jar2, 'POST', '/api/fighters/buy', { fighterId: 'volt' });
  check('achat refusé si fonds insuffisants', poorBuy.status === 402, `status=${poorBuy.status}`);

  console.log('== 5. Amis ==');
  const me2 = await req(jar2, 'GET', '/api/me');
  const fr = await req(jar1, 'POST', '/api/friends/request', { uname: U2 });
  check('demande ami envoyée', fr.status === 200);
  const frList = await req(jar2, 'GET', '/api/friends');
  check('demande visible', frList.data.requests?.length >= 1);
  const frAccept = await req(jar2, 'POST', '/api/friends/respond', { requestId: frList.data.requests[0].id, accept: true });
  check('demande acceptée', frAccept.status === 200);
  const frFinal = await req(jar1, 'GET', '/api/friends');
  check('ami dans liste', frFinal.data.friends?.some(f => f.uname === U2));

  console.log('== 6. Clans ==');
  const clan = await req(jar1, 'POST', '/api/clans', { name: 'TestClan' + stamp.slice(-4), tag: 'TS' + stamp.slice(-2).toUpperCase(), emblem: '☢', color: '#7fff6a' });
  check('création clan', clan.status === 200, JSON.stringify(clan.data));
  const mine = await req(jar1, 'GET', '/api/clans/mine');
  check('clan owner', mine.data.clan?.my_role === 'leader');
  const chat = await req(jar1, 'POST', `/api/clans/${mine.data.clan.id}/chat`.replace('/api/clans', '/api'), );
  // le chat passe par ws ou endpoint ; ici simple vérif d'existence du clan
  const clans = await req(jar2, 'GET', '/api/clans');
  check('clan listé', clans.data.clans?.some(c => c.name.startsWith('TestClan')));

  console.log('== 7. Partie WebSocket (1 humain + bots) ==');
  const match = await runMatch(jar1, U1);
  check('init reçu (map 3 étages)', match.gotInit && match.mapFloors === 3);
  check('bots remplissent à 10', match.rosterSize === 10, `roster=${match.rosterSize}`);
  check('snapshots reçus', match.snapCount > 20, `count=${match.snapCount}`);
  check('autres entités visibles', match.othersSeen > 0);
  check('tâches partagées dans snap', match.tasksCount >= 9);
  check('match terminé', match.ended, `winnerType=${match.winnerType}`);
  check('résultats envoyés', match.resultsReceived);

  console.log('== 8. Résultats persistés ==');
  await new Promise(r => setTimeout(r, 1200));
  const meAfter = await req(jar1, 'GET', '/api/me');
  check('matches comptés', meAfter.data.user.matches >= 1, `matches=${meAfter.data.user?.matches}`);
  check('XP gagnée', meAfter.data.user.xp > 0, `xp=${meAfter.data.user?.xp}`);
  const matches = await req(jar1, 'GET', '/api/admin/matches');
  check('match en base', matches.data.matches?.length >= 1);

  console.log('== 9. Quêtes / Pass / Cadeaux / News ==');
  const quests = await req(jar1, 'GET', '/api/quests');
  check('quêtes chargées', quests.data.quests?.length >= 10);
  const progressQ = quests.data.quests.find(q => q.id === 'd_matches1');
  check('progression quête matches', progressQ && progressQ.progress >= 1, `progress=${progressQ?.progress}`);
  const pass = await req(jar1, 'GET', '/api/pass');
  check('pass 50 niveaux', pass.data.rewards?.length === 50);
  const claim1 = await req(jar1, 'POST', '/api/pass/claim', { level: 1 });
  check('claim pass niveau 1', claim1.status === 200 || claim1.status === 403, `status=${claim1.status}`);
  // cadeau admin → joueur 2
  const gift = await req(jar1, 'POST', '/api/admin/gifts', { title: 'Gift test', reward_type: 'coins', qty: 55, targets: 'all' });
  check('création cadeau', gift.status === 200);
  const gifts2 = await req(jar2, 'GET', '/api/gifts');
  check('cadeau visible par joueur', gifts2.data.gifts?.some(g => g.title === 'Gift test'));
  const claimG = await req(jar2, 'POST', '/api/gifts/claim', { giftId: gifts2.data.gifts[0].id });
  check('cadeau réclamé', claimG.status === 200);
  const claimG2 = await req(jar2, 'POST', '/api/gifts/claim', { giftId: gifts2.data.gifts[0].id });
  check('double réclamation refusée', claimG2.status === 409);
  // news
  const news = await req(jar1, 'POST', '/api/admin/news', { title: 'Test news', body: 'Contenu', published: true });
  check('news créée', news.status === 200);
  const newsList = await req(jar2, 'GET', '/api/news');
  check('news visible', newsList.data.news?.some(n => n.title === 'Test news'));

  console.log('== 10. Admin logs ==');
  const logs = await req(jar1, 'GET', '/api/admin/logs');
  check('logs enregistrés', logs.data.logs?.length >= 2, `logs=${logs.data.logs?.length}`);
  check('logs contiennent gift+news', logs.data.logs.some(l => l.action === 'gift_create') && logs.data.logs.some(l => l.action === 'news_create'));

  console.log('== 11. Sons admin (synthèse/fichier) ==');
  const sounds = await req(jar1, 'GET', '/api/admin/sounds');
  check('sons listés', sounds.data.sounds?.length >= 12);
  const sndUpd = await req(jar1, 'PUT', `/api/admin/sounds/${sounds.data.sounds[0].id}`, {
    params: { type: 'sine', freq: 600, freq2: 300, dur: 0.1, vol: 0.5 }
  });
  check('paramètres son modifiés', sndUpd.status === 200);

  console.log('== 12. Sécurité upload (data URL invalide) ==');
  const badTex = await req(jar1, 'POST', '/api/admin/textures', { data: 'data:image/png;base64,AAAA', name: 'bad' });
  check('upload invalide rejeté', badTex.status === 400);

  console.log('');
  if (failures === 0) {
    console.log('✅ TOUS LES TESTS PASSENT');
    process.exit(0);
  } else {
    console.error(`❌ ${failures} test(s) en échec`);
    process.exit(1);
  }
}

/* --------- partie WS --------- */
function runMatch(jar, uname) {
  return new Promise(async (resolve) => {
    const res = {
      gotInit: false, mapFloors: 0, rosterSize: 0, snapCount: 0,
      othersSeen: 0, tasksCount: 0, ended: false, winnerType: null, resultsReceived: false
    };
    // WebSocket avec cookie de session
    const wsModule = await import('ws');
    const ws = new wsModule.WebSocket(BASE.replace('http', 'ws') + '/ws', { headers: { Cookie: jar.header()['Cookie'] } });
    const timeout = setTimeout(() => { console.log('  [ws timeout après 150s]'); ws.close(); resolve(res); }, 150000);
    let attackTimer = null;

    ws.on('error', (e) => { console.log('  [ws error]', e.message); clearTimeout(timeout); resolve(res); });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.t === 'init') {
        res.gotInit = true;
        res.mapFloors = msg.map?.floors?.length || 0;
        res.rosterSize = (msg.roster || []).length;
        // dès l'init : attaque en continu + avancée
        attackTimer = setInterval(() => {
          ws.send(JSON.stringify({ t: 'input', mx: Math.random() * 2 - 1, my: Math.random() * 2 - 1, attack: true, interact: false, aimX: 1, aimY: 0 }));
        }, 100);
      } else if (msg.t === 'snap') {
        res.snapCount++;
        res.othersSeen = Math.max(res.othersSeen, (msg.players || []).length);
        res.tasksCount = (msg.tasks || []).length;
        // rester appuyé sur interact pour réparer quand une tâche est proche
        for (const ev of msg.events || []) {
          if (ev.type === 'kill' && ev.killerName === uname) res.kills = (res.kills || 0) + 1;
        }
      } else if (msg.t === 'match_end') {
        res.ended = true;
        res.winnerType = msg.winnerType;
        res.resultsReceived = !!msg.results;
        clearInterval(attackTimer);
        clearTimeout(timeout);
        ws.close();
        resolve(res);
      }
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'queue', mapId: 'bunker_a7' }));
    });
  });
}

main().catch(err => { console.error(err); process.exit(1); });
