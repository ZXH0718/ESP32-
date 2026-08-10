import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../constants';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface GlassButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
  haptic?: boolean;
}

const GlassButton: React.FC<GlassButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
  textStyle,
  haptic = true,
}) => {
  const handlePress = () => {
    if (disabled || loading) return;
    if (haptic) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress?.();
  };

  const sizeStyles: Record<ButtonSize, ViewStyle> = {
    sm: { paddingVertical: 8, paddingHorizontal: 16, minWidth: 80 },
    md: { paddingVertical: 12, paddingHorizontal: 24, minWidth: 120 },
    lg: { paddingVertical: 16, paddingHorizontal: 32, minWidth: 160 },
    xl: { paddingVertical: 20, paddingHorizontal: 40, minWidth: 200 },
  };

  const textSizes: Record<ButtonSize, number> = {
    sm: 13,
    md: 15,
    lg: 17,
    xl: 19,
  };

  const getGradientColors = (): [string, string] => {
    switch (variant) {
      case 'primary':
        return [COLORS.PRIMARY, '#0099CC'];
      case 'success':
        return [COLORS.SUCCESS, '#22C55E'];
      case 'danger':
        return [COLORS.DANGER, '#EF4444'];
      case 'secondary':
        return ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)'];
      case 'ghost':
        return ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'];
      default:
        return [COLORS.PRIMARY, '#0099CC'];
    }
  };

  const getTextColor = (): string => {
    switch (variant) {
      case 'primary':
      case 'success':
      case 'danger':
        return '#FFFFFF';
      default:
        return COLORS.TEXT_PRIMARY;
    }
  };

  const getShadowColor = (): string => {
    switch (variant) {
      case 'primary':
        return COLORS.PRIMARY_GLOW;
      case 'success':
        return 'rgba(74, 222, 128, 0.4)';
      case 'danger':
        return 'rgba(248, 113, 113, 0.4)';
      default:
        return 'rgba(0, 0, 0, 0.1)';
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.container,
        sizeStyles[size],
        {
          shadowColor: getShadowColor(),
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {Platform.OS === 'ios' && variant !== 'primary' && variant !== 'success' && variant !== 'danger' ? (
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={getGradientColors()}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </BlurView>
      ) : (
        <LinearGradient
          colors={getGradientColors()}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      
      <View style={styles.border} pointerEvents="none" />
      
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={getTextColor()} />
        ) : (
          <>
            {icon && <View style={styles.icon}>{icon}</View>}
            <Text
              style={[
                styles.text,
                {
                  fontSize: textSizes[size],
                  color: getTextColor(),
                  marginLeft: icon ? 8 : 0,
                },
                textStyle,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  icon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});

export default GlassButton;
