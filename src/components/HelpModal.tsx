import React from 'react';
import { View, Text, StyleSheet, Modal, Dimensions, ScrollView } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import GlassCard from './GlassCard';
import GlassButton from './GlassButton';
import { COLORS } from '../constants';

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
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
          style={styles.modalContainer}
          entering={ZoomIn.springify().damping(15)}
        >
          <GlassCard style={styles.card} intensity={70}>
            <Text style={styles.title}>🎮 操作说明</Text>
            
            <ScrollView
              style={styles.scrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <View style={styles.helpSection}>
                <View style={[styles.helpIcon, { backgroundColor: 'rgba(0,212,255,0.2)' }]}>
                  <Text style={styles.helpEmoji}>👆</Text>
                </View>
                <View style={styles.helpContent}>
                  <Text style={styles.helpName}>点击屏幕</Text>
                  <Text style={styles.helpDesc}>点击任意位置让恐龙跳跃</Text>
                </View>
              </View>
              
              <View style={styles.helpSection}>
                <View style={[styles.helpIcon, { backgroundColor: 'rgba(0,212,255,0.3)' }]}>
                  <Text style={styles.helpEmoji}>👆👆</Text>
                </View>
                <View style={styles.helpContent}>
                  <Text style={styles.helpName}>二段跳</Text>
                  <Text style={styles.helpDesc}>在空中时再次点击，跳得更高！</Text>
                </View>
              </View>
              
              <View style={styles.helpSection}>
                <View style={[styles.helpIcon, { backgroundColor: 'rgba(255,107,157,0.2)' }]}>
                  <Text style={styles.helpEmoji}>⬇️</Text>
                </View>
                <View style={styles.helpContent}>
                  <Text style={styles.helpName}>向下滑动</Text>
                  <Text style={styles.helpDesc}>下滑屏幕让恐龙下蹲，躲避飞鸟</Text>
                </View>
              </View>
              
              <View style={styles.obstacleSection}>
                <Text style={styles.sectionTitle}>🌵 障碍物图鉴</Text>
                
                <View style={styles.obstacleGrid}>
                  <View style={styles.obstacleItem}>
                    <View style={[styles.obstacleIcon, { backgroundColor: COLORS.OBSTACLE_CACTUS }]} />
                    <Text style={styles.obstacleName}>仙人掌</Text>
                    <Text style={styles.obstacleTip}>跳跃越过</Text>
                  </View>
                  
                  <View style={styles.obstacleItem}>
                    <View style={[styles.obstacleIcon, { backgroundColor: COLORS.OBSTACLE_ROCK, borderRadius: 12 }]} />
                    <Text style={styles.obstacleName}>岩石</Text>
                    <Text style={styles.obstacleTip}>跳跃越过</Text>
                  </View>
                  
                  <View style={styles.obstacleItem}>
                    <View style={[styles.obstacleIcon, { backgroundColor: COLORS.BIRD_BODY, borderRadius: 16 }]} />
                    <Text style={styles.obstacleName}>飞鸟</Text>
                    <Text style={styles.obstacleTip}>下蹲/跳过</Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.rulesSection}>
                <Text style={styles.sectionTitle}>📊 计分规则</Text>
                
                <View style={styles.ruleItem}>
                  <View style={styles.ruleDot} />
                  <Text style={styles.ruleText}>跑动距离 × 0.1 = 基础分数</Text>
                </View>
                <View style={styles.ruleItem}>
                  <View style={[styles.ruleDot, { backgroundColor: COLORS.SUCCESS }]} />
                  <Text style={styles.ruleText}>每越过一个障碍物 +10 分</Text>
                </View>
                <View style={styles.ruleItem}>
                  <View style={[styles.ruleDot, { backgroundColor: COLORS.WARNING }]} />
                  <Text style={styles.ruleText}>速度会持续增加，难度升级！</Text>
                </View>
              </View>
            </ScrollView>
            
            <GlassButton
              title="我知道了"
              variant="primary"
              size="lg"
              style={styles.closeButton}
              onPress={onClose}
            />
          </GlassCard>
        </Animated.View>
      </View>
    </Modal>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  card: {
    padding: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 1,
  },
  scrollView: {
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  helpSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.15)',
    padding: 14,
    borderRadius: 16,
  },
  helpIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  helpEmoji: {
    fontSize: 22,
  },
  helpContent: {
    flex: 1,
  },
  helpName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2,
  },
  helpDesc: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  obstacleSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  obstacleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  obstacleItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
  },
  obstacleIcon: {
    width: 32,
    height: 36,
    borderRadius: 8,
    marginBottom: 8,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  obstacleName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2,
  },
  obstacleTip: {
    fontSize: 10,
    color: COLORS.TEXT_TERTIARY,
    fontWeight: '500',
  },
  rulesSection: {
    marginBottom: 8,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 4,
  },
  ruleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.PRIMARY,
    marginRight: 10,
  },
  ruleText: {
    fontSize: 13,
    color: COLORS.TEXT_SECONDARY,
    fontWeight: '500',
    lineHeight: 20,
  },
  closeButton: {
    width: '100%',
    marginTop: 16,
  },
});

export default HelpModal;
