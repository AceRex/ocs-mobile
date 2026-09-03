import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  EnvelopeSimple,
  LockSimple,
  Eye,
  EyeSlash,
  ArrowLeft,
  SignIn,
  WarningCircle,
  Gear,
  CheckCircle,
  ArrowSquareOut,
} from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "../store/authStore";

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, authError, setAuthError, guestExpired } =
    useAuthStore();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customServer, setCustomServer] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim()) {
      setAuthError("Please enter your account email address.");
      return;
    }
    if (!password) {
      setAuthError("Please enter your password.");
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (_) {}

    const result = await login(
      email,
      password,
      customServer.trim() || undefined,
    );

    if (result.success) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (_) {}
      setSuccessMessage("Successfully signed in!");
      setTimeout(() => {
        router.replace("/");
      }, 500);
    } else {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (_) {}
    }
  };

  const handleOpenSignup = () => {
    Linking.openURL("https://ocs-web-three.vercel.app/signup").catch(() => {});
  };

  const handleOpenForgotPassword = () => {
    Linking.openURL("https://ocs-web-three.vercel.app/forgot-password").catch(
      () => {},
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 44 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Header Bar */}
          <View style={styles.topBar}>
            {!guestExpired ? (
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.backButton}
                activeOpacity={0.7}
              >
                <ArrowLeft size={20} color="#ffffff" weight="bold" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}

            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>Login to your account</Text>
            </View>
          </View>

          {/* Titles */}
          <View style={styles.titleSection}>
            <Text style={styles.mainTitle}>Welcome Back</Text>
            <Text style={styles.subTitle}>
              Sign in to your OCS account to unlock all mobile companion
              features, remote stage controls, and cloud sync.
            </Text>
          </View>

          {/* Success Banner */}
          {successMessage && (
            <View style={styles.successBanner}>
              <CheckCircle size={18} color="#34D399" weight="fill" />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          )}

          {/* Error Banner */}
          {authError && !successMessage && (
            <View style={styles.errorBanner}>
              <WarningCircle size={18} color="#F87171" weight="fill" />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.form}>
            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  ref={emailRef}
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    if (authError) setAuthError(null);
                  }}
                  placeholder="pastor@church.org"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  showSoftInputOnFocus={true}
                  style={styles.textInputWithIcon}
                />
                <View style={styles.inputIconLeft} pointerEvents="none">
                  <EnvelopeSimple
                    size={20}
                    color="rgba(255,255,255,0.4)"
                    weight="bold"
                  />
                </View>
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <View style={styles.passwordHeader}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <TouchableOpacity
                  onPress={handleOpenForgotPassword}
                  activeOpacity={0.7}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  ref={passwordRef}
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (authError) setAuthError(null);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  showSoftInputOnFocus={true}
                  style={[styles.textInputWithIcon, { paddingRight: 48 }]}
                />
                <View style={styles.inputIconLeft} pointerEvents="none">
                  <LockSimple
                    size={20}
                    color="rgba(255,255,255,0.4)"
                    weight="bold"
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  activeOpacity={0.7}
                  style={styles.eyeButtonAbsolute}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  {showPassword ? (
                    <EyeSlash size={18} color="rgba(255,255,255,0.5)" />
                  ) : (
                    <Eye size={18} color="rgba(255,255,255,0.5)" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
              style={styles.submitButtonWrapper}
            >
              <LinearGradient
                colors={["#7c3aed", "#9333ea", "#db2777"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitButton}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <SignIn size={18} color="#ffffff" weight="bold" />
                    <Text style={styles.submitButtonText}>Sign In to OCS</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Footer Registration Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account yet?</Text>
            <TouchableOpacity
              onPress={handleOpenSignup}
              style={styles.signupButton}
              activeOpacity={0.7}
            >
              <Text style={styles.signupText}>Start 60-Day Free Trial</Text>
              <ArrowSquareOut size={14} color="#C084FC" weight="bold" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#121212",
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  gearButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  titleSection: {
    marginBottom: 24,
  },
  mainTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  subTitle: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    lineHeight: 20,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    borderColor: "rgba(52, 211, 153, 0.3)",
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  successText: {
    color: "#6EE7B7",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderWidth: 1,
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  advancedBox: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  advancedLabel: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
  },
  advancedInput: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    color: "#ffffff",
    fontSize: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  form: {
    gap: 20,
    flex: 1,
  },
  inputGroup: {
    gap: 8,
  },
  passwordHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inputLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  forgotText: {
    color: "#C084FC",
    fontSize: 11,
    fontWeight: "700",
  },
  inputContainer: {
    position: "relative",
    width: "100%",
    justifyContent: "center",
  },
  textInputWithIcon: {
    width: "100%",
    height: 52,
    backgroundColor: "#1E1E24",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 16,
    paddingLeft: 46,
    paddingRight: 16,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  inputIconLeft: {
    position: "absolute",
    left: 14,
    zIndex: 2,
  },
  eyeButtonAbsolute: {
    position: "absolute",
    right: 12,
    zIndex: 2,
    padding: 6,
  },
  submitButtonWrapper: {
    marginTop: 8,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  submitButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  footer: {
    alignItems: "center",
    marginTop: 32,
    gap: 8,
  },
  footerText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
  },
  signupButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  signupText: {
    color: "#C084FC",
    fontSize: 13,
    fontWeight: "800",
  },
});
