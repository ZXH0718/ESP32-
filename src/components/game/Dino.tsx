import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { COLORS } from '../../constants';
import type { Dino as DinoType } from '../../types';

interface DinoProps {
  dino: DinoType;
}

const DinoComponent: React.FC<DinoProps> = ({ dino }) => {
  const isJumping = dino.state === 'jumping' || dino.state === 'doubleJumping';
  const isDoubleJumping = dino.state === 'doubleJumping';
  const isDucking = dino.state === 'ducking';
  
  const animatedStyle = useAnimatedStyle(() => {
    const rotation = interpolate(dino.velocityY, [-16, 0, 16], [-5, 0, 8]);
    return {
      transform: [{ rotate: `${rotation}deg` }],
    };
  });
  
  const legOffset = dino.legFrame === 0 ? 2 : -2;
  
  return (
    <Animated.View
      style={[
        styles.container,
        {
          left: dino.x,
          top: dino.y,
          width: dino.width,
          height: dino.height,
        },
        animatedStyle,
      ]}
    >
      {isDoubleJumping && <View style={styles.doubleJumpGlow} />}
      
      <View style={[
        styles.body,
        isDucking && styles.bodyDucking,
      ]}>
        <View style={[styles.tail, isDucking && styles.tailDucking]}>
          <View style={styles.tailTip} />
        </View>
        
        <View style={styles.bodyMain}>
          <View style={styles.belly} />
          
          {!isDucking && (
            <>
              <View style={[styles.spike, styles.spike1]} />
              <View style={[styles.spike, styles.spike2]} />
              <View style={[styles.spike, styles.spike3]} />
            </>
          )}
        </View>
        
        <View style={[styles.head, isDucking && styles.headDucking]}>
          <View style={styles.eyeWhite}>
            <View style={styles.eyePupil} />
            <View style={styles.eyeShine} />
          </View>
          
          <View style={styles.mouth}>
            <View style={styles.tooth1} />
            <View style={styles.tooth2} />
            <View style={styles.tooth3} />
          </View>
          
          <View style={styles.nostril} />
        </View>
        
        <View style={styles.neck} />
      </View>
      
      {!isDucking && (
        <View style={styles.legs}>
          <View style={[
            styles.leg,
            styles.legLeft,
            { transform: [{ translateY: isJumping ? -4 : legOffset }] },
          ]}>
            <View style={styles.legUpper} />
            <View style={styles.legLower} />
            <View style={styles.foot} />
          </View>
          
          <View style={[
            styles.leg,
            styles.legRight,
            { transform: [{ translateY: isJumping ? -4 : -legOffset }] },
          ]}>
            <View style={styles.legUpper} />
            <View style={styles.legLower} />
            <View style={styles.foot} />
          </View>
        </View>
      )}
      
      <View style={[styles.arm, isDucking && styles.armDucking]}>
        <View style={styles.hand} />
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 10,
  },
  doubleJumpGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.PRIMARY_GLOW,
    borderRadius: 30,
    opacity: 0.6,
    transform: [{ scale: 1.3 }],
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bodyDucking: {
    transform: [{ scaleY: 0.9 }, { translateY: 4 }],
  },
  tail: {
    width: 18,
    height: 10,
    backgroundColor: COLORS.DINO_BODY,
    borderBottomLeftRadius: 20,
    borderTopLeftRadius: 8,
    marginRight: -2,
    transform: [{ rotate: '-8deg' }],
  },
  tailDucking: {
    transform: [{ rotate: '-5deg' }],
  },
  tailTip: {
    position: 'absolute',
    left: -6,
    top: 2,
    width: 8,
    height: 6,
    backgroundColor: COLORS.DINO_BODY,
    borderBottomLeftRadius: 8,
  },
  bodyMain: {
    width: 32,
    height: 36,
    backgroundColor: COLORS.DINO_BODY,
    borderRadius: 12,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 6,
    position: 'relative',
  },
  belly: {
    position: 'absolute',
    left: 4,
    bottom: 2,
    width: 20,
    height: 16,
    backgroundColor: COLORS.DINO_BELLY,
    borderRadius: 8,
    borderBottomLeftRadius: 6,
  },
  spike: {
    position: 'absolute',
    width: 6,
    height: 10,
    backgroundColor: COLORS.DINO_SPIKE,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  spike1: {
    top: -6,
    left: 4,
    transform: [{ rotate: '-10deg' }],
  },
  spike2: {
    top: -9,
    left: 13,
  },
  spike3: {
    top: -6,
    right: 4,
    transform: [{ rotate: '10deg' }],
  },
  neck: {
    width: 10,
    height: 20,
    backgroundColor: COLORS.DINO_BODY,
    marginLeft: -2,
    borderTopRightRadius: 4,
    transform: [{ rotate: '15deg' }, { translateY: -2 }],
  },
  head: {
    width: 26,
    height: 24,
    backgroundColor: COLORS.DINO_BODY,
    marginLeft: -8,
    borderRadius: 10,
    borderTopRightRadius: 14,
    position: 'relative',
    zIndex: 2,
  },
  headDucking: {
    transform: [{ rotate: '10deg' }, { translateY: 2 }],
  },
  eyeWhite: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 9,
    height: 9,
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyePupil: {
    width: 5,
    height: 5,
    backgroundColor: '#1a1a2e',
    borderRadius: 3,
    marginLeft: 1,
  },
  eyeShine: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 2,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  mouth: {
    position: 'absolute',
    bottom: 3,
    right: 1,
    width: 16,
    height: 7,
    backgroundColor: COLORS.DINO_SPIKE,
    borderBottomRightRadius: 6,
    borderTopRightRadius: 2,
  },
  tooth1: {
    position: 'absolute',
    top: 0,
    left: 2,
    width: 2,
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  tooth2: {
    position: 'absolute',
    top: 0,
    left: 7,
    width: 2,
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  tooth3: {
    position: 'absolute',
    top: 0,
    right: 2,
    width: 2,
    height: 2,
    backgroundColor: '#FFFFFF',
  },
  nostril: {
    position: 'absolute',
    top: 8,
    right: 1,
    width: 2,
    height: 2,
    backgroundColor: '#1a1a2e',
    borderRadius: 1,
  },
  legs: {
    position: 'absolute',
    bottom: -2,
    left: 12,
    flexDirection: 'row',
    gap: 4,
  },
  leg: {
    alignItems: 'center',
  },
  legUpper: {
    width: 8,
    height: 10,
    backgroundColor: COLORS.DINO_BODY,
    borderRadius: 4,
  },
  legLower: {
    width: 6,
    height: 8,
    backgroundColor: COLORS.DINO_BODY,
    borderRadius: 3,
    marginTop: -1,
  },
  foot: {
    width: 12,
    height: 5,
    backgroundColor: COLORS.DINO_SPIKE,
    borderRadius: 3,
    borderTopRightRadius: 6,
    marginTop: -1,
    marginLeft: -2,
  },
  arm: {
    position: 'absolute',
    top: 22,
    left: 40,
    width: 10,
    height: 16,
    backgroundColor: COLORS.DINO_BODY,
    borderRadius: 5,
    transform: [{ rotate: '30deg' }],
  },
  armDucking: {
    top: 16,
  },
  hand: {
    position: 'absolute',
    bottom: -2,
    left: 1,
    width: 8,
    height: 6,
    backgroundColor: COLORS.DINO_BODY,
    borderRadius: 3,
  },
});

export default DinoComponent;
