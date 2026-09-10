import { FlappyBirdLoader } from '@/components/games/FlappyBirdLoader';
import { MarketMatchLoader } from '@/components/games/MarketMatchLoader';
import { useQolStore } from '@/store/useQolStore';

export function LoadingGame() {
  const enabled = useQolStore((state) => state.loadingGamesEnabled);
  const game = useQolStore((state) => state.loadingGame);
  if (!enabled) return null;
  return game === 'market-match' ? <MarketMatchLoader /> : <FlappyBirdLoader />;
}

