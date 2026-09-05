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
import * as Haptics from "expo-haptics";
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
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
import IncomingIntercomPlayer from "../components/IncomingIntercomPlayer";

type IntercomMode = "peers" | "controller" | "mic";

export default function IntercomScreen() {
  const router = useRouter();
  const {
    isConnected,
    isPaired,
    isAdmin,
    deviceRole,
    setVoiceActive,
    sendVoiceAudio,
    peers,
    fetchPeers,
    speakToPeer,
    incomingIntercom,
    clearIncomingIntercom,
    streamMicChunk,
  } = useSocketStore();

  // Role-based access: admin and stageManager can use controller + mic modes
  const canUseControllerMode = deviceRole === 'admin' || deviceRole === 'stageManager';
  const canUseMicMode = deviceRole === 'admin' || deviceRole === 'stageManager';

  const [activeMode, setActiveMode] = useState<IntercomMode>("peers");
  const [selectedTargetPeer, setSelectedTargetPeer] = useState<string>("all"); // 'all' or socketId

  const [recordingState, setRecordingState] = useState<
    "idle" | "recording" | "sending" | "confirmed" | "error"
  >("idle");
  const [transcriptResult, setTranscriptResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const [isLiveMicActive, setIsLiveMicActive] = useState(false);
  const [liveMicLevel, setLiveMicLevel] = useState(0);

  // Universal helper to read audio URI to base64
  const readAudioUriToBase64 = async (uri: string): Promise<string | null> => {
    if (Platform.OS !== "web") {
      try {
        return await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch (fsErr) {
        console.error("[readAudioUriToBase64] FileSystem failed:", fsErr);
      }
    }

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("FileReader failed"));
          }
        };
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });
      if (dataUrl) {
        const parts = dataUrl.split(",");
        return parts.length > 1 ? parts[1] : parts[0];
      }
    } catch (e) {
      console.warn("[readAudioUriToBase64] Fetch/FileReader notice:", e);
    }
    return null;
  };

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const nativeRecorderRef = useRef<any>(null);
  const webRecorderRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const liveMicIntervalRef = useRef<any>(null);
  const liveMicActiveRef = useRef(false);
  const continuousChunkIndexRef = useRef(0);
  // Hold-to-talk gate: peers mode requires ≥500ms hold before mic activates
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdActivatedRef = useRef(false);
  const [isHoldPressing, setIsHoldPressing] = useState(false);

  useEffect(() => {
    // Check permission on mount
    getRecordingPermissionsAsync()
      .then((res) => setHasPermission(!!res.granted))
      .catch(() => setHasPermission(false));

    if (isPaired) {
      fetchPeers();
      const interval = setInterval(fetchPeers, 3000);
      return () => clearInterval(interval);
    }
  }, [isPaired]);

  // Mode 3: Continuous Wireless Mic Streaming Loop
  useEffect(() => {
    liveMicActiveRef.current = isLiveMicActive;
    if (!isLiveMicActive) {
      if (liveMicIntervalRef.current) clearInterval(liveMicIntervalRef.current);
      setLiveMicLevel(0);
      streamMicChunk({ volume: 0, active: false });
      return;
    }

    let isStreaming = true;

    // Simulate animated VU meter
    liveMicIntervalRef.current = setInterval(() => {
      if (!liveMicActiveRef.current) return;
      const level = Math.random() * 0.65 + 0.35;
      setLiveMicLevel(level);
      streamMicChunk({ volume: level, active: true });
    }, 120);

    // Continuous audio recording loop
    const runContinuousMicStream = async () => {
      while (isStreaming && liveMicActiveRef.current) {
        try {
          let base64Audio: string | null = "";
          let format = "m4a";

          if (Platform.OS === "web") {
            if (
              typeof navigator !== "undefined" &&
              navigator.mediaDevices?.getUserMedia
            ) {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
              });
              const webChunks: Blob[] = [];
              const mediaRecorder = new (window as any).MediaRecorder(stream);
              mediaRecorder.ondataavailable = (e: any) => {
                if (e.data && e.data.size > 0) webChunks.push(e.data);
              };
              mediaRecorder.start(100);
              // Record continuous slice
              await new Promise((r) => setTimeout(r, 2600));
              if (!liveMicActiveRef.current) {
                mediaRecorder.stop();
                stream.getTracks().forEach((t: any) => t.stop());
                break;
              }
              await new Promise<void>((resolve) => {
                mediaRecorder.onstop = async () => {
                  stream.getTracks().forEach((t: any) => t.stop());
                  const audioBlob = new Blob(webChunks, {
                    type: mediaRecorder.mimeType || "audio/webm",
                  });
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const dataUrl = reader.result as string;
                    base64Audio = dataUrl.includes("base64,")
                      ? dataUrl.split("base64,")[1]
                      : dataUrl;
                    format = mediaRecorder.mimeType || "webm";
                    resolve();
                  };
                  reader.readAsDataURL(audioBlob);
                };
                mediaRecorder.stop();
              });
            }
          } else {
            const perm = await requestRecordingPermissionsAsync();
            if (!perm.granted) {
              setHasPermission(false);
              setIsLiveMicActive(false);
              break;
            }

            try {
              await setAudioModeAsync({
                allowsRecording: true,
                playsInSilentMode: true,
              });
            } catch (_) {}

            const recorder = new AudioModule.AudioRecorder(
              RecordingPresets.HIGH_QUALITY,
            );
            await recorder.prepareToRecordAsync();
            recorder.record();

            // Record continuous slice
            await new Promise((r) => setTimeout(r, 2600));
            if (!liveMicActiveRef.current) {
              try {
                await recorder.stop();
              } catch (_) {}
              break;
            }

            try {
              await recorder.stop();
            } catch (_) {}

            const uri = recorder.uri;
            if (uri) {
              base64Audio = await readAudioUriToBase64(uri);
              format = "m4a";
            }
          }

          if (base64Audio && liveMicActiveRef.current) {
            continuousChunkIndexRef.current += 1;
            sendVoiceAudio({
              dataBase64: base64Audio,
              format,
              durationMs: 2600,
              role: "mic",
            })
              .then((res) => {
                if (res?.text) {
                  setTranscriptResult(res.text);
                }
              })
              .catch(() => {});
          }
        } catch (err: any) {
          console.warn("Continuous mic stream error:", err?.message);
          await new Promise((r) => setTimeout(r, 400));
        }
      }
    };

    runContinuousMicStream();

    return () => {
      isStreaming = false;
      liveMicActiveRef.current = false;
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
        ]),
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recordingState]);

  // Peers PTT: press-in arms the hold timer; mic only fires after 500ms hold
  const handlePttPressIn = () => {
    if (activeMode !== "peers") {
      // Controller mode: immediate start
      startRecording();
      return;
    }
    holdActivatedRef.current = false;
    setIsHoldPressing(true);
    holdTimerRef.current = setTimeout(() => {
      holdActivatedRef.current = true;
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch (_) {}
      startRecording();
    }, 500);
  };

  const handlePttPressOut = () => {
    // Cancel hold timer if released before threshold
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHoldPressing(false);
    if (activeMode === "peers" && !holdActivatedRef.current) {
      // Released too early — mic never activated, nothing to stop
      holdActivatedRef.current = false;
      return;
    }
    holdActivatedRef.current = false;
    stopRecording();
  };

  const startRecording = async () => {
    if (!isConnected || !isPaired) {
      setRecordingState("error");
      setErrorMessage("Connect and pair with Desktop Controller first.");
      return;
    }

    if ((activeMode === "controller" || activeMode === "mic") && !canUseControllerMode) {
      setRecordingState("error");
      setErrorMessage(
        deviceRole === "speaker"
          ? "Speakers can only use the Intercom Peers mode."
          : "Admin or Stage Manager privilege required for Controller and Wireless Mic modes.",
      );
      Alert.alert(
        "Access Restricted",
        deviceRole === "speaker"
          ? "Your role is Speaker. You can only use the Intercom Peers mode to speak to other team members."
          : "Controller Voice Prompts and Wireless Mic modes are reserved for Admin and Stage Manager devices.",
      );
      return;
    }

    setTranscriptResult(null);
    setErrorMessage(null);
    recordStartTimeRef.current = Date.now();
    try {
      if (Platform.OS === "web") {
        if (
          typeof navigator !== "undefined" &&
          navigator.mediaDevices?.getUserMedia
        ) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          webChunksRef.current = [];
          const mediaRecorder = new (window as any).MediaRecorder(stream);
          webRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (e: any) => {
            if (e.data && e.data.size > 0) webChunksRef.current.push(e.data);
          };
          mediaRecorder.start(100);

          setRecordingState("recording");
          setVoiceActive(true);
        }
      } else {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setHasPermission(false);
          setRecordingState("error");
          setErrorMessage(
            "Microphone permission denied. Please allow microphone access.",
          );
          return;
        }
        setHasPermission(true);

        try {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
        } catch (_) {}

        // Fresh instance per recording session ensures clean state machine on Android
        const recorder = new AudioModule.AudioRecorder(
          RecordingPresets.HIGH_QUALITY,
        );
        nativeRecorderRef.current = recorder;
        await recorder.prepareToRecordAsync();
        recorder.record();

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
      let base64Audio: string | null = "";
      let format = "m4a";

      if (Platform.OS === "web") {
        if (webRecorderRef.current) {
          const recorder = webRecorderRef.current;
          webRecorderRef.current = null;

          await new Promise<void>((resolve) => {
            recorder.onstop = async () => {
              const audioBlob = new Blob(webChunksRef.current, {
                type: recorder.mimeType || "audio/webm",
              });
              if (recorder.stream)
                recorder.stream.getTracks().forEach((t: any) => t.stop());

              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result as string;
                base64Audio = dataUrl.includes("base64,")
                  ? dataUrl.split("base64,")[1]
                  : dataUrl;
                format = recorder.mimeType || "webm";
                resolve();
              };
              reader.readAsDataURL(audioBlob);
            };
            recorder.stop();
          });
        }
      } else {
        if (nativeRecorderRef.current) {
          const recorder = nativeRecorderRef.current;
          nativeRecorderRef.current = null;
          try {
            await recorder.stop();
          } catch (stopErr: any) {
            console.warn("recorder.stop error:", stopErr?.message);
          }
          // On Android, allow 150ms for native audio engine to write complete m4a atom to disk
          await new Promise((r) => setTimeout(r, 150));
          const uri = recorder.uri;
          if (uri) {
            base64Audio = await readAudioUriToBase64(uri);
            format = "m4a";
          }
          // Reset audio routing to loudspeaker after recording session
          try {
            await setAudioModeAsync({
              allowsRecording: false,
              playsInSilentMode: true,
            });
          } catch (_) {}
        }
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
          setTranscriptResult(
            `Audio sent to ${selectedTargetPeer === "all" ? "All Users" : "Selected User"}`,
          );
        } else {
          setRecordingState("error");
          setErrorMessage(res.error || "Failed to deliver audio to peers");
        }
      } else if (activeMode === "controller") {
        // Mode 2: Speak to Desktop Controller (Audio Playback + Voice Command)
        speakToPeer({
          target: "controller",
          audioBase64: base64Audio,
          format,
          durationMs,
        }).catch(() => {});

        const res = await sendVoiceAudio({
          dataBase64: base64Audio,
          format,
          durationMs,
          role: "final",
        });

        if (res.ok) {
          setRecordingState("confirmed");
          setTranscriptResult(
            res.text || "Voice audio delivered to Desktop Controller",
          );
        } else {
          setRecordingState("error");
          setErrorMessage(res.error || "Desktop voice communication failed");
        }
      } else if (activeMode === "mic") {
        // Mode 3: Wireless Microphone -> Transcribes to Desktop Transcription Panel
        const res = await sendVoiceAudio({
          dataBase64: base64Audio,
          format,
          durationMs,
          role: "mic",
        });

        if (res.ok) {
          setRecordingState("confirmed");
          setTranscriptResult(
            res.text || "Voice sent to Desktop Transcription Panel",
          );
        } else {
          setRecordingState("error");
          setErrorMessage(res.error || "Wireless mic transmission failed");
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
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Intercom & Voice</Text>
          <Text style={styles.headerSubtitle}>Multi-Mode Audio Hub</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: isPaired
                ? "rgba(34, 197, 94, 0.15)"
                : isConnected
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(255, 255, 255, 0.05)",
              borderColor: isPaired
                ? "rgba(34, 197, 94, 0.3)"
                : isConnected
                  ? "rgba(245, 158, 11, 0.3)"
                  : "rgba(255, 255, 255, 0.1)",
            },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: isPaired ? "#4ade80" : "rgba(255,255,255,0.3)",
              },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: isPaired ? "#4ade80" : "rgba(255,255,255,0.4)" },
            ]}
          >
            {isPaired ? "Paired" : "Offline"}
          </Text>
        </View>
      </View>

      {/* Mode Segmented Selector */}
      <View style={styles.modeSelector}>
        <TouchableOpacity
          onPress={() => {
            setActiveMode("peers");
            setTranscriptResult(null);
            setErrorMessage(null);
          }}
          style={[
            styles.modeButton,
            activeMode === "peers" && styles.modeButtonActivePurple,
          ]}
        >
          <Users
            size={16}
            color={activeMode === "peers" ? "white" : "#9ca3af"}
            weight="bold"
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (!isAdmin) {
              Alert.alert(
                "Admin Access Required",
                "Controller Voice Prompts are strictly reserved for Admin devices. Please ask the desktop operator to assign Admin privileges in the Remote panel.",
              );
              return;
            }
            setActiveMode("controller");
            setTranscriptResult(null);
            setErrorMessage(null);
          }}
          style={[
            styles.modeButton,
            activeMode === "controller" && styles.modeButtonActiveBlue,
            !isAdmin && { opacity: 0.55 },
          ]}
        >
          <Sparkle
            size={16}
            color={activeMode === "controller" ? "white" : "#9ca3af"}
            weight="bold"
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (!isAdmin) {
              Alert.alert(
                "Admin Access Required",
                "Work as Mic (Live Wireless Microphone) is strictly reserved for Admin devices. Please ask the desktop operator to assign Admin privileges in the Remote panel.",
              );
              return;
            }
            setActiveMode("mic");
            setTranscriptResult(null);
            setErrorMessage(null);
          }}
          style={[
            styles.modeButton,
            activeMode === "mic" && styles.modeButtonActiveEmerald,
            !isAdmin && { opacity: 0.55 },
          ]}
        >
          <Broadcast
            size={16}
            color={activeMode === "mic" ? "white" : "#9ca3af"}
            weight="bold"
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {/* Incoming Intercom Message Player */}
        <IncomingIntercomPlayer isBanner={false} />

        {/* ── Category 1: Speak to Other Users ── */}
        {activeMode === "peers" && (
          <View style={styles.fullWidth}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>👥 Select Destination</Text>
              <Text style={styles.cardSubtitle}>
                Choose to broadcast your voice to all connected team members, or
                tap a specific device.
              </Text>

              {/* Target Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillContainer}
              >
                <TouchableOpacity
                  onPress={() => setSelectedTargetPeer("all")}
                  style={[
                    styles.peerPill,
                    selectedTargetPeer === "all"
                      ? styles.peerPillActive
                      : styles.peerPillInactive,
                  ]}
                >
                  <Users size={16} color="white" weight="bold" />
                  <Text style={styles.peerPillText}>Speak to All</Text>
                </TouchableOpacity>

                {peers.map((peer) => (
                  <TouchableOpacity
                    key={peer.id}
                    onPress={() => setSelectedTargetPeer(peer.id)}
                    style={[
                      styles.peerPill,
                      selectedTargetPeer === peer.id
                        ? styles.peerPillActive
                        : styles.peerPillInactive,
                    ]}
                  >
                    <DeviceMobile size={15} color="white" weight="bold" />
                    <Text style={styles.peerPillText}>{peer.name}</Text>
                  </TouchableOpacity>
                ))}

                {peers.length === 0 && (
                  <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
                    <Text style={styles.emptyPeersText}>
                      No other companions online
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}

        {/* ── Category 2: Speak to Controller ── */}
        {activeMode === "controller" && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Sparkle size={18} color="#60A5FA" weight="duotone" />
              <Text style={styles.cardTitle}>Controller Voice Prompts</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              Hold the button and speak. Desktop popup will notify the operator
              and execute:
            </Text>
            <View style={styles.tagsWrap}>
              <View style={styles.blueTag}>
                <Text style={styles.blueTagText}>📖 "John 3:16"</Text>
              </View>
              <View style={styles.amberTag}>
                <Text style={styles.amberTagText}>⏱️ "Set timer 30 mins"</Text>
              </View>
              <View style={styles.purpleTag}>
                <Text style={styles.purpleTagText}>📑 "Next slide"</Text>
              </View>
              <View style={styles.emeraldTag}>
                <Text style={styles.emeraldTagText}>🎬 "Next page"</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Category 3: Work as Mic (Wireless Mic) ── */}
        {activeMode === "mic" && (
          <View style={[styles.card, { alignItems: "center" }]}>
            <View style={[styles.cardHeaderRow, { alignSelf: "flex-start" }]}>
              <Broadcast size={18} color="#34D399" weight="duotone" />
              <Text style={styles.cardTitle}>Live Wireless Microphone</Text>
            </View>
            <Text
              style={[
                styles.cardSubtitle,
                { alignSelf: "flex-start", marginBottom: 16 },
              ]}
            >
              Turn your mobile phone into an active stage or pulpit wireless mic
              for the desktop system.
            </Text>

            {/* Live VU Meter */}
            <View style={styles.vuMeterBox}>
              <View style={styles.vuHeader}>
                <Text style={styles.vuTitle}>Audio Input Level</Text>
                <Text
                  style={[
                    styles.vuValue,
                    {
                      color: isLiveMicActive
                        ? "#4ade80"
                        : "rgba(255,255,255,0.3)",
                    },
                  ]}
                >
                  {isLiveMicActive
                    ? `${Math.round(liveMicLevel * 100)}%`
                    : "MUTED"}
                </Text>
              </View>
              <View style={styles.vuTrack}>
                <View
                  style={[
                    styles.vuFill,
                    {
                      width: `${Math.min(100, liveMicLevel * 100)}%`,
                      backgroundColor:
                        liveMicLevel > 0.8
                          ? "#ef4444"
                          : liveMicLevel > 0.5
                            ? "#f59e0b"
                            : "#10b981",
                    },
                  ]}
                />
              </View>
            </View>

            {/* Mic Toggle Switch */}
            <TouchableOpacity
              onPress={() => {
                if (!isAdmin) {
                  Alert.alert(
                    "Admin Access Required",
                    "Live Wireless Mic is strictly reserved for Admin devices.",
                  );
                  return;
                }
                setIsLiveMicActive(!isLiveMicActive);
              }}
              style={[
                styles.micToggleButton,
                {
                  backgroundColor: isLiveMicActive ? "#dc2626" : "#059669",
                  borderColor: isLiveMicActive ? "#ef4444" : "#10b981",
                },
              ]}
            >
              <Microphone size={20} color="white" weight="bold" />
              <Text style={styles.micToggleText}>
                {isLiveMicActive ? "MUTE LIVE MIC" : "UNMUTE & GO LIVE"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Central PTT Button (For Modes 1 & 2) */}
        {activeMode !== "mic" && (
          <View style={styles.pttContainer}>
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
                onPressIn={handlePttPressIn}
                onPressOut={handlePttPressOut}
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
                  <Microphone
                    size={54}
                    color="white"
                    weight={recordingState === "recording" ? "fill" : "bold"}
                  />
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* State Label */}
        {activeMode !== "mic" && (
          <View style={styles.stateLabelWrap}>
            <Text style={styles.stateLabelTitle}>
              {recordingState === "recording"
                ? activeMode === "peers"
                  ? `Speaking to ${getTargetPeerName()}…`
                  : "Listening to Prompt…"
                : recordingState === "sending"
                  ? "Processing Audio…"
                  : recordingState === "confirmed"
                    ? "Audio Sent"
                    : isHoldPressing && activeMode === "peers"
                      ? "Keep holding…"
                      : activeMode === "peers"
                        ? `Hold to Talk — ${getTargetPeerName()}`
                        : "Hold to Speak to Controller"}
            </Text>
            <Text style={styles.stateLabelSubtitle}>
              {recordingState === "recording"
                ? "Release button when finished speaking"
                : activeMode === "peers"
                  ? "Hold the button for 0.5s to activate mic, release when done"
                  : "Hold and speak clearly into your microphone"}
            </Text>
          </View>
        )}

        {/* Transcript / Result Banner */}
        {transcriptResult && (
          <View style={styles.resultBanner}>
            <CheckCircle size={24} color="#4ADE80" weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={styles.resultTag}>
                {activeMode === "peers"
                  ? "Intercom Message Sent"
                  : "Desktop Recognized & Executed"}
              </Text>
              <Text style={styles.resultText}>"{transcriptResult}"</Text>
            </View>
          </View>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <WarningCircle size={24} color="#F87171" weight="fill" />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {hasPermission === false && (
          <View style={styles.permBanner}>
            <MicrophoneSlash size={20} color="#FBBF24" weight="bold" />
            <Text style={styles.permText}>
              Microphone permission is required for Intercom and Voice commands.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  headerSubtitle: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  modeSelector: {
    flexDirection: "row",
    padding: 6,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modeButtonActivePurple: {
    backgroundColor: "#9333ea",
  },
  modeButtonActiveBlue: {
    backgroundColor: "#2563eb",
  },
  modeButtonActiveEmerald: {
    backgroundColor: "#059669",
  },
  modeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "rgba(255, 255, 255, 0.6)",
  },
  modeTextActive: {
    color: "white",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    alignItems: "center",
  },
  incomingCard: {
    width: "100%",
    backgroundColor: "rgba(147, 51, 234, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.4)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  incomingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  incomingTag: {
    color: "#c084fc",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  incomingSender: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  dismissButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dismissText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  fullWidth: {
    width: "100%",
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    color: "rgba(255, 255, 255, 0.9)",
    fontWeight: "bold",
    fontSize: 14,
  },
  cardSubtitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  pillContainer: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  peerPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },
  peerPillActive: {
    backgroundColor: "#9333ea",
    borderColor: "#c084fc",
  },
  peerPillInactive: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  peerPillText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  emptyPeersText: {
    color: "rgba(255, 255, 255, 0.3)",
    fontSize: 12,
    fontStyle: "italic",
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  blueTag: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  blueTagText: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "600",
  },
  amberTag: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  amberTagText: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "600",
  },
  purpleTag: {
    backgroundColor: "rgba(147, 51, 234, 0.15)",
    borderColor: "rgba(147, 51, 234, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  purpleTagText: {
    color: "#d8b4fe",
    fontSize: 11,
    fontWeight: "600",
  },
  emeraldTag: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  emeraldTagText: {
    color: "#6ee7b7",
    fontSize: 11,
    fontWeight: "600",
  },
  vuMeterBox: {
    width: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  vuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  vuTitle: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    fontWeight: "600",
  },
  vuValue: {
    fontSize: 11,
    fontWeight: "bold",
  },
  vuTrack: {
    width: "100%",
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 6,
    overflow: "hidden",
  },
  vuFill: {
    height: "100%",
    borderRadius: 6,
  },
  micToggleButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
  },
  micToggleText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  pttContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
  },
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
  stateLabelWrap: {
    alignItems: "center",
    marginBottom: 20,
  },
  stateLabelTitle: {
    color: "white",
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 4,
    textAlign: "center",
  },
  stateLabelSubtitle: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 12,
    textAlign: "center",
  },
  resultBanner: {
    width: "100%",
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  resultTag: {
    color: "#4ade80",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  resultText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
  },
  errorBanner: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  permBanner: {
    width: "100%",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  permText: {
    color: "#fcd34d",
    fontSize: 12,
    flex: 1,
  },
});
