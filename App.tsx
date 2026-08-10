import React, { useState, useCallback, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { COLORS } from './src/constants';
import type { GameState } from './src/types';

import GameEngine from './src/components/GameEngine';
import ScoreDisplay from './src/components/ScoreDisplay';
import StartScreen from './src/components/StartScreen';
import GameOverModal from './src/components/GameOverModal';
import HelpModal from './src/components/HelpModal';
import GlassCard from './src/components/GlassCard';
import GlassButton from './src/components/GlassButton';

const HIGH_SCORE_KEY = 'dino_runner_high_score';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  // 加载历史最高分
  useEffect(() => {
    const loadHighScore = async () => {
      try {
        const saved = await AsyncStorage.getItem(HIGH_SCORE_KEY);
        if (saved) {
          setHighScore(parseInt(saved, 10));
        }
      } catch {}
    };
    loadHighScore();
  }, []);

  // 状态切换
  const handleStateChange = useCallback((state: GameState) => {
    setGameState(state);
    if (state === 'playing') {
      setShowPauseMenu(false);
    }
  }, []);

  // 分数更新
  const handleScoreUpdate = useCallback((newScore: number, newHigh: number, newIsHigh: boolean) => {
    setScore(newScore);
    setHighScore(newHigh);
    setIsNewHigh(newIsHigh);
  }, []);

  // 游戏结束
  const handleGameOver = useCallback((finalScore: number) => {
    setGameState('gameover');
    setLastScore(finalScore);
    if (finalScore > highScore) {
      setIsNewHigh(true);
    }
  }, [highScore]);

  // 重新开始
  const handleRestart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScore(0);
    setIsNewHigh(false);
    setGameState('idle');
    // 立即启动
    setTimeout(() => setGameState('playing'), 50);
  }, []);

  // 返回主页
  const handleHome = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScore(0);
    setIsNewHigh(false);
    setGameState('idle');
    setShowPauseMenu(false);
  }, []);

  // 暂停/继续
  const handlePauseToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (gameState === 'playing') {
      setGameState('paused');
      setShowPauseMenu(true);
    } else if (gameState === 'paused') {
      setGameState('playing');
      setShowPauseMenu(false);
    }
  }, [gameState]);

  const showStartScreen = gameState === 'idle';
  const showGameUI = gameState === 'playing' || gameState === 'paused';

  return (
    <View style={styles.rootContainer}>
      <ExpoStatusBar style="light" translucent backgroundColor="transparent" />
      
      {Platform.OS === 'android' && (
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      )}
      
      {showStartScreen ? (
        <StartScreen
          highScore={highScore}
          onStart={handleRestart}
          onShowHelp={() => setShowHelp(true)}
        />
      ) : (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.gameContainer}>
            <GameEngine
              gameState={gameState}
              onStateChange={handleStateChange}
              onScoreUpdate={handleScoreUpdate}
              onGameOver={handleGameOver}
            />
          </View>
          {showGameUI && (
            <View style={styles.topHUD} pointerEvents="box-none">
              <View style={styles.topContent}>
                <ScoreDisplay
                  score={score}
                  highScore={highScore}
                  isNewHigh={isNewHigh && Math.floor(score) % 50 === 0}
                />
                <TouchableOpacity
                  style={styles.pauseButton}
                  onPress={handlePauseToggle}
                  activeOpacity={0.7}
                >
                  <GlassCard style={styles.pauseCard} intensity={50}>
                    <Text style={styles.pauseIcon}>
                      {gameState === 'paused' ? '▶️' : '⏸️'}
                    </Text>
                  </GlassCard>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {showGameUI && (
            <View style={styles.bottomHint} pointerEvents="none">
              <View style={styles.hintRow}>
                <View style={styles.hintItem}>
                  <Text style={styles.hintIcon}>👆</Text>
                  <Text style={styles.hintText}>点击跳跃</Text>
                </View>
                <View style={styles.hintDivider} />
                <View style={styles.hintItem}>
                  <Text style={styles.hintIcon}>⬇️</Text>
                  <Text style={styles.hintText}>下滑下蹲</Text>
                </View>
              </View>
            </View>
          )}
        </SafeAreaView>
      )}
      
      {showPauseMenu && (
        <View style={styles.pauseOverlay}>
          <View style={styles.pauseOverlayBg} />
          <GlassCard style={styles.pauseMenu} intensity={70}>
            <Text style={styles.pauseTitle}>⏸️ 游戏暂停</Text>
            <View style={styles.pauseStats}>
              <View style={styles.pauseStatItem}>
                <Text style={styles.pauseStatLabel}>当前得分</Text>
                <Text style={styles.pauseStatValue}>
                  {Math.floor(score).toString().padStart(5, '0')}
                </Text>
              </View>
            </View>
            <View style={styles.pauseButtons}>
              <GlassButton
                title="继续游戏"
                variant="primary"
                size="lg"
                style={styles.pauseMenuButton}
                onPress={handlePauseToggle}
                icon={<Text style={styles.buttonEmoji}>▶️</Text>}
              />
              <GlassButton
                title="重新开始"
                variant="secondary"
                size="lg"
                style={styles.pauseMenuButton}
                onPress={handleRestart}
                icon={<Text style={styles.buttonEmoji}>🔄</Text>}
              />
              <GlassButton
                title="返回主页"
                variant="ghost"
                size="lg"
                style={styles.pauseMenuButton}
                onPress={handleHome}
              />
            </View>
          </GlassCard>
        </View>
      )}
      
      <GameOverModal
        visible={gameState === 'gameover'}
        score={lastScore}
        highScore={highScore}
        isNewHigh={isNewHigh && lastScore >= highScore && lastScore > 0}
        onRestart={handleRestart}
        onHome={handleHome}
      />
      
      <HelpModal
        visible={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: COLORS.BG_TOP,
  },
  safeArea: {
    flex: 1,
  },
  gameContainer: {
    flex: 1,
  },
  topHUD: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 40 : 50,
    paddingHorizontal: 16,
  },
  topContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
  },
  pauseButton: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  pauseCard: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    padding: 0,
  },
  pauseIcon: {
    fontSize: 18,
  },
  bottomHint: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hintIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  hintText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
  hintDivider: {
    width: 1,
    height: 14,
    backgroundColor: COLORS.GLASS_BORDER,
    marginHorizontal: 14,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 24,
  },
  pauseOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  pauseMenu: {
    width: '100%',
    maxWidth: 360,
    padding: 28,
  },
  pauseTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  pauseStats: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  pauseStatItem: {
    alignItems: 'center',
  },
  pauseStatLabel: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  pauseStatValue: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  pauseButtons: {
    gap: 12,
  },
  pauseMenuButton: {
    width: '100%',
  },
  buttonEmoji: {
    fontSize: 16,
  },
});
