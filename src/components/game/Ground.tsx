import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS, GAME_CONFIG } from '../../constants';

interface GroundProps {
  speed: number;
  gameState: 'idle' | 'playing' | 'paused' | 'gameover';
  gameHeight: number;
}

const { GROUND_HEIGHT } = GAME_CONFIG;

const Ground: React.FC<GroundProps> = ({ speed, gameState, gameHeight }) => {
  const scrollX = useSharedValue(0);
  
  React.useEffect(() => {
    if (gameState === 'playing') {
      const duration = 30000 / Math.max(speed, 1);
      scrollX.value = withRepeat(
        withTiming(-200, {
          duration,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    } else {
      cancelAnimation(scrollX);
    }
  }, [gameState, speed]);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scrollX.value }],
  }));
  
  const groundY = gameHeight - GROUND_HEIGHT;
  
  return (
    <View style={[styles.container, { top: groundY }]}>
      <View style={styles.groundLine} />
      
      <Animated.View style={[styles.decorations, animatedStyle]}>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.grass, { left: i * 120 + 20 }]} />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`d1-${i}`} style={[styles.dot1, { left: i * 80 + 50 }]} />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`d2-${i}`} style={[styles.dot2, { left: i * 100 + 80 }]} />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`g-${i}`} style={[styles.gridLine, { left: i * 60 }]} />
        ))}
        
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`r-grass-${i}`} style={[styles.grass, { left: 600 + i * 120 + 20 }]} />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`r-d1-${i}`} style={[styles.dot1, { left: 600 + i * 80 + 50 }]} />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`r-d2-${i}`} style={[styles.dot2, { left: 600 + i * 100 + 80 }]} />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <View key={`r-g-${i}`} style={[styles.gridLine, { left: 600 + i * 60 }]} />
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: GROUND_HEIGHT,
    zIndex: 2,
  },
  groundLine: {
    height: 2,
    backgroundColor: COLORS.GROUND_LINE,
    width: '100%',
  },
  decorations: {
    flex: 1,
    position: 'relative',
    width: 1200,
  },
  grass: {
    position: 'absolute',
    top: 8,
    width: 4,
    height: 10,
    backgroundColor: COLORS.SUCCESS,
    opacity: 0.5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  dot1: {
    position: 'absolute',
    top: 20,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.PRIMARY,
    opacity: 0.4,
  },
  dot2: {
    position: 'absolute',
    top: 35,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.ACCENT,
    opacity: 0.4,
  },
  gridLine: {
    position: 'absolute',
    top: 50,
    width: 1,
    height: 40,
    backgroundColor: COLORS.GROUND_LINE,
    opacity: 0.5,
  },
});

export default Ground;
