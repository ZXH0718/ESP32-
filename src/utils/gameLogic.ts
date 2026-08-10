import { GAME_CONFIG } from '../constants';
import type { Dino, Obstacle, Cloud, Particle, ObstacleType } from '../types';

const {
  GROUND_HEIGHT,
  DINO_WIDTH,
  DINO_HEIGHT,
  GRAVITY,
  JUMP_FORCE,
  DOUBLE_JUMP_FORCE,
  OBSTACLE_MIN_WIDTH,
  OBSTACLE_MAX_WIDTH,
  OBSTACLE_MIN_HEIGHT,
  OBSTACLE_MAX_HEIGHT,
  OBSTACLE_MIN_GAP,
  OBSTACLE_MAX_GAP,
  INITIAL_SPEED,
  MAX_SPEED,
  SPEED_INCREMENT,
  CLOUD_SPEED,
  CLOUD_SPAWN_INTERVAL,
  BIRD_SPAWN_CHANCE,
  BIRD_HEIGHTS,
  BIRD_WIDTH,
  BIRD_HEIGHT,
} = GAME_CONFIG;

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 11);
};

export const createDino = (canvasWidth: number, canvasHeight: number): Dino => {
  return {
    x: 80,
    y: canvasHeight - GROUND_HEIGHT - DINO_HEIGHT,
    width: DINO_WIDTH,
    height: DINO_HEIGHT,
    velocityY: 0,
    state: 'running',
    jumpCount: 0,
    legFrame: 0,
  };
};

export const dinoJump = (dino: Dino): Dino => {
  if (dino.jumpCount === 0) {
    return {
      ...dino,
      velocityY: JUMP_FORCE,
      state: 'jumping',
      jumpCount: 1,
    };
  } else if (dino.jumpCount === 1 && dino.state !== 'ducking') {
    return {
      ...dino,
      velocityY: DOUBLE_JUMP_FORCE,
      state: 'doubleJumping',
      jumpCount: 2,
    };
  }
  return dino;
};

export const dinoDuck = (dino: Dino, isDucking: boolean): Dino => {
  if (isDucking && dino.jumpCount === 0) {
    return {
      ...dino,
      state: 'ducking',
      height: DINO_HEIGHT * 0.6,
    };
  } else if (!isDucking && dino.state === 'ducking') {
    return {
      ...dino,
      state: 'running',
      height: DINO_HEIGHT,
    };
  }
  return dino;
};

export const updateDino = (dino: Dino, canvasHeight: number, frameCount: number): Dino => {
  let newY = dino.y + dino.velocityY;
  let newVelocityY = dino.velocityY + GRAVITY;
  const groundY = canvasHeight - GROUND_HEIGHT - dino.height;
  
  let newState = dino.state;
  let newJumpCount = dino.jumpCount;
  
  if (newY >= groundY) {
    newY = groundY;
    newVelocityY = 0;
    newJumpCount = 0;
    if (dino.state !== 'ducking') {
      newState = 'running';
    }
  }
  
  return {
    ...dino,
    y: newY,
    velocityY: newVelocityY,
    state: newState,
    jumpCount: newJumpCount,
    legFrame: Math.floor(frameCount / 5) % 2,
  };
};

export const createObstacle = (canvasWidth: number, canvasHeight: number): Obstacle => {
  const random = Math.random();
  let type: ObstacleType;
  let width: number;
  let height: number;
  let y: number;
  
  const groundY = canvasHeight - GROUND_HEIGHT;
  
  if (random < BIRD_SPAWN_CHANCE) {
    type = 'bird';
    width = BIRD_WIDTH;
    height = BIRD_HEIGHT;
    y = groundY - BIRD_HEIGHTS[Math.floor(Math.random() * BIRD_HEIGHTS.length)];
  } else {
    type = random < 0.65 ? 'cactus' : 'rock';
    width = OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH);
    height = OBSTACLE_MIN_HEIGHT + Math.random() * (OBSTACLE_MAX_HEIGHT - OBSTACLE_MIN_HEIGHT);
    y = groundY - height;
  }
  
  return {
    id: generateId(),
    x: canvasWidth + 50,
    y,
    width,
    height,
    type,
    passed: false,
    wingFrame: type === 'bird' ? 0 : undefined,
  };
};

export const updateObstacles = (
  obstacles: Obstacle[],
  speed: number,
  canvasWidth: number,
  canvasHeight: number,
  frameCount: number
): Obstacle[] => {
  let updated = obstacles
    .map(obs => ({
      ...obs,
      x: obs.x - speed,
      wingFrame: obs.type === 'bird' ? Math.floor(frameCount / 8) % 2 : undefined,
    }))
    .filter(obs => obs.x + obs.width > -50);
  
  const lastObstacle = updated[updated.length - 1];
  const minGap = OBSTACLE_MIN_GAP - speed * 10;
  const maxGap = OBSTACLE_MAX_GAP - speed * 10;
  const gap = minGap + Math.random() * Math.max(0, maxGap - minGap);
  
  if (!lastObstacle || lastObstacle.x < canvasWidth - gap) {
    updated.push(createObstacle(canvasWidth, canvasHeight));
  }
  
  return updated;
};

export const createCloud = (canvasWidth: number): Cloud => {
  const width = 80 + Math.random() * 60;
  return {
    id: generateId(),
    x: canvasWidth + 50,
    y: 50 + Math.random() * 150,
    width,
    height: width * 0.5,
    speed: CLOUD_SPEED * (0.5 + Math.random() * 0.5),
  };
};

export const updateClouds = (
  clouds: Cloud[],
  speed: number,
  canvasWidth: number,
  frameCount: number
): Cloud[] => {
  let updated = clouds
    .map(cloud => ({
      ...cloud,
      x: cloud.x - cloud.speed - speed * 0.3,
    }))
    .filter(cloud => cloud.x + cloud.width > -50);
  
  if (frameCount % CLOUD_SPAWN_INTERVAL === 0 && Math.random() > 0.3) {
    updated.push(createCloud(canvasWidth));
  }
  
  return updated;
};

export const updateSpeed = (currentSpeed: number): number => {
  return Math.min(MAX_SPEED, currentSpeed + SPEED_INCREMENT);
};

export const checkCollision = (dino: Dino, obstacle: Obstacle): boolean => {
  const tolerance = 8;
  
  const dinoLeft = dino.x + tolerance;
  const dinoRight = dino.x + dino.width - tolerance;
  const dinoTop = dino.y + tolerance;
  const dinoBottom = dino.y + dino.height - tolerance;
  
  const obsLeft = obstacle.x + tolerance;
  const obsRight = obstacle.x + obstacle.width - tolerance;
  const obsTop = obstacle.y + tolerance;
  const obsBottom = obstacle.y + obstacle.height - tolerance;
  
  return (
    dinoLeft < obsRight &&
    dinoRight > obsLeft &&
    dinoTop < obsBottom &&
    dinoBottom > obsTop
  );
};

export const checkPassed = (dino: Dino, obstacles: Obstacle[]): Obstacle[] => {
  return obstacles.map(obs => {
    if (!obs.passed && obs.x + obs.width < dino.x) {
      return { ...obs, passed: true };
    }
    return obs;
  });
};

export const createParticles = (x: number, y: number, color: string, count: number = 10): Particle[] => {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 2 + Math.random() * 4;
    particles.push({
      id: generateId(),
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      maxLife: 30 + Math.random() * 20,
      color,
      size: 3 + Math.random() * 5,
    });
  }
  return particles;
};

export const updateParticles = (particles: Particle[]): Particle[] => {
  return particles
    .map(p => ({
      ...p,
      x: p.x + p.vx,
      y: p.y + p.vy,
      vy: p.vy + 0.1,
      life: p.life - 1 / p.maxLife,
      size: p.size * 0.98,
    }))
    .filter(p => p.life > 0);
};

export const initGameData = (canvasWidth: number, canvasHeight: number, highScore: number = 0) => {
  const clouds: Cloud[] = [];
  for (let i = 0; i < 3; i++) {
    clouds.push({
      ...createCloud(canvasWidth),
      x: Math.random() * canvasWidth,
    });
  }
  
  return {
    score: 0,
    highScore,
    distance: 0,
    speed: INITIAL_SPEED,
    dino: createDino(canvasWidth, canvasHeight),
    obstacles: [],
    clouds,
    particles: [],
    frameCount: 0,
  };
};

export default {
  createDino,
  dinoJump,
  dinoDuck,
  updateDino,
  createObstacle,
  updateObstacles,
  createCloud,
  updateClouds,
  updateSpeed,
  checkCollision,
  checkPassed,
  createParticles,
  updateParticles,
  initGameData,
};
