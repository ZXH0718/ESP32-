import React from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from './GlassCard';
import GlassButton from './GlassButton';
import { COLORS } from '../constants';

interface StartScreenProps {
  highScore: number;
  onStart: () => void;
  onShowHelp: () => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ highScore, onStart, onShowHelp }) => {
  const bounceValue = useSharedValue(0);
  React.useEffect(() => {
    bounceValue.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);
  
  const dinoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -bounceValue.value * 12 }],
  }));
  
  const stars = [...Array(15)].map((_, i) => ({
    left: `${(i * 67 + 13) % 100}%`,
    top: `${(i * 41 + 7) % 50}%`,
    size: 2 + (i % 3),
    delay: i * 100,
  }));
  
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.BG_TOP, COLORS.BG_MIDDLE, COLORS.BG_BOTTOM]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.starsContainer}>
        {stars.map((star, i) => (
          <Animated.View
            key={i}
            entering={FadeIn.delay(star.delay)}
            style={[
              styles.star,
              {
                left: star.left,
                top: star.top,
                width: star.size * 2,
                height: star.size * 2,
                borderRadius: star.size,
              },
            ]}
          />
        ))}
        
        <View style={styles.glow1} />
        <View style={styles.glow2} />
      </View>
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={FadeInUp.duration(600).springify()}
          style={styles.header}
        >
          <Animated.View style={[styles.logoContainer, dinoAnimatedStyle]}>
            <View style={styles.logoDino}>
              <View style={styles.logoDinoBody}>
                <View style={styles.logoDinoBelly} />
                <View style={[styles.logoSpike, styles.logoSpike1]} />
                <View style={[styles.logoSpike, styles.logoSpike2]} />
              </View>
              <View style={styles.logoDinoHead}>
                <View style={styles.logoEye}>
                  <View style={styles.logoEyePupil} />
                </View>
                <View style={styles.logoMouth} />
              </View>
              <View style={styles.logoTail} />
            </View>
          </Animated.View>
          
          <Text style={styles.title}>
            恐龙快跑
          </Text>
          <Text style={styles.subtitle}>
            🦖 Dino Runner
          </Text>
          
          {highScore > 0 && (
            <Animated.View
              entering={FadeInUp.delay(300)}
              style={styles.highScoreBadge}
            >
              <Text style={styles.highScoreLabel}>最高纪录</Text>
              <Text style={styles.highScoreValue}>
                {Math.floor(highScore).toString().padStart(5, '0')}
              </Text>
            </Animated.View>
          )}
        </Animated.View>
        
        <Animated.View
          entering={FadeInUp.delay(200).duration(600)}
          style={{ marginBottom: 24 }}
        >
          <GlassCard style={styles.featuresCard} intensity={40}>
            <Text style={styles.featuresTitle}>游戏特色</Text>
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: 'rgba(0,212,255,0.2)' }]}>
                  <Text style={styles.featureEmoji}>🦘</Text>
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureName}>二段跳</Text>
                  <Text style={styles.featureDesc}>点击屏幕两次实现二段跳</Text>
                </View>
              </View>
              
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: 'rgba(255,107,157,0.2)' }]}>
                  <Text style={styles.featureEmoji}>⬇️</Text>
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureName}>下蹲躲避</Text>
                  <Text style={styles.featureDesc}>向下滑动躲避飞鸟</Text>
                </View>
              </View>
              
              <View style={styles.featureItem}>
                <View style={[styles.featureIcon, { backgroundColor: 'rgba(74,222,128,0.2)' }]}>
                  <Text style={styles.featureEmoji}>⚡</Text>
                </View>
                <View style={styles.featureText}>
                  <Text style={styles.featureName}>极速挑战</Text>
                  <Text style={styles.featureDesc}>速度会越来越快！</Text>
                </View>
              </View>
            </View>
          </GlassCard>
        </Animated.View>
        
        <Animated.View
          entering={FadeInUp.delay(400).duration(600)}
          style={styles.buttonsContainer}
        >
          <GlassButton
            title="开始游戏"
            variant="primary"
            size="xl"
            onPress={onStart}
            style={styles.startButton}
            icon={<Text style={styles.buttonIcon}>🎮</Text>}
          />
          
          <GlassButton
            title="操作说明"
            variant="secondary"
            size="lg"
            onPress={onShowHelp}
            style={styles.helpButton}
            icon={<Text style={styles.helpIcon}>❓</Text>}
          />
        </Animated.View>
        
        <Animated.Text
          entering={FadeInUp.delay(600)}
          style={styles.tipText}
        >
          点击任意位置或按开始即可游戏
        </Animated.Text>
      </ScrollView>
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  starsContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  glow1: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: COLORS.PRIMARY_GLOW,
    opacity: 0.3,
  },
  glow2: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.ACCENT_GLOW,
    opacity: 0.3,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  logoDino: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  logoDinoBody: {
    width: 50,
    height: 55,
    backgroundColor: COLORS.DINO_BODY,
    borderRadius: 18,
    borderTopRightRadius: 10,
    position: 'relative',
  },
  logoDinoBelly: {
    position: 'absolute',
    left: 6,
    bottom: 4,
    width: 30,
    height: 22,
    backgroundColor: COLORS.DINO_BELLY,
    borderRadius: 12,
  },
  logoSpike: {
    position: 'absolute',
    width: 10,
    height: 16,
    backgroundColor: COLORS.DINO_SPIKE,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  logoSpike1: {
    top: -12,
    left: 10,
    transform: [{ rotate: '-8deg' }],
  },
  logoSpike2: {
    top: -14,
    right: 10,
    transform: [{ rotate: '8deg' }],
  },
  logoDinoHead: {
    width: 40,
    height: 38,
    backgroundColor: COLORS.DINO_BODY,
    marginLeft: -10,
    borderRadius: 14,
    borderTopRightRadius: 20,
    position: 'relative',
    zIndex: 2,
  },
  logoEye: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEyePupil: {
    width: 7,
    height: 7,
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    marginLeft: 2,
  },
  logoMouth: {
    position: 'absolute',
    bottom: 6,
    right: 2,
    width: 24,
    height: 10,
    backgroundColor: COLORS.DINO_SPIKE,
    borderBottomRightRadius: 8,
  },
  logoTail: {
    width: 28,
    height: 16,
    backgroundColor: COLORS.DINO_BODY,
    marginRight: -4,
    borderBottomLeftRadius: 24,
    borderTopLeftRadius: 10,
    transform: [{ rotate: '-6deg' }],
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.TEXT_PRIMARY,
    letterSpacing: 3,
    marginBottom: 4,
    textShadowColor: COLORS.PRIMARY_GLOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  highScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,157,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.ACCENT_GLOW,
  },
  highScoreLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '600',
    marginRight: 10,
    letterSpacing: 1,
  },
  highScoreValue: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.ACCENT,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },
  featuresCard: {
    padding: 20,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  featuresList: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  featureEmoji: {
    fontSize: 22,
  },
  featureText: {
    flex: 1,
  },
  featureName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
    fontWeight: '500',
  },
  buttonsContainer: {
    gap: 14,
    alignItems: 'center',
    marginBottom: 24,
  },
  startButton: {
    width: '100%',
    shadowOpacity: 0.5,
  },
  helpButton: {
    minWidth: 180,
  },
  buttonIcon: {
    fontSize: 22,
  },
  helpIcon: {
    fontSize: 16,
  },
  tipText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.TEXT_TERTIARY,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});

export default StartScreen;
