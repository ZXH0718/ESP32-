// 游戏状态类型
export type GameState = 'idle' | 'playing' | 'paused' | 'gameover';

export type DinoState = 'running' | 'jumping' | 'doubleJumping' | 'ducking';

export interface Dino {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  state: DinoState;
  jumpCount: number;
  legFrame: number;
}

export type ObstacleType = 'cactus' | 'rock' | 'bird';

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: ObstacleType;
  passed: boolean;
  wingFrame?: number;
}

export interface Cloud {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameData {
  score: number;
  highScore: number;
  distance: number;
  speed: number;
  dino: Dino;
  obstacles: Obstacle[];
  clouds: Cloud[];
  particles: Particle[];
  frameCount: number;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

export type SoundType = 'jump' | 'doubleJump' | 'score' | 'hit' | 'gameover';
