import './styles.css';
import { Game } from './core/Game';

const canvas = document.getElementById('viewport');
if (canvas instanceof HTMLCanvasElement) {
  const game = new Game(canvas);
  // Automated play-tests build with VITE_EXPOSE_GAME=1; normal builds drop this branch entirely.
  if (import.meta.env.VITE_EXPOSE_GAME === '1') (window as unknown as { killhouse: Game }).killhouse = game;
  void game.init();
}
