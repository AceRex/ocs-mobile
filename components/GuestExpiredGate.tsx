import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { LockSimple, ShieldWarning, SignIn, CheckCircle } from 'phosphor-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '../store/authStore';

export default function GuestExpiredGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, guestExpired, isLoading } = useAuthStore();

  if (isLoading || isAuthenticated || !guestExpired || pathname === '/login') {
    return null;
  }

  const handleSignIn = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
    router.push('/login' as any);
  };

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#1c0d24', '#0d0a14', '#15091e']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gradient}
        >
          {/* Ambient Glow */}
          <View style={styles.glowOrb} />

          <View style={styles.content}>
            {/* Top Icon Badge */}
            <View style={styles.iconContainer}>
              <LinearGradient
                colors={['#e11d48', '#9333ea']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconGradient}
              >
                <LockSimple size={36} color="#ffffff" weight="fill" />
              </LinearGradient>
            </View>

            {/* Badge */}
            <View style={styles.badge}>
              <ShieldWarning size={13} color="#FDA4AF" weight="bold" />
              <Text style={styles.badgeText}>1-HOUR GUEST SESSION EXPIRED</Text>
            </View>

            {/* Header Titles */}
            <Text style={styles.title}>Mobile Companion Locked</Text>
            <Text style={styles.subtitle}>
              Your 1-hour unauthenticated guest evaluation window has concluded.
              Sign in with your OCS account to unlock stage controls, lyric projection, teleprompter, and your full{' '}
              <Text style={styles.trialHighlight}>60-Day Free Trial</Text>.
            </Text>

            {/* Unlocked Features Summary */}
            <View style={styles.featuresCard}>
              <View style={styles.featureRow}>
                <CheckCircle size={15} color="#34D399" weight="fill" />
                <Text style={styles.featureText}>Remote Stage & Timer Control</Text>
              </View>
              <View style={styles.featureRow}>
                <CheckCircle size={15} color="#34D399" weight="fill" />
                <Text style={styles.featureText}>Song Lyrics & Scene Authoring</Text>
              </View>
              <View style={styles.featureRow}>
                <CheckCircle size={15} color="#34D399" weight="fill" />
                <Text style={styles.featureText}>Live Push-to-Talk Intercom</Text>
              </View>
              <View style={styles.featureRow}>
                <CheckCircle size={15} color="#34D399" weight="fill" />
                <Text style={styles.featureText}>60 Days Unrestricted Access</Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionGroup}>
              <TouchableOpacity
                onPress={handleSignIn}
                activeOpacity={0.85}
                style={styles.loginButtonWrapper}
              >
                <LinearGradient
                  colors={['#7c3aed', '#db2777']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButton}
                >
                  <SignIn size={18} color="#ffffff" weight="bold" />
                  <Text style={styles.loginButtonText}>Sign In to Unlock</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    elevation: 99999,
  },
  container: {
    flex: 1,
    backgroundColor: '#0d0a14',
  },
  gradient: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowOrb: {
    position: 'absolute',
    top: '15%',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(225, 29, 72, 0.18)',
    opacity: 0.8,
  },
  content: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 16,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(225, 29, 72, 0.18)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  badgeText: {
    color: '#FDA4AF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  trialHighlight: {
    color: '#C084FC',
    fontWeight: '700',
  },
  featuresCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '600',
  },
  actionGroup: {
    width: '100%',
    gap: 12,
  },
  loginButtonWrapper: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
