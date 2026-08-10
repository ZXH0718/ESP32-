import React from 'react';
import { View, StyleSheet } from 'react-native';
import type { Particle } from '../../types';

interface ParticlesProps {
  particles: Particle[];
}

const ParticlesComponent: React.FC<ParticlesProps> = ({ particles }) => {
  return (
    <>
      {particles.map(particle => (
        <View
          key={particle.id}
          style={[
            styles.particle,
            {
              left: particle.x,
              top: particle.y,
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              opacity: particle.life,
              transform: [{ scale: particle.life }],
            },
          ]}
        />
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    zIndex: 20,
    borderRadius: 999,
  },
});

export default ParticlesComponent;
