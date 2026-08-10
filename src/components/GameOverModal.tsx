import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  useSharedValue,
  FadeIn,
  ZoomIn,
} from 'react-native-reanimated';
import GlassCard from './GlassCard';
import GlassButton from './GlassButton';
import { COLORS } from '../constants';

interface GameOverModalProps {
  visible: boolean;
  score: number;
  highScore: number;
  isNewHigh: boolean;
  onRestart: () => void;
  onHome: () => void;
}

const GameOverModal: React.FC<GameOverModalProps> = ({
  visible,
  score,
  highScore,
  isNewHigh,
  onRestart,
  onHome,
}) => {
  const scaleAnim = useSharedValue(0);
  
  React.useEffect(() => {
    if (visible) {
      scaleAnim.value = withSequence(
        withSpring(1.1, { damping: 8, stiffness: 200 }),
        withSpring(1, { damping: 12 })
      );
    } else {
      scaleAnim.value = 0;
    }
  }, [visible, scaleAnim]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleAnim.value }],
  }));
  
  const formatScore = (val: number): string => Math.floor(val).toString().padStart(5, '0');
  
  if (!visible) return null;
  
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <Animated.View
          entering={FadeIn.duration(300)}
          style={styles.overlayBg}
          pointerEvents="none"
        />
        
        <Animated.View
          style={[styles.modalContainer, animatedStyle]}
          entering={ZoomIn.springify().damping(15)}
        >
          <GlassCard style={styles.card} intensity={70} glow={isNewHigh} glowColor={COLORS.ACCENT_GLOW}>
            <View style={styles.header}>
              <Text style={styles.emoji}>💥</Text>
              <Text style={styles.title}>游戏结束</Text>
              <Text style={styles.subtitle}>{isNewHigh ? '新纪录！太厉害了！' : '再接再厉！'}</Text>
            </View>
            
            <View style={styles.scoreSection}>
              <View style={styles.scoreRow}>
                <View style={styles.scoreBlock}>
                  <Text style={styles.scoreLabel}>本局得分</Text>
                  <Animated.Text
                    style={[
                      styles.scoreValue,
                      isNewHigh && { color: COLORS.ACCENT },
                    ]}
                  >
                    {formatScore(score)}
                  </Animated.Text>
                </View>
                
                <View style={styles.divider} />
                
                <View style={styles.scoreBlock}>
                  <Text style={styles.scoreLabel}>最高纪录</Text>
                  <Text style={[styles.scoreValue, styles.highScore]}>
                    {formatScore(highScore)}
                  </Text>
                </View>
              </View>
              
              {isNewHigh && (
                <Animated.View
                  entering={ZoomIn.delay(300)}
                  style={styles.newRecordBadge}
                >
                  <Text style={styles.newRecordText}>🏆 新纪录</Text>
                </Animated.View>
              )}
            </View>
            
            <View style={styles.stats}>
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>⚡</Text>
                <Text style={styles.statValue}>{Math.floor(score * 0.8)}m</Text>
                <Text style={styles.statLabel}>距离</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>🎯</Text>
                <Text style={styles.statValue}>{Math.max(0, Math.floor(score / 10) - 1)}</Text>
                <Text style={styles.statLabel}>越过障碍</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statIcon}>⭐</Text>
                <Text style={styles.statValue}>{Math.floor(score / 50)}</Text>
                <Text style={styles.statLabel}>等级</Text>
              </View>
            </View>
            
            <View style={styles.buttons}>
              <GlassButton
                title="返回主页"
                variant="secondary"
                size="lg"
                style={styles.button}
                onPress={onHome}
              />
              <GlassButton
                title="再来一局"
                variant="primary"
                size="lg"
                style={[styles.button, styles.primaryButton]}
                onPress={onRestart}
                icon={
                  <Text style={styles.buttonIcon}>🔄</Text>
                }
              />
            </View>
          </GlassCard>
        </Animated.View>
      </View>
    </Modal>
  );
};

import { Modal } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContainer: {
    width: SCREEN_WIDTH - 48,
    maxWidth: 400,
  },
  card: {
    padding: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.TEXT_PRIMARY,
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
  scoreSection: {
    marginBottom: 24,
    position: 'relative',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  scoreBlock: {
    alignItems: 'center',
    flex: 1,
  },
  scoreLabel: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  highScore: {
    color: COLORS.ACCENT,
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.GLASS_BORDER,
  },
  newRecordBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: COLORS.ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: COLORS.ACCENT_GLOW,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  newRecordText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.TEXT_TERTIARY,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.GLASS_BORDER,
    opacity: 0.5,
  },
  buttons: {
    gap: 12,
  },
  button: {
    width: '100%',
  },
  primaryButton: {
    shadowOpacity: 0.4,
  },
  buttonIcon: {
    fontSize: 18,
  },
});

export default GameOverModal;
