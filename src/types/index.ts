// 游戏状态类型
export type GameState = 'idle' | 'playing' | 'paused' | 'gameover';

// 恐龙状态
export type DinoState = 'running' | 'jumping' | 'doubleJumping' | 'ducking';

// 恐龙位置和状态
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

// 障碍物类型
export type ObstacleType = 'cactus' | 'rock' | 'bird';

// 障碍物
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

// 云朵
export interface Cloud {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

// 粒子效果
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

// 游戏数据
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

// 主题设置
export type ThemeMode = 'auto' | 'light' | 'dark';

// 音效类型
export type SoundType = 'jump' | 'doubleJump' | 'score' | 'hit' | 'gameover';
