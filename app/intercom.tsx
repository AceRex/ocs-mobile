import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import {
  ArrowLeft,
  Microphone,
  MicrophoneSlash,
  CheckCircle,
  WarningCircle,
  Sparkle,
  Users,
  Broadcast,
  DeviceMobile,
  Waveform,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

// Safe dynamic loader for expo-audio on Expo SDK 57+
let ExpoAudio: any = null;
try {
  ExpoAudio = require("expo-audio");
} catch (e) {}

type IntercomMode = "peers" | "controller" | "mic";

export default function IntercomScreen() {
  const router = useRouter();
  const {
    isConnected,
    isPaired,
    setVoiceActive,
    sendVoiceAudio,
    peers,
    fetchPeers,
    speakToPeer,
    incomingIntercom,
    clearIncomingIntercom,
    streamMicChunk,
  } = useSocketStore();

  const [activeMode, setActiveMode] = useState<IntercomMode>("controller");
  const [selectedTargetPeer, setSelectedTargetPeer] = useState<string>("all"); // 'all' or socketId

  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "sending" | "confirmed" | "error">("idle");
  const [transcriptResult, setTranscriptResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Mode 3: Wireless Mic Live State
  const [isLiveMicActive, setIsLiveMicActive] = useState(false);
  const [liveMicLevel, setLiveMicLevel] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const nativeRecorderRef = useRef<any>(null);
  const webRecorderRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const liveMicIntervalRef = useRef<any>(null);

  useEffect(() => {
    // Check permission on mount
    if (ExpoAudio?.requestRecordingPermissionsAsync) {
      ExpoAudio.requestRecordingPermissionsAsync()
        .then((res: any) => setHasPermission(!!res.granted))
        .catch(() => setHasPermission(false));
    } else if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          setHasPermission(true);
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch(() => setHasPermission(false));
    } else {
      setHasPermission(true);
    }

    if (isPaired) {
      fetchPeers();
      const interval = setInterval(fetchPeers, 3000);
      return () => clearInterval(interval);
    }
  }, [isPaired]);

  // Mode 3: Live mic VU meter simulation & streaming
  useEffect(() => {
    if (isLiveMicActive) {
      liveMicIntervalRef.current = setInterval(() => {
        const level = Math.random() * 0.7 + 0.3; // simulate live audio input level
        setLiveMicLevel(level);
        streamMicChunk({ volume: level, active: true });
      }, 100);
    } else {
      if (liveMicIntervalRef.current) clearInterval(liveMicIntervalRef.current);
      setLiveMicLevel(0);
      streamMicChunk({ volume: 0, active: false });
    }
    return () => {
      if (liveMicIntervalRef.current) clearInterval(liveMicIntervalRef.current);
    };
  }, [isLiveMicActive]);

  useEffect(() => {
    if (recordingState === "recording") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recordingState]);

  const startRecording = async () => {
    if (!isConnected || !isPaired) {
      setRecordingState("error");
      setErrorMessage("Connect and pair with Desktop Controller first.");
      return;
    }

    setTranscriptResult(null);
    setErrorMessage(null);
    recordStartTimeRef.current = Date.now();

    try {
      if (ExpoAudio?.AudioRecorder) {
        const perm = await ExpoAudio.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setHasPermission(false);
          setRecordingState("error");
          setErrorMessage("Microphone permission denied.");
          return;
        }
        setHasPermission(true);

        const recorder = new ExpoAudio.AudioRecorder(
          ExpoAudio.RecordingPresets?.HIGH_QUALITY || {}
        );
        await recorder.prepareToRecordAsync();
        recorder.record();
        nativeRecorderRef.current = recorder;

        setRecordingState("recording");
        setVoiceActive(true);
      } else if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webChunksRef.current = [];
        const mediaRecorder = new (window as any).MediaRecorder(stream);
        webRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) webChunksRef.current.push(e.data);
        };
        mediaRecorder.start(100);

        setRecordingState("recording");
        setVoiceActive(true);
      } else {
        setRecordingState("recording");
        setVoiceActive(true);
      }
    } catch (err: any) {
      console.error("Recording start error:", err);
      setRecordingState("error");
      setErrorMessage(err.message || "Failed to start microphone.");
      setVoiceActive(false);
    }
  };

  const stopRecording = async () => {
    if (recordingState !== "recording") return;

    setRecordingState("sending");
    setVoiceActive(false);
    const durationMs = Date.now() - recordStartTimeRef.current;

    try {
      let base64Audio = "";
      let format = "m4a";

      if (nativeRecorderRef.current) {
        const recorder = nativeRecorderRef.current;
        nativeRecorderRef.current = null;
        await recorder.stop();
        const uri = recorder.uri;

        if (uri) {
          base64Audio = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
      } else if (webRecorderRef.current) {
        const recorder = webRecorderRef.current;
        webRecorderRef.current = null;

        await new Promise<void>((resolve) => {
          recorder.onstop = async () => {
            const audioBlob = new Blob(webChunksRef.current, { type: recorder.mimeType || "audio/webm" });
            if (recorder.stream) recorder.stream.getTracks().forEach((t: any) => t.stop());

            const reader = new FileReader();
            reader.onloadend = () => {
              const dataUrl = reader.result as string;
              base64Audio = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : dataUrl;
              format = recorder.mimeType || "webm";
              resolve();
            };
            reader.readAsDataURL(audioBlob);
          };
          recorder.stop();
        });
      }

      if (!base64Audio) {
        setRecordingState("idle");
        return;
      }

      // ── Dispatch according to Active Mode ──
      if (activeMode === "peers") {
        // Mode 1: Speak to other connected users
        const res = await speakToPeer({
          target: selectedTargetPeer,
          audioBase64: base64Audio,
          format,
          durationMs,
        });
        if (res.ok) {
          setRecordingState("confirmed");
          setTranscriptResult(`Audio sent to ${selectedTargetPeer === "all" ? "All Users" : "Selected User"}`);
        } else {
          setRecordingState("error");
          setErrorMessage(res.error || "Failed to deliver audio to peers");
        }
      } else if (activeMode === "controller") {
        // Mode 2: Speak to Desktop Controller
        const res = await sendVoiceAudio({
          dataBase64: base64Audio,
          format,
          durationMs,
        });

        if (res.ok) {
          setRecordingState("confirmed");
          setTranscriptResult(res.text || "Command executed on Desktop Controller");
        } else {
          setRecordingState("error");
          setErrorMessage(res.error || "Desktop voice command failed");
        }
      } else {
        setRecordingState("idle");
      }
    } catch (err: any) {
      console.error("Recording stop error:", err);
      setRecordingState("error");
      setErrorMessage(err.message || "Failed to process audio.");
    }
  };

  const getTargetPeerName = () => {
    if (selectedTargetPeer === "all") return "All Connected Users";
    const found = peers.find((p) => p.id === selectedTargetPeer);
    return found ? found.name : "Selected User";
  };

  return (
    <SafeAreaView className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <View className="items-center">
          <Text className="text-white text-lg font-bold">Intercom & Voice</Text>
          <Text className="text-white/40 text-xs">Multi-Mode Audio Hub</Text>
        </View>
        <View
          className={`px-2.5 py-1 rounded-full flex-row items-center gap-1.5 border ${
            isPaired
              ? "bg-green-500/10 border-green-500/30"
              : isConnected
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-white/5 border-white/10"
          }`}
        >
          <View
            className={`w-1.5 h-1.5 rounded-full ${
              isPaired ? "bg-green-400" : isConnected ? "bg-amber-400" : "bg-white/30"
            }`}
          />
          <Text
            className={`text-[10px] font-bold ${
              isPaired ? "text-green-400" : isConnected ? "text-amber-400" : "text-white/40"
            }`}
          >
            {isPaired ? "Paired" : isConnected ? "Connecting" : "Offline"}
          </Text>
        </View>
      </View>

      {/* Mode Segmented Selector */}
      <View className="flex-row p-1.5 bg-white/5 mx-4 my-3 rounded-2xl border border-white/10">
        <TouchableOpacity
          onPress={() => {
            setActiveMode("peers");
            setTranscriptResult(null);
            setErrorMessage(null);
          }}
          className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 ${
            activeMode === "peers" ? "bg-purple-600 shadow-md shadow-purple-600/30" : ""
          }`}
        >
          <Users size={16} color={activeMode === "peers" ? "white" : "#9ca3af"} weight="bold" />
          <Text className={`text-xs font-bold ${activeMode === "peers" ? "text-white" : "text-white/60"}`}>
            1. Other Users
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setActiveMode("controller");
            setTranscriptResult(null);
            setErrorMessage(null);
          }}
          className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 ${
            activeMode === "controller" ? "bg-blue-600 shadow-md shadow-blue-600/30" : ""
          }`}
        >
          <Sparkle size={16} color={activeMode === "controller" ? "white" : "#9ca3af"} weight="bold" />
          <Text className={`text-xs font-bold ${activeMode === "controller" ? "text-white" : "text-white/60"}`}>
            2. Controller
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setActiveMode("mic");
            setTranscriptResult(null);
            setErrorMessage(null);
          }}
          className={`flex-1 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 ${
            activeMode === "mic" ? "bg-emerald-600 shadow-md shadow-emerald-600/30" : ""
          }`}
        >
          <Broadcast size={16} color={activeMode === "mic" ? "white" : "#9ca3af"} weight="bold" />
          <Text className={`text-xs font-bold ${activeMode === "mic" ? "text-white" : "text-white/60"}`}>
            3. Work as Mic
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }} className="flex-1">
        {/* Incoming Intercom Message Notification */}
        {incomingIntercom && (
          <View className="w-full bg-purple-600/20 border border-purple-500/40 rounded-2xl p-4 mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <Waveform size={24} color="#C084FC" weight="duotone" />
              <View className="flex-1">
                <Text className="text-purple-300 text-xs font-bold uppercase tracking-wider">
                  Incoming Voice Message
                </Text>
                <Text className="text-white font-bold text-sm">From: {incomingIntercom.fromName}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={clearIncomingIntercom}
              className="bg-white/10 px-3 py-1.5 rounded-lg"
            >
              <Text className="text-white text-xs font-semibold">Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Category 1: Speak to Other Users ── */}
        {activeMode === "peers" && (
          <View className="w-full mb-4">
            <View className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
              <Text className="text-white font-bold text-sm mb-1 flex-row items-center gap-1.5">
                👥 Select Destination
              </Text>
              <Text className="text-white/50 text-xs mb-3 leading-relaxed">
                Choose to broadcast your voice to all connected team members, or tap a specific device.
              </Text>

              {/* Target Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setSelectedTargetPeer("all")}
                  className={`px-4 py-2 rounded-xl flex-row items-center gap-2 border ${
                    selectedTargetPeer === "all"
                      ? "bg-purple-600 border-purple-400"
                      : "bg-white/5 border-white/10"
                  }`}
                >
                  <Users size={16} color="white" weight="bold" />
                  <Text className="text-white font-bold text-xs">Speak to All</Text>
                </TouchableOpacity>

                {peers.map((peer) => (
                  <TouchableOpacity
                    key={peer.id}
                    onPress={() => setSelectedTargetPeer(peer.id)}
                    className={`px-3.5 py-2 rounded-xl flex-row items-center gap-2 border ${
                      selectedTargetPeer === peer.id
                        ? "bg-purple-600 border-purple-400"
                        : "bg-white/5 border-white/10"
                    }`}
                  >
                    <DeviceMobile size={15} color="white" weight="bold" />
                    <Text className="text-white text-xs font-semibold">{peer.name}</Text>
                  </TouchableOpacity>
                ))}

                {peers.length === 0 && (
                  <View className="px-3 py-2">
                    <Text className="text-white/30 text-xs italic">No other companions online</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* ── Category 2: Speak to Controller ── */}
        {activeMode === "controller" && (
          <View className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
            <View className="flex-row items-center gap-2 mb-1">
              <Sparkle size={18} color="#60A5FA" weight="duotone" />
              <Text className="text-white/90 font-bold text-sm">Controller Voice Prompts</Text>
            </View>
            <Text className="text-white/50 text-xs leading-relaxed">
              Hold the button and speak. Desktop popup will notify the operator and execute:
            </Text>
            <View className="flex-row flex-wrap gap-2 mt-2.5">
              <View className="bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
                <Text className="text-blue-300 text-[11px] font-semibold">📖 "John 3:16"</Text>
              </View>
              <View className="bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                <Text className="text-amber-300 text-[11px] font-semibold">⏱️ "Set timer 30 mins"</Text>
              </View>
              <View className="bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg">
                <Text className="text-purple-300 text-[11px] font-semibold">📑 "Next slide"</Text>
              </View>
              <View className="bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                <Text className="text-emerald-300 text-[11px] font-semibold">🎬 "Next page"</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Category 3: Work as Mic (Wireless Mic) ── */}
        {activeMode === "mic" && (
          <View className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 mb-4 items-center">
            <View className="flex-row items-center gap-2 mb-1 self-start">
              <Broadcast size={18} color="#34D399" weight="duotone" />
              <Text className="text-white/90 font-bold text-sm">Live Wireless Microphone</Text>
            </View>
            <Text className="text-white/50 text-xs leading-relaxed self-start mb-4">
              Turn your mobile phone into an active stage or pulpit wireless mic for the desktop system.
            </Text>

            {/* Live VU Meter */}
            <View className="w-full bg-black/40 border border-white/10 rounded-xl p-3 mb-4">
              <View className="flex-row justify-between items-center mb-1.5">
                <Text className="text-white/50 text-[11px] font-semibold">Audio Input Level</Text>
                <Text className={`text-[11px] font-bold ${isLiveMicActive ? "text-green-400" : "text-white/30"}`}>
                  {isLiveMicActive ? `${Math.round(liveMicLevel * 100)}%` : "MUTED"}
                </Text>
              </View>
              <View className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex-row">
                <View
                  style={{ width: `${Math.min(100, liveMicLevel * 100)}%` }}
                  className={`h-full rounded-full ${
                    liveMicLevel > 0.8 ? "bg-red-500" : liveMicLevel > 0.5 ? "bg-amber-400" : "bg-emerald-500"
                  }`}
                />
              </View>
            </View>

            {/* Mic Toggle Switch */}
            <TouchableOpacity
              onPress={() => setIsLiveMicActive(!isLiveMicActive)}
              className={`w-full py-3.5 rounded-2xl items-center justify-center flex-row gap-2 border ${
                isLiveMicActive
                  ? "bg-red-600 border-red-500 shadow-lg shadow-red-600/40"
                  : "bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-600/30"
              }`}
            >
              <Microphone size={20} color="white" weight="bold" />
              <Text className="text-white font-bold text-sm">
                {isLiveMicActive ? "MUTE LIVE MIC" : "UNMUTE & GO LIVE"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Central PTT Button (For Modes 1 & 2) */}
        {activeMode !== "mic" && (
          <View className="items-center justify-center my-6">
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  transform: [{ scale: pulseAnim }],
                  backgroundColor:
                    recordingState === "recording"
                      ? activeMode === "peers"
                        ? "rgba(147, 51, 234, 0.25)"
                        : "rgba(220, 38, 38, 0.25)"
                      : recordingState === "sending"
                      ? "rgba(37, 99, 235, 0.2)"
                      : "rgba(255, 255, 255, 0.05)",
                  borderColor:
                    recordingState === "recording"
                      ? activeMode === "peers"
                        ? "#a855f7"
                        : "#ef4444"
                      : recordingState === "sending"
                      ? "#60a5fa"
                      : "rgba(255, 255, 255, 0.15)",
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPressIn={startRecording}
                onPressOut={stopRecording}
                disabled={recordingState === "sending"}
                style={[
                  styles.pttButton,
                  {
                    backgroundColor:
                      recordingState === "recording"
                        ? activeMode === "peers"
                          ? "#9333ea"
                          : "#dc2626"
                        : recordingState === "sending"
                        ? "#2563eb"
                        : activeMode === "peers"
                        ? "#7e22ce"
                        : "#2563eb",
                  },
                ]}
              >
                {recordingState === "sending" ? (
                  <ActivityIndicator size="large" color="white" />
                ) : (
                  <Microphone size={54} color="white" weight={recordingState === "recording" ? "fill" : "bold"} />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* State Label */}
        {activeMode !== "mic" && (
          <View className="items-center mb-6">
            <Text className="text-white font-black text-xl mb-1">
              {recordingState === "recording"
                ? activeMode === "peers"
                  ? `Speaking to ${getTargetPeerName()}…`
                  : "Listening to Prompt…"
                : recordingState === "sending"
                ? "Processing Audio…"
                : recordingState === "confirmed"
                ? "Audio Sent"
                : activeMode === "peers"
                ? `Hold to Talk (${getTargetPeerName()})`
                : "Hold to Speak to Controller"}
            </Text>
            <Text className="text-white/40 text-xs">
              {recordingState === "recording"
                ? "Release button when finished speaking"
                : "Hold and speak clearly into your microphone"}
            </Text>
          </View>
        )}

        {/* Transcript / Result Banner */}
        {transcriptResult && (
          <View className="w-full bg-green-500/15 border border-green-500/30 rounded-2xl p-4 flex-row items-center gap-3 mb-4">
            <CheckCircle size={24} color="#4ADE80" weight="fill" />
            <View className="flex-1">
              <Text className="text-green-400 text-xs font-bold uppercase tracking-wider mb-0.5">
                {activeMode === "peers" ? "Intercom Message Sent" : "Desktop Recognized & Executed"}
              </Text>
              <Text className="text-white font-semibold text-sm leading-snug">"{transcriptResult}"</Text>
            </View>
          </View>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <View className="w-full bg-red-500/15 border border-red-500/30 rounded-2xl p-4 flex-row items-center gap-3 mb-4">
            <WarningCircle size={24} color="#F87171" weight="fill" />
            <Text className="text-red-300 text-sm font-semibold flex-1">{errorMessage}</Text>
          </View>
        )}

        {hasPermission === false && (
          <View className="w-full bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex-row items-center gap-3">
            <MicrophoneSlash size={20} color="#FBBF24" weight="bold" />
            <Text className="text-amber-300 text-xs flex-1">
              Microphone permission is required for Intercom and Voice commands.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pulseRing: {
    width: 208,
    height: 208,
    borderRadius: 104,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  pttButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
});
