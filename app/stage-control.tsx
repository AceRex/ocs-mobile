import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
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
  CaretDoubleLeft,
  CaretDoubleRight,
  BookOpen,
  BookBookmark,
  Clock,
  ShieldCheck,
  LockKey,
  Broadcast,
  CheckCircle,
  Warning,
  ArrowUUpLeft,
  StopCircle,
  Timer as TimerIcon,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";

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
        setTimeout(() => setFeedback(null), 2500);
      });
  };

  // ─── Non-Admin or Unpaired Guard ─────────────────────────────────────────────
  if (!isPaired || !isAdmin) {
    return (
      <SafeAreaView className="flex-1 bg-zinc-950 justify-center items-center px-6">
        <StatusBar barStyle="light-content" backgroundColor="#09090b" />
        <Card className="w-full max-w-sm items-center p-6 border-zinc-800/80 bg-zinc-900/90">
          <View className="w-16 h-16 rounded-[12px] bg-purple-500/15 border border-purple-500/30 items-center justify-center mb-5">
            <LockKey size={32} color="#c084fc" weight="duotone" />
          </View>
          <Text className="text-xl font-bold text-white text-center mb-2 tracking-tight">
            Admin Privileges Required
          </Text>
          <Text className="text-zinc-400 text-xs text-center leading-relaxed mb-6">
            Stage Master Control is reserved for authenticated operators. Please request Admin permission in the Desktop Controller mobile panel.
          </Text>
          <Button
            variant="outline"
            className="w-full"
            onPress={() => router.back()}
          >
            <CaretLeft size={16} color="#ffffff" weight="bold" />
            <Text className="text-white font-bold text-xs ml-1.5">Return to Dashboard</Text>
          </Button>
        </Card>
      </SafeAreaView>
    );
  }

  const isScreenMuted = !overlayContent;
  const activeTimerSeconds =
    overlayTimer != null
      ? typeof overlayTimer === "number"
        ? overlayTimer
        : Number(overlayTimer?.time || 0)
      : 0;

  return (
    <SafeAreaView className="flex-1 bg-zinc-950">
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* ─── Header ───────────────────────────────────────────────────────────── */}
      <View className="px-5 py-3 flex-row items-center justify-between border-b border-zinc-800/80 bg-zinc-950/90">
        <View className="flex-row items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onPress={() => router.back()}
            className="w-10 h-10 border-zinc-800 bg-zinc-900/80"
          >
            <CaretLeft size={18} color="#e4e4e7" weight="bold" />
          </Button>
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="text-white font-bold text-base tracking-tight">
                Stage Master
              </Text>
              <Badge variant="purple" isPill>
                Admin
              </Badge>
            </View>
            <Text className="text-zinc-400 text-xs mt-0.5">Live Output &amp; Presentation Deck</Text>
          </View>
        </View>

        <Badge variant={isConnected ? "success" : "destructive"} isPill>
          <View
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <Text
            className={`text-[10px] font-bold font-mono tracking-wider ${
              isConnected ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isConnected ? "LIVE SYNC" : "OFFLINE"}
          </Text>
        </Badge>
      </View>

      {/* ─── Feedback Toast ───────────────────────────────────────────────────── */}
      {feedback && (
        <View
          className={`mx-5 mt-3 py-2.5 px-4 rounded-[12px] flex-row items-center gap-2.5 border ${
            feedback.ok
              ? "bg-emerald-950/50 border-emerald-800/60"
              : "bg-red-950/50 border-red-800/60"
          }`}
        >
          {feedback.ok ? (
            <CheckCircle size={16} color="#34d399" weight="bold" />
          ) : (
            <Warning size={16} color="#f87171" weight="bold" />
          )}
          <Text
            className={`text-xs font-bold tracking-tight ${
              feedback.ok ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {feedback.text}
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── 1. Live On-Air Master Confidence Monitor ───────────────────────── */}
        <Card className="mb-5 bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="flex-row items-center justify-between pb-0 mb-3">
            <View className="flex-row items-center gap-2">
              <View
                className={`w-2 h-2 rounded-full ${
                  !isScreenMuted ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              <Text
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  !isScreenMuted ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {!isScreenMuted
                  ? `ON AIR • ${String(overlayContent?.type || "Live").toUpperCase()}`
                  : "BLACKOUT • MUTED"}
              </Text>
            </View>

            {activeTimerSeconds > 0 ? (
              <Badge variant="amber" isPill>
                <Clock size={11} color="#f59e0b" weight="fill" />
                <Text className="text-amber-300 font-mono font-bold text-[11px]">
                  {formatTimer(overlayTimer)}
                </Text>
              </Badge>
            ) : null}
          </CardHeader>

          {/* Rendered Live Preview Box */}
          {!isScreenMuted && overlayContent ? (
            <View className="bg-black/60 p-4 rounded-[12px] border border-zinc-800/90">
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center gap-2 flex-1 mr-2">
                  {overlayContent.type === "bible" ? (
                    <BookOpen size={16} color="#67e8f9" weight="fill" />
                  ) : overlayContent.type === "presentation" ? (
                    <Monitor size={16} color="#c084fc" weight="fill" />
                  ) : (
                    <Broadcast size={16} color="#f472b6" weight="fill" />
                  )}
                  <Text className="text-white font-bold text-sm tracking-tight" numberOfLines={1}>
                    {overlayContent.type === "bible"
                      ? overlayContent.data?.title || overlayContent.reference || "Holy Scripture"
                      : overlayContent.type === "presentation"
                      ? `Slide ${(overlayContent.data?.slideIndex ?? overlayContent.slideNumber ?? 0) + (overlayContent.data?.slideIndex != null ? 1 : 0)}${
                          overlayContent.data?.title ? " • " + overlayContent.data.title : ""
                        }`
                      : overlayContent.data?.title || "Live Scene"}
                  </Text>
                </View>

                {overlayContent.version || overlayContent.data?.version ? (
                  <Badge variant="secondary">
                    {overlayContent.version || overlayContent.data?.version}
                  </Badge>
                ) : null}
              </View>

              {overlayContent.data?.fullText || overlayContent.text ? (
                <Text className="text-zinc-300 text-xs leading-relaxed" numberOfLines={3}>
                  "{overlayContent.data?.fullText || overlayContent.text}"
                </Text>
              ) : overlayContent.data?.subtitle || overlayContent.subtitle ? (
                <Text className="text-zinc-400 text-xs leading-relaxed" numberOfLines={2}>
                  {overlayContent.data?.subtitle || overlayContent.subtitle}
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="bg-black/40 p-5 rounded-[12px] border border-dashed border-zinc-800 items-center justify-center">
              <Monitor size={28} color="#71717a" weight="thin" />
              <Text className="text-zinc-400 text-xs font-medium mt-2">
                Sanctuary screen is blacked out or idle
              </Text>
            </View>
          )}

          {/* Quick Output Routing Status Footer */}
          <View className="flex-row items-center justify-between pt-3 mt-3 border-t border-zinc-800/80">
            <Text className="text-zinc-400 text-[11px]">Active Routing</Text>
            <View className="flex-row items-center gap-2">
              <Badge variant="outline">General View</Badge>
              <Badge variant="outline">Speaker View</Badge>
            </View>
          </View>
        </Card>

        {/* ─── 2. Primary Broadcast Shutter Controls ─────────────────────────── */}
        <Card className="mb-5 bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="pb-0 mb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Broadcast Shutter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <View className="flex-row gap-3">
              {/* Blackout */}
              <Button
                variant="destructiveOutline"
                onPress={() => handleCommand("black_screen", "Blackout")}
                className="flex-1 h-20 flex-col items-center justify-center p-2 rounded-[12px] border-red-900/50 bg-red-950/20"
              >
                <Monitor size={22} color="#f87171" weight="fill" />
                <Text className="text-red-300 font-bold text-xs mt-1.5">Blackout</Text>
                <Text className="text-red-400/60 text-[10px] mt-0.5">Mute Screen</Text>
              </Button>

              {/* Take Live */}
              <Button
                variant="successOutline"
                onPress={() => handleCommand("screen_on", "Take Live")}
                className="flex-1 h-20 flex-col items-center justify-center p-2 rounded-[12px] border-emerald-900/50 bg-emerald-950/20"
              >
                <MonitorPlay size={22} color="#34d399" weight="fill" />
                <Text className="text-emerald-300 font-bold text-xs mt-1.5">Take Live</Text>
                <Text className="text-emerald-400/60 text-[10px] mt-0.5">Unmute Screen</Text>
              </Button>
            </View>
          </CardContent>
        </Card>

        {/* ─── 3. Transport & Navigation Deck ─────────────────────────────────── */}
        <Card className="mb-5 bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="pb-0 mb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Transport &amp; Navigation Deck
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Primary Step Row */}
            <View className="flex-row gap-3">
              <Button
                variant="outline"
                size="lg"
                onPress={() => handleCommand("prev_verse", "Previous Item")}
                className="flex-1 h-14 bg-zinc-900/80 border-zinc-800"
              >
                <ArrowLeft size={20} color="#e4e4e7" weight="bold" />
                <Text className="text-white font-bold text-sm ml-2">Previous</Text>
              </Button>

              <Button
                variant="accent"
                size="lg"
                onPress={() => handleCommand("next_verse", "Next Item")}
                className="flex-1 h-14 bg-cyan-600 border-cyan-500"
              >
                <Text className="text-white font-bold text-sm mr-2">Next</Text>
                <ArrowRight size={20} color="#ffffff" weight="bold" />
              </Button>
            </View>

            {/* 2x2 Balanced Jump Shortcuts */}
            <View className="flex-row gap-2.5">
              <Button
                variant="secondary"
                onPress={() => handleCommand("first_slide", "First Slide")}
                className="flex-1 py-3 bg-zinc-800/80 border border-zinc-700/50"
              >
                <CaretDoubleLeft size={14} color="#a1a1aa" weight="bold" />
                <Text className="text-zinc-200 font-bold text-xs ml-1.5">1st Slide</Text>
              </Button>

              <Button
                variant="secondary"
                onPress={() => handleCommand("last_slide", "Last Slide")}
                className="flex-1 py-3 bg-zinc-800/80 border border-zinc-700/50"
              >
                <Text className="text-zinc-200 font-bold text-xs mr-1.5">End Slide</Text>
                <CaretDoubleRight size={14} color="#a1a1aa" weight="bold" />
              </Button>
            </View>

            <View className="flex-row gap-2.5">
              <Button
                variant="secondary"
                onPress={() => handleCommand("first_verse", "First Verse")}
                className="flex-1 py-3 bg-zinc-800/80 border border-zinc-700/50"
              >
                <BookOpen size={14} color="#a1a1aa" weight="bold" />
                <Text className="text-zinc-200 font-bold text-xs ml-1.5">1st Verse</Text>
              </Button>

              <Button
                variant="secondary"
                onPress={() => handleCommand("last_verse", "Last Verse")}
                className="flex-1 py-3 bg-zinc-800/80 border border-zinc-700/50"
              >
                <Text className="text-zinc-200 font-bold text-xs mr-1.5">End Verse</Text>
                <BookBookmark size={14} color="#a1a1aa" weight="bold" />
              </Button>
            </View>

            {/* Return to Presentation Shortcut */}
            <Button
              variant="outline"
              onPress={() => handleCommand("return_to_presentation", "Return to Slides")}
              className="w-full py-2.5 bg-zinc-950/60 border-zinc-800"
            >
              <ArrowUUpLeft size={15} color="#c084fc" weight="bold" />
              <Text className="text-purple-300 font-bold text-xs ml-2">
                Return to Slide Deck
              </Text>
            </Button>
          </CardContent>
        </Card>

        {/* ─── 4. Quick Stage Timers ──────────────────────────────────────────── */}
        <Card className="mb-5 bg-zinc-900/90 border-zinc-800/80">
          <CardHeader className="pb-0 mb-3">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Stage Timers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <View className="flex-row gap-2">
              {["5m", "10m", "15m", "30m"].map((timeLabel) => (
                <Button
                  key={timeLabel}
                  variant="outline"
                  onPress={() => handleCommand(`timer_${timeLabel}`, `${timeLabel} Timer`)}
                  className="flex-1 py-2.5 bg-zinc-900/80 border-zinc-800"
                >
                  <Clock size={12} color="#f59e0b" weight="fill" />
                  <Text className="text-zinc-200 font-mono font-bold text-xs ml-1">
                    {timeLabel}
                  </Text>
                </Button>
              ))}
            </View>

            <Button
              variant="destructiveOutline"
              onPress={() => handleCommand("timer_clear", "Clear Timer")}
              className="w-full py-2.5 border-red-900/40 bg-red-950/20"
            >
              <StopCircle size={15} color="#f87171" weight="bold" />
              <Text className="text-red-400 font-bold text-xs ml-2">Reset Stage Timer</Text>
            </Button>
          </CardContent>
        </Card>

        {/* ─── 5. Security & Workstation Status ─────────────────────────────────── */}
        <Card className="bg-zinc-900/40 border-zinc-800/50 p-4">
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-[12px] bg-purple-500/10 border border-purple-500/30 items-center justify-center">
              <ShieldCheck size={20} color="#c084fc" weight="duotone" />
            </View>
            <View className="flex-1">
              <Text className="text-white font-bold text-xs">Admin Session Active</Text>
              <Text className="text-zinc-400 text-[11px] mt-0.5 leading-relaxed">
                Device authorized by OCS Desktop Controller. Commands sync immediately over LAN.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
