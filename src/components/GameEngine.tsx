import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Dimensions,
  PanResponder,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { runOnJS } from 'react-native-reanimated';

import { COLORS, GAME_CONFIG } from '../constants';
import type { GameState, GameData } from '../types';
import {
  initGameData,
  updateDino,
  updateObstacles,
  updateClouds,
  updateSpeed,
  updateParticles,
  checkCollision,
  checkPassed,
  dinoJump,
  dinoDuck,
  createParticles,
} from '../utils/gameLogic';

import DinoComponent from './game/Dino';
import ObstacleComponent from './game/Obstacle';
import CloudComponent from './game/Cloud';
import ParticlesComponent from './game/Particles';
import Ground from './game/Ground';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GAME_WIDTH = SCREEN_WIDTH;
const GAME_HEIGHT = SCREEN_HEIGHT - 150;
const HIGH_SCORE_KEY = 'dino_runner_high_score';

interface GameEngineProps {
  gameState: GameState;
  onStateChange: (state: GameState) => void;
  onScoreUpdate: (score: number, highScore: number, isNewHigh: boolean) => void;
  onGameOver: (score: number) => void;
}

const GameEngine: React.FC<GameEngineProps> = ({
  gameState,
  onStateChange,
  onScoreUpdate,
  onGameOver,
}) => {
  const gameDataRef = useRef<GameData | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isDuckingRef = useRef(false);
  
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  const lastScoreTickRef = useRef(0);

  const initGame = useCallback(async () => {
    let storedHighScore = 0;
    try {
      const saved = await AsyncStorage.getItem(HIGH_SCORE_KEY);
      if (saved) storedHighScore = parseInt(saved, 10);
    } catch {}
    
    gameDataRef.current = initGameData(GAME_WIDTH, GAME_HEIGHT, storedHighScore);
    forceUpdate();
  }, []);

  const startGameLoop = useCallback(() => {
    const loop = () => {
      if (!gameDataRef.current) return;
      
      const data = gameDataRef.current;
      const frameCount = data.frameCount + 1;
      
      let dino = updateDino(data.dino, GAME_HEIGHT, frameCount);
      dino = dinoDuck(dino, isDuckingRef.current);
      
      let obstacles = updateObstacles(
        data.obstacles,
        data.speed,
        GAME_WIDTH,
        GAME_HEIGHT,
        frameCount
      );
      
      obstacles = checkPassed(dino, obstacles);
      
      let collided = false;
      for (const obs of obstacles) {
        if (checkCollision(dino, obs)) {
          collided = true;
          break;
        }
      }
      
      if (collided) {
        const particles = createParticles(
          dino.x + dino.width / 2,
          dino.y + dino.height / 2,
          COLORS.DANGER,
          20
        );
        
        gameDataRef.current = {
          ...data,
          dino,
          obstacles,
          particles: [...data.particles, ...particles],
        };
        
        if (data.score > data.highScore) {
          AsyncStorage.setItem(HIGH_SCORE_KEY, Math.floor(data.score).toString()).catch(() => {});
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        forceUpdate();
        runOnJS(onGameOver)(data.score);
        return;
      }
      
      const clouds = updateClouds(data.clouds, data.speed, GAME_WIDTH, frameCount);
      const particles = updateParticles(data.particles);
      const speed = updateSpeed(data.speed);
      
      const newPassed = obstacles.filter(o => o.passed && !data.obstacles.find(d => d.id === o.id)?.passed);
      const passBonus = newPassed.length * 10;
      const distance = data.distance + speed;
      let score = distance * GAME_CONFIG.SCORE_MULTIPLIER + passBonus;
      
      const scoreTick = Math.floor(score / 100);
      if (scoreTick > lastScoreTickRef.current) {
        lastScoreTickRef.current = scoreTick;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      
      const highScore = Math.max(data.highScore, score);
      const isNewHigh = score > data.highScore;
      
      gameDataRef.current = {
        ...data,
        frameCount,
        dino,
        obstacles,
        clouds,
        particles,
        speed,
        distance,
        score,
        highScore,
      };
      
      runOnJS(onScoreUpdate)(score, highScore, isNewHigh);
      forceUpdate();
      
      animationFrameRef.current = requestAnimationFrame(loop);
    };
    
    animationFrameRef.current = requestAnimationFrame(loop);
  }, [onGameOver, onScoreUpdate]);

  const stopGameLoop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (gameState === 'idle') {
      initGame();
    } else if (gameState === 'playing') {
      if (!gameDataRef.current) {
        initGame().then(() => {
          lastScoreTickRef.current = 0;
          startGameLoop();
        });
      } else {
        lastScoreTickRef.current = 0;
        startGameLoop();
      }
    } else if (gameState === 'paused' || gameState === 'gameover') {
      stopGameLoop();
    }
  }, [gameState, initGame, startGameLoop, stopGameLoop]);

  useEffect(() => {
    return () => stopGameLoop();
  }, [stopGameLoop]);

  const handleJump = useCallback(() => {
    if (gameState === 'idle') {
      onStateChange('playing');
      return;
    }
    
    if (gameState !== 'playing' || !gameDataRef.current) return;
    
    const wasJumping = gameDataRef.current.dino.jumpCount > 0;
    gameDataRef.current.dino = dinoJump(gameDataRef.current.dino);
    
    if (!wasJumping) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const particles = createParticles(
        gameDataRef.current.dino.x + gameDataRef.current.dino.width / 2,
        gameDataRef.current.dino.y + gameDataRef.current.dino.height,
        COLORS.PRIMARY,
        8
      );
      gameDataRef.current.particles = [...gameDataRef.current.particles, ...particles];
    }
    forceUpdate();
  }, [gameState, onStateChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 20;
      },
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 30 && gameState === 'playing') {
          isDuckingRef.current = true;
          if (gameDataRef.current) {
            gameDataRef.current.dino = dinoDuck(gameDataRef.current.dino, true);
            forceUpdate();
          }
        } else if (gestureState.dy < -30 && gameState === 'playing') {
          handleJump();
        }
      },
      onPanResponderRelease: () => {
        isDuckingRef.current = false;
        if (gameDataRef.current) {
          gameDataRef.current.dino = dinoDuck(gameDataRef.current.dino, false);
          forceUpdate();
        }
      },
    })
  ).current;

  const data = gameDataRef.current;

  return (
    <TouchableWithoutFeedback
      onPress={handleJump}
      {...panResponder.panHandlers}
    >
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.BG_TOP, COLORS.BG_MIDDLE, COLORS.BG_BOTTOM]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.stars}>
          {[...Array(20)].map((_, i) => (
            <View
              key={i}
              style={[
                styles.star,
                {
                  left: `${(i * 53) % 100}%`,
                  top: `${(i * 37) % 60}%`,
                  opacity: 0.3 + (i % 3) * 0.2,
                  transform: [{ scale: 0.5 + (i % 5) * 0.15 }],
                },
              ]}
            />
          ))}
        </View>
        
        <View style={[styles.gameArea, { width: GAME_WIDTH, height: GAME_HEIGHT }]}>
          {data?.clouds.map(cloud => (
            <CloudComponent key={cloud.id} cloud={cloud} />
          ))}
          
          <Ground
            speed={data?.speed || 6}
            gameState={gameState}
            gameHeight={GAME_HEIGHT}
          />
          
          {data?.obstacles.map(obstacle => (
            <ObstacleComponent key={obstacle.id} obstacle={obstacle} />
          ))}
          
          {data && <DinoComponent dino={data.dino} />}
          
          {data && <ParticlesComponent particles={data.particles} />}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 0,
  },
  gameArea: {
    position: 'relative',
    overflow: 'hidden',
  },
  stars: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
    width: 3,
    height: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.5,
  },
});

export default GameEngine;
