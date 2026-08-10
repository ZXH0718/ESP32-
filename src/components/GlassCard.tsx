import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../constants';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  border?: boolean;
  glow?: boolean;
  glowColor?: string;
  gradient?: boolean;
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 50,
  border = true,
  glow = false,
  glowColor = COLORS.PRIMARY_GLOW,
  gradient = false,
}) => {
  return (
    <View style={[styles.container, glow && { shadowColor: glowColor, shadowOpacity: 0.5 }, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint="dark" style={styles.blur}>
          {gradient && (
            <LinearGradient
              colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)']}
              style={StyleSheet.absoluteFill}
            />
          )}
          {border && <View style={styles.border} pointerEvents="none" />}
          {children}
        </BlurView>
      ) : (
        <View style={[styles.androidGlass, styles.blur]}>
          {gradient && (
            <LinearGradient
              colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
              style={StyleSheet.absoluteFill}
            />
          )}
          {border && <View style={styles.border} pointerEvents="none" />}
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 8,
    overflow: 'hidden',
  },
  blur: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  androidGlass: {
    backgroundColor: COLORS.GLASS_BG,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.GLASS_BORDER,
  },
});

export default GlassCard;
