import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming, interpolate, useSharedValue, withSequence } from 'react-native-reanimated';
import GlassCard from './GlassCard';
import { COLORS } from '../constants';

interface ScoreDisplayProps { score: number; highScore: number; isNewHigh?: boolean; }

const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ score, highScore, isNewHigh }) => {
  const scoreAnim = useSharedValue(score);
  const pulseAnim = useSharedValue(0);
  React.useEffect(() => {
    scoreAnim.value = withSpring(score, { mass: 0.5, stiffness: 200, damping: 20 });
    if (score > 0 && Math.floor(score) % 100 === 0) {
      pulseAnim.value = withSequence(withTiming(1, { duration: 200 }), withTiming(0, { duration: 200 }));
    }
  }, [score]);
  const animatedScoreStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulseAnim.value, [0, 1], [1, 1.15]);
    return { transform: [{ scale }] };
  });
  const formatScore = (value: number): string => Math.floor(value).toString().padStart(5, '0');
  return (
    <View style={styles.container}>
      <GlassCard style={styles.scoreCard} intensity={60} glow={isNewHigh} glowColor={COLORS.ACCENT_GLOW}>
        <View style={styles.scoreContent}>
          <View style={styles.scoreItem}><Text style={styles.label}>得分</Text><Animated.Text style={[styles.scoreValue, animatedScoreStyle]}>{formatScore(score)}</Animated.Text></View>
          <View style={styles.divider} />
          <View style={styles.scoreItem}><Text style={styles.label}>最高分</Text><Text style={[styles.scoreValue, styles.highScoreValue]}>{formatScore(highScore)}</Text></View>
        </View>
        {isNewHigh && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  scoreCard: { paddingHorizontal: 24, paddingVertical: 12, minWidth: 240 },
  scoreContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  scoreItem: { alignItems: 'center' },
  label: { fontSize: 12, color: COLORS.TEXT_TERTIARY, fontWeight: '600', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  scoreValue: { fontSize: 28, fontWeight: '900', color: COLORS.TEXT_PRIMARY, fontVariant: ['tabular-nums'], letterSpacing: 2 },
  highScoreValue: { color: COLORS.ACCENT },
  divider: { width: 1, height: 36, backgroundColor: COLORS.GLASS_BORDER },
  newBadge: { position: 'absolute', top: -8, right: -8, backgroundColor: COLORS.ACCENT, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  newBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
});

export default ScoreDisplay;
