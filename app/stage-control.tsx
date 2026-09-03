import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CaretLeft,
  Monitor,
  MonitorPlay,
  ArrowLeft,
  ArrowRight,
  SkipBack,
  SkipForward,
  BookBookmark,
  Clock,
  ShieldCheck,
  LockKey,
  Broadcast,
  CheckCircle,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

export default function StageControlScreen() {
  const router = useRouter();
  const { isConnected, isPaired, isAdmin, sendStageControl, overlayContent, overlayTimer } = useSocketStore();
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  const formatTimer = (timer: any): string => {
    if (timer == null) return "00:00";
    const sec = typeof timer === "number" ? timer : Number(timer?.time || 0);
    if (!Number.isFinite(sec) || sec <= 0) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleCommand = (cmd: string, label: string) => {
    if (!isAdmin) {
      Alert.alert("Access Denied", "Admin privileges required for Stage Master Control.");
      return;
    }

    setFeedback({ text: `${label} triggered`, ok: true });
    sendStageControl(cmd)
      .then((res) => {
        if (!res.ok) {
          setFeedback({ text: res.error || "Action failed", ok: false });
        }
      })
      .catch((e: any) => {
        setFeedback({ text: e?.message || "Network error", ok: false });
      })
      .finally(() => {
        setTimeout(() => setFeedback(null), 2000);
      });
  };

  // Non-admin or unpaired guard
  if (!isPaired || !isAdmin) {
    return (
      <SafeAreaView className="flex-1 bg-[#0c0b10] justify-center items-center px-6">
        <StatusBar barStyle="light-content" />
        <View className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/30 items-center justify-center mb-6">
          <LockKey size={40} color="#c084fc" weight="duotone" />
        </View>
        <Text className="text-2xl font-black text-white text-center mb-2 tracking-tight">
          Admin Privileges Required
        </Text>
        <Text className="text-white/60 text-sm text-center leading-relaxed mb-8 max-w-[280px]">
          Stage Master Control is reserved for authenticated operators. Please ask the Desktop Controller operator to grant Admin status in the Mobile panel.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-white/10 border border-white/20 py-3.5 px-8 rounded-2xl flex-row items-center gap-2 active:scale-95"
        >
          <CaretLeft size={18} color="#ffffff" weight="bold" />
          <Text className="text-white font-bold text-sm">Return to Dashboard</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0a0a0f]">
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-white/10 bg-[#12111a]/80">
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 items-center justify-center active:scale-95"
          >
            <CaretLeft size={20} color="#ffffff" weight="bold" />
          </TouchableOpacity>
          <View>
            <View className="flex-row items-center gap-1.5">
              <Text className="text-white font-black text-base tracking-tight">
                Stage Master Control
              </Text>
              <View className="bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 rounded-full">
                <Text className="text-purple-300 text-[9px] font-black uppercase tracking-wider">
                  Admin
                </Text>
              </View>
            </View>
            <Text className="text-white/40 text-xs">Live Display &amp; Session Control</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-1.5 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-full">
          <View className="w-2 h-2 rounded-full bg-emerald-400" />
          <Text className="text-emerald-300 text-xs font-bold font-mono">LIVE SYNC</Text>
        </View>
      </View>

      {/* Feedback Toast */}
      {feedback && (
        <View
          className={`mx-5 mt-3 py-2.5 px-4 rounded-xl flex-row items-center gap-2 border ${
            feedback.ok
              ? "bg-emerald-500/20 border-emerald-500/40"
              : "bg-red-500/20 border-red-500/40"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle size={16} color="#34d399" weight="bold" />
          ) : (
            <ShieldCheck size={16} color="#f87171" weight="bold" />
          )}
          <Text
            className={`text-xs font-bold ${
              feedback.ok ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {feedback.text}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Live Stage Monitor */}
        <View className="mb-6 p-4 rounded-2xl bg-white/[0.04] border border-white/10 shadow-lg">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <View
                className={`w-2.5 h-2.5 rounded-full ${
                  overlayContent ? "bg-emerald-400" : "bg-red-500"
                }`}
              />
              <Text
                className={`text-xs font-black tracking-wider uppercase ${
                  overlayContent ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {overlayContent ? `ON AIR: ${String(overlayContent.type || "Live").toUpperCase()}` : "BLACKOUT / IDLE"}
              </Text>
            </View>

            {/* Timer Badge if active */}
            {overlayTimer != null && (typeof overlayTimer === "number" ? overlayTimer > 0 : Number(overlayTimer?.time) > 0) ? (
              <View className="flex-row items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                <Clock size={13} color="#f59e0b" weight="fill" />
                <Text className="text-amber-300 font-mono font-bold text-xs">
                  {formatTimer(overlayTimer)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Item Content Preview */}
          {overlayContent ? (
            <View className="bg-black/30 p-3 rounded-xl border border-white/5">
              <Text className="text-white font-bold text-sm mb-1" numberOfLines={1}>
                {overlayContent.type === "bible"
                  ? `📖 ${overlayContent.data?.title || "Scripture Passage"}`
                  : overlayContent.type === "presentation"
                  ? `📑 Slide ${(overlayContent.data?.slideIndex ?? 0) + 1}${overlayContent.data?.title ? " — " + overlayContent.data.title : ""}`
                  : overlayContent.type === "scene"
                  ? `🎵 Scene: ${overlayContent.data?.title || "Live"}`
                  : `📺 ${overlayContent.type}`}
              </Text>
              {overlayContent.data?.fullText ? (
                <Text className="text-white/60 text-xs leading-relaxed" numberOfLines={2}>
                  {overlayContent.data.fullText}
                </Text>
              ) : overlayContent.data?.subtitle ? (
                <Text className="text-white/60 text-xs leading-relaxed" numberOfLines={1}>
                  {overlayContent.data.subtitle}
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="bg-black/20 p-3 rounded-xl border border-dashed border-white/10 items-center justify-center py-3">
              <Text className="text-white/40 text-xs font-medium">
                Stage screens are currently blacked out or idle
              </Text>
            </View>
          )}
        </View>

        {/* Section 1: Primary Output Controls */}
        <View className="mb-6">
          <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">
            Primary Output Controls
          </Text>
          <View className="grid grid-cols-2 gap-3 flex-row flex-wrap">
            {/* Blackout */}
            <TouchableOpacity
              onPress={() => handleCommand("black_screen", "Blackout")}
              className="flex-1 min-w-[46%] bg-red-500/15 border border-red-500/30 p-4 rounded-2xl items-center justify-center gap-2 active:scale-95 shadow-lg"
            >
              <Monitor size={28} color="#f87171" weight="fill" />
              <Text className="text-red-300 font-bold text-sm tracking-wide">Blackout</Text>
              <Text className="text-red-400/60 text-[10px]">Mute Video Feed</Text>
            </TouchableOpacity>

            {/* Take Live */}
            <TouchableOpacity
              onPress={() => handleCommand("screen_on", "Take Live")}
              className="flex-1 min-w-[46%] bg-emerald-500/15 border border-emerald-500/30 p-4 rounded-2xl items-center justify-center gap-2 active:scale-95 shadow-lg"
            >
              <MonitorPlay size={28} color="#34d399" weight="fill" />
              <Text className="text-emerald-300 font-bold text-sm tracking-wide">Take Live</Text>
              <Text className="text-emerald-400/60 text-[10px]">Unmute Video Feed</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 2: Sequential Step Controls */}
        <View className="mb-6">
          <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">
            Navigation Controls
          </Text>
          <View className="flex-row gap-3 mb-3">
            {/* Previous */}
            <TouchableOpacity
              onPress={() => handleCommand("prev_verse", "Previous")}
              className="flex-1 bg-white/5 border border-white/10 p-4 rounded-2xl items-center justify-center gap-2 active:scale-95"
            >
              <ArrowLeft size={24} color="#e2e8f0" weight="bold" />
              <Text className="text-white font-bold text-xs tracking-wide">◀ Previous</Text>
            </TouchableOpacity>

            {/* Next */}
            <TouchableOpacity
              onPress={() => handleCommand("next_verse", "Next")}
              className="flex-1 bg-cyan-500/15 border border-cyan-500/30 p-4 rounded-2xl items-center justify-center gap-2 active:scale-95"
            >
              <ArrowRight size={24} color="#67e8f9" weight="bold" />
              <Text className="text-cyan-300 font-bold text-xs tracking-wide">Next ▶</Text>
            </TouchableOpacity>
          </View>

          {/* Jump Shortcuts */}
          <View className="flex-row gap-2.5">
            <TouchableOpacity
              onPress={() => handleCommand("first_slide", "First Item")}
              className="flex-1 bg-white/5 border border-white/10 py-3 rounded-xl items-center active:scale-95"
            >
              <Text className="text-white/70 font-bold text-[11px]">⏮ First</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleCommand("last_slide", "Last Item")}
              className="flex-1 bg-white/5 border border-white/10 py-3 rounded-xl items-center active:scale-95"
            >
              <Text className="text-white/70 font-bold text-[11px]">⏭ Last</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleCommand("first_verse", "First Verse")}
              className="flex-1 bg-white/5 border border-white/10 py-3 rounded-xl items-center active:scale-95"
            >
              <Text className="text-white/70 font-bold text-[11px]">📖 1st Verse</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleCommand("last_verse", "Last Verse")}
              className="flex-1 bg-white/5 border border-white/10 py-3 rounded-xl items-center active:scale-95"
            >
              <Text className="text-white/70 font-bold text-[11px]">📖 End Verse</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 3: Quick Stage Timers */}
        <View className="mb-6">
          <Text className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">
            Quick Stage Timers
          </Text>
          <View className="flex-row flex-wrap gap-2.5">
            {["5m", "10m", "15m", "30m"].map((timeLabel) => (
              <TouchableOpacity
                key={timeLabel}
                onPress={() => handleCommand(`timer_${timeLabel}`, `${timeLabel} Timer`)}
                className="flex-1 min-w-[20%] bg-white/5 border border-white/10 py-3.5 rounded-xl items-center justify-center active:scale-95"
              >
                <Text className="text-white font-mono font-bold text-xs">⏱ {timeLabel}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => handleCommand("timer_clear", "Clear Timer")}
              className="bg-red-500/10 border border-red-500/25 px-4 py-3.5 rounded-xl items-center justify-center active:scale-95"
            >
              <Text className="text-red-400 font-bold text-xs">Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Badge Footer */}
        <View className="bg-white/[0.03] border border-white/5 p-4 rounded-2xl flex-row items-center gap-3">
          <ShieldCheck size={24} color="#c084fc" weight="duotone" />
          <View className="flex-1">
            <Text className="text-white font-bold text-xs">Admin Session Verified</Text>
            <Text className="text-white/40 text-[11px] mt-0.5 leading-relaxed">
              Your device is paired and authorized by the OCS Controller operator.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
