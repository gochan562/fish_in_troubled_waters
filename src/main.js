import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
game.start();

// Debug handle (harmless in production, invaluable for inspection).
window.__game = game;

// Graceful cleanup on page unload.
window.addEventListener('pagehide', () => game.dispose());
