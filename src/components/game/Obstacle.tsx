import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import type { Obstacle as ObstacleType } from '../../types';

interface ObstacleProps {
  obstacle: ObstacleType;
}

const ObstacleComponent: React.FC<ObstacleProps> = ({ obstacle }) => {
  switch (obstacle.type) {
    case 'cactus':
      return <Cactus obstacle={obstacle} />;
    case 'rock':
      return <Rock obstacle={obstacle} />;
    case 'bird':
      return <Bird obstacle={obstacle} />;
    default:
      return null;
  }
};

const Cactus: React.FC<{ obstacle: ObstacleType }> = ({ obstacle }) => {
  const arms = obstacle.width > 35;
  
  return (
    <View
      style={[
        styles.container,
        {
          left: obstacle.x,
          top: obstacle.y,
          width: obstacle.width,
          height: obstacle.height,
        },
      ]}
    >
      <View style={[
        styles.cactusMain,
        { height: obstacle.height, width: obstacle.width * 0.5 },
      ]}>
        <View style={styles.cactusLine1} />
        <View style={styles.cactusLine2} />
      </View>
      
      {arms && (
        <View style={[
          styles.cactusArm,
          styles.cactusArmLeft,
          { height: obstacle.height * 0.5 },
        ]}>
          <View style={[styles.cactusArmTip, styles.cactusArmTipLeft]} />
        </View>
      )}
      
      {arms && (
        <View style={[
          styles.cactusArm,
          styles.cactusArmRight,
          { height: obstacle.height * 0.4, top: obstacle.height * 0.2 },
        ]}>
          <View style={[styles.cactusArmTip, styles.cactusArmTipRight]} />
        </View>
      )}
      
      <View style={[styles.spike, { top: obstacle.height * 0.2, left: -2 }]} />
      <View style={[styles.spike, { top: obstacle.height * 0.5, right: -2, transform: [{ rotate: '180deg' }] }]} />
      <View style={[styles.spike, { top: obstacle.height * 0.35, right: -2, transform: [{ rotate: '180deg' }] }]} />
    </View>
  );
};

const Rock: React.FC<{ obstacle: ObstacleType }> = ({ obstacle }) => {
  return (
    <View
      style={[
        styles.container,
        {
          left: obstacle.x,
          top: obstacle.y,
          width: obstacle.width,
          height: obstacle.height,
        },
      ]}
    >
      <View style={[
        styles.rock,
        {
          width: obstacle.width,
          height: obstacle.height,
        },
      ]}>
        <View style={styles.rockHighlight} />
        <View style={styles.rockShadow} />
        <View style={styles.rockTexture1} />
        <View style={styles.rockTexture2} />
      </View>
    </View>
  );
};

const Bird: React.FC<{ obstacle: ObstacleType }> = ({ obstacle }) => {
  const isWingUp = obstacle.wingFrame === 0;
  
  return (
    <View
      style={[
        styles.container,
        {
          left: obstacle.x,
          top: obstacle.y,
          width: obstacle.width,
          height: obstacle.height,
        },
      ]}
    >
      <View style={styles.birdBody}>
        <View style={styles.birdHead}>
          <View style={styles.birdEye} />
          <View style={styles.birdBeak} />
        </View>
        <View style={styles.birdTail} />
      </View>
      
      <View style={[
        styles.birdWing,
        isWingUp ? styles.wingUp : styles.wingDown,
      ]}>
        <View style={styles.wingFeather1} />
        <View style={styles.wingFeather2} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 5,
  },
  cactusMain: {
    position: 'absolute',
    left: '25%',
    backgroundColor: COLORS.OBSTACLE_CACTUS,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    overflow: 'hidden',
  },
  cactusLine1: {
    position: 'absolute',
    left: '25%',
    top: '10%',
    width: 2,
    height: '80%',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 1,
  },
  cactusLine2: {
    position: 'absolute',
    right: '25%',
    top: '15%',
    width: 2,
    height: '70%',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 1,
  },
  cactusArm: {
    position: 'absolute',
    width: 10,
    backgroundColor: COLORS.OBSTACLE_CACTUS,
    borderRadius: 5,
  },
  cactusArmLeft: {
    left: 0,
    top: '25%',
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  cactusArmRight: {
    right: 0,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  cactusArmTip: {
    position: 'absolute',
    width: 10,
    height: 10,
    backgroundColor: COLORS.OBSTACLE_CACTUS,
    borderRadius: 5,
  },
  cactusArmTipLeft: {
    top: -8,
    left: 0,
  },
  cactusArmTipRight: {
    top: -8,
    right: 0,
  },
  spike: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: COLORS.OBSTACLE_CACTUS,
  },
  rock: {
    backgroundColor: COLORS.OBSTACLE_ROCK,
    borderRadius: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  rockHighlight: {
    position: 'absolute',
    top: '10%',
    left: '15%',
    width: '30%',
    height: '25%',
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 20,
  },
  rockShadow: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '60%',
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderTopLeftRadius: 30,
  },
  rockTexture1: {
    position: 'absolute',
    top: '40%',
    left: '20%',
    width: 8,
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 4,
  },
  rockTexture2: {
    position: 'absolute',
    top: '55%',
    right: '25%',
    width: 6,
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 3,
  },
  birdBody: {
    position: 'absolute',
    left: 10,
    top: 12,
    width: 30,
    height: 18,
    backgroundColor: COLORS.BIRD_BODY,
    borderRadius: 10,
  },
  birdHead: {
    position: 'absolute',
    right: -6,
    top: -4,
    width: 16,
    height: 16,
    backgroundColor: COLORS.BIRD_BODY,
    borderRadius: 10,
  },
  birdEye: {
    position: 'absolute',
    top: 4,
    right: 3,
    width: 5,
    height: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  birdBeak: {
    position: 'absolute',
    right: -6,
    top: 6,
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: COLORS.WARNING,
  },
  birdTail: {
    position: 'absolute',
    left: -6,
    top: 4,
    width: 12,
    height: 10,
    backgroundColor: COLORS.BIRD_BODY,
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    transform: [{ skewY: '-8deg' }],
  },
  birdWing: {
    position: 'absolute',
    left: 12,
    width: 22,
    height: 14,
  },
  wingUp: {
    top: 0,
    transform: [{ rotate: '-30deg' }],
  },
  wingDown: {
    top: 16,
    transform: [{ rotate: '30deg' }],
  },
  wingFeather1: {
    position: 'absolute',
    width: 22,
    height: 8,
    backgroundColor: COLORS.BIRD_WING,
    borderRadius: 8,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  wingFeather2: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 16,
    height: 6,
    backgroundColor: COLORS.BIRD_BODY,
    borderRadius: 6,
    opacity: 0.8,
  },
});

export default ObstacleComponent;
