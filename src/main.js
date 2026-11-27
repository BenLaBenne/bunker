// src/main.js — Point d'entrée client : session → écran auth ou lobby,
// scène de jeu temps réel, panneau admin, enregistrement du Service Worker.
import { Screens } from './ui/Screens.js';
import { GameScene } from './gameplay/GameScene.js';
import { AdminPanel } from './admin/AdminPanel.js';
import { NetClient } from './net/NetClient.js';
import { state, loadSession, loadMeta, loadInventory } from './ui/state.js';
import { setLang } from './ui/i18n.js';
import { toast } from './ui/dom.js';
import { api } from './ui/api.js';
import { audio } from './audio/AudioManager.js';

const appRoot = document.getElementById('app');
let screens = null;
let adminPanel = null;
let gameScene = null;
const net = new NetClient();
window.__net = net;

function boot() {
  const bootScreen = document.getElementById('boot-screen');
  if (bootScreen) bootScreen.remove();
}

async function showLobby(tab) {
  if (gameScene) { gameScene = null; }
  if (adminPanel) { adminPanel = null; }
  screens = screens || new Screens(appRoot, {
    onPlay: () => startGame(),
    onAdmin: () => showAdmin(),
    onLogout: () => { state.user = null; screens.showAuth(); }
  });
  clearRoot();
  screens.showLobby(tab);
  applyAudio();
}

function showAdmin() {
  clearRoot();
  adminPanel = new AdminPanel(appRoot, { onExit: () => showLobby('play') });
  adminPanel.show('players');
}

function clearRoot() {
  // détruit les scènes existantes (canvas pixi, overlays)
  for (const child of [...appRoot.children]) {
    if (child.id === 'toast-zone') continue;
    child.remove();
  }
}

async function startGame(opts = {}) {
  clearRoot();
  gameScene = new GameScene(appRoot, net, {
    mapId: state.currentMapId,
    roomCode: opts.roomCode || null,
    onExit: () => { gameScene = null; showLobby('play'); }
  });
  await loadInventory();
  gameScene.start();
}

// Invitations de match via WS (ami → rejoindre la même salle)
net.on('notify', (msg) => {
  if (msg.type === 'match_invite') {
    toast(`🎮 ${msg.from} vous invite en partie — bouton Jouer pour rejoindre`);
    window.__pendingInvite = msg.roomId;
    // rejoindre directement si on est sur le lobby
    if (!gameScene && screens) {
      startGame({ roomCode: msg.roomId });
    }
  } else if (msg.type === 'friend_request') {
    toast(`✉ ${msg.from} vous a envoyé une demande d'ami`);
  } else if (msg.type === 'gift_received') {
    toast('🎁 Nouveau cadeau disponible !', 'rew');
    audio.play('notification');
  } else if (msg.type === 'clan_invite') {
    toast(`🛡 ${msg.from} vous invite dans le clan ${msg.clan}`);
  } else if (msg.type === 'profile_updated') {
    refreshSilently();
  }
});

async function refreshSilently() {
  try {
    const d = await api.get('/api/me');
    state.user = d.user;
  } catch { /* déconnecté */ }
}

function applyAudio() {
  audio.setVolumes(state.settings.master, state.settings.music, state.settings.sfx);
  audio.setSoundConfig(state.meta?.sounds || []);
}

async function main() {
  try {
    const logged = await loadSession();
    screens = new Screens(appRoot, {
      onPlay: () => startGame(),
      onAdmin: () => showAdmin(),
      onLogout: () => { state.user = null; screens.showAuth(); }
    });
    if (logged) {
      await loadMeta();
      await loadInventory();
      audio.setSoundConfig(state.meta?.sounds || []);
      boot();
      // reprise d'invitation en attente (retour depuis une notification)
      const urlParams = new URLSearchParams(location.search);
      const roomCode = urlParams.get('join');
      if (roomCode) startGame({ roomCode });
      else showLobby('play');
    } else {
      boot();
      clearRoot();
      screens.showAuth();
    }
  } catch (err) {
    console.error(err);
    boot();
    toast('Erreur de connexion au serveur', 'error');
  }

  // Service Worker (PWA)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('🔄 ' + (state.user ? 'Nouvelle version — rechargez' : 'Update available — reload'));
          }
        });
      });
    }).catch(() => { /* PWA indisponible (http local) */ });
  }

  // reconnexion WS → retour lobby si en jeu
  net.on('open', () => {
    if (gameScene && !gameScene.snap) { /* initialisation en cours */ }
  });
  net.on('close', () => {
    if (gameScene && !gameScene.ended) toast('🔌 ' + 'Reconnexion…');
  });
}

// Empêcher le scroll/zoom mobile parasite
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

main();
