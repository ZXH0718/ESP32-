import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';
import type { Cloud as CloudType } from '../../types';

interface CloudProps {
  cloud: CloudType;
}

const CloudComponent: React.FC<CloudProps> = ({ cloud }) => {
  return (
    <View
      style={[
        styles.container,
        {
          left: cloud.x,
          top: cloud.y,
          width: cloud.width,
          height: cloud.height,
        },
      ]}
    >
      <View style={[
        styles.puff,
        styles.puffLeft,
        {
          width: cloud.width * 0.4,
          height: cloud.height * 0.8,
        },
      ]} />
      
      <View style={[
        styles.puff,
        styles.puffCenter,
        {
          width: cloud.width * 0.5,
          height: cloud.height,
        },
      ]} />
      
      <View style={[
        styles.puff,
        styles.puffRight,
        {
          width: cloud.width * 0.35,
          height: cloud.height * 0.7,
        },
      ]} />
      
      <View style={[
        styles.base,
        {
          width: cloud.width * 0.75,
          height: cloud.height * 0.4,
        },
      ]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1,
  },
  puff: {
    position: 'absolute',
    backgroundColor: COLORS.CLOUD,
    borderRadius: 999,
    opacity: 0.9,
  },
  puffLeft: {
    left: 0,
    bottom: 0,
  },
  puffCenter: {
    left: '25%',
    bottom: 0,
  },
  puffRight: {
    right: 0,
    bottom: 0,
  },
  base: {
    position: 'absolute',
    bottom: 0,
    left: '10%',
    backgroundColor: COLORS.CLOUD,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    opacity: 0.9,
  },
});

export default CloudComponent;
