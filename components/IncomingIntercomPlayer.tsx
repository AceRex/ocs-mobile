import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { Waveform, Play, Pause, X, SpeakerHigh, ArrowsClockwise } from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

// Synthesize pleasant two-tone notification alert chime (C6 -> G6)
function playAlertChime() {
  try {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (_) {}

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
        osc1.frequency.exponentialRampToValueAtTime(1567.98, ctx.currentTime + 0.12); // G6

        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(1567.98, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(2093.0, ctx.currentTime + 0.18); // C7

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.45);
        osc2.stop(ctx.currentTime + 0.45);
      }
    }
  } catch (err) {
    console.log("[NotificationAlert] Notice:", err);
  }
}

export default function IncomingIntercomPlayer({ isBanner = false }: { isBanner?: boolean }) {
  const { incomingIntercom, clearIncomingIntercom } = useSocketStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;

  // Clean up existing players
  const cleanupPlayers = (resetState = true) => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
      } catch (_) {}
      try {
        (playerRef.current as any)?.remove?.();
      } catch (_) {}
      try {
        (playerRef.current as any)?.release?.();
      } catch (_) {}
      playerRef.current = null;
    }
    if (webAudioRef.current) {
      try {
        webAudioRef.current.pause();
        webAudioRef.current.src = "";
      } catch (_) {}
      webAudioRef.current = null;
    }
    if (resetState) {
      setIsPlaying(false);
      setProgress(0);
    }
  };

  // Prepare audio whenever a new message arrives
  useEffect(() => {
    if (!incomingIntercom?.audioBase64) {
      cleanupPlayers(true);
      setAudioUri(null);
      return;
    }

    let isMounted = true;

    // Slide banner in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: Platform.OS !== "web",
      tension: 50,
      friction: 8,
    }).start();

    // Alert recipient with pleasant notification chime and haptics
    playAlertChime();

    // If an inline instance is mounted while global root banner is active, only root banner loads audio
    if (!isBanner) {
      return;
    }

    const loadAndPlayAudio = async () => {
      try {
        setIsLoading(true);
        cleanupPlayers(false);

        const cleanBase64 = incomingIntercom.audioBase64.includes("base64,")
          ? incomingIntercom.audioBase64.split("base64,")[1]
          : incomingIntercom.audioBase64;

        let ext = "m4a";
        const fmt = (incomingIntercom.format || "").toLowerCase();
        if (fmt.includes("wav")) ext = "wav";
        else if (fmt.includes("mp3")) ext = "mp3";
        else if (fmt.includes("aac")) ext = "aac";
        else if (fmt.includes("webm") || fmt.includes("opus")) ext = "webm";
        else if (fmt.includes("m4a") || fmt.includes("mp4")) ext = "m4a";

        if (Platform.OS === "web") {
          // Web Browser HTML5 Audio
          const mimeType = ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : ext === "webm" ? "audio/webm" : "audio/mp4";
          const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
          setAudioUri(dataUrl);

          const audio = new Audio(dataUrl);
          webAudioRef.current = audio;

          audio.ontimeupdate = () => {
            if (!isMounted) return;
            if (audio.duration > 0) {
              setProgress(audio.currentTime / audio.duration);
            }
          };

          audio.onplay = () => {
            if (isMounted) setIsPlaying(true);
          };

          audio.onpause = () => {
            if (isMounted) setIsPlaying(false);
          };

          audio.onended = () => {
            if (!isMounted) return;
            setIsPlaying(false);
            setProgress(0);
          };

          setIsLoading(false);

          if (autoPlay) {
            audio.play().catch((err) => {
              console.log("[IncomingIntercomPlayer] Web auto-play notice:", err?.message);
            });
          }
        } else {
          // Native Android & iOS (expo-audio)
          const fileUri = `${FileSystem.cacheDirectory}intercom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;

          await FileSystem.writeAsStringAsync(fileUri, cleanBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (!isMounted) return;
          setAudioUri(fileUri);

          try {
            await setAudioModeAsync({
              playsInSilentMode: true,
              allowsRecording: false,
            });
          } catch (_) {}

          try {
            const player = createAudioPlayer(fileUri);
            playerRef.current = player;

            (player as any)?.addListener?.("playbackStatusUpdate", (status: any) => {
              if (!isMounted) return;
              if (status.isLoaded) {
                if (status.duration > 0) {
                  setProgress(status.currentTime / status.duration);
                }
                setIsPlaying(status.playing);
                if (status.currentTime >= status.duration && status.duration > 0) {
                  setIsPlaying(false);
                  setProgress(0);
                }
              }
            });

            if (autoPlay) {
              player.play();
              setIsPlaying(true);
            }
          } catch (playerErr) {
            console.error("[IncomingIntercomPlayer] expo-audio play error:", playerErr);
          }

          setIsLoading(false);
        }
      } catch (err) {
        console.error("[IncomingIntercomPlayer] Error loading audio:", err);
        if (isMounted) {
          setIsLoading(false);
          setIsPlaying(false);
        }
      }
    };

    loadAndPlayAudio();

    return () => {
      isMounted = false;
      cleanupPlayers(false);
    };
  }, [incomingIntercom]);

  // Pulse animation when playing
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isPlaying) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 400,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => anim?.stop();
  }, [isPlaying]);

  if (!incomingIntercom) return null;

  const togglePlayback = async () => {
    if (Platform.OS === "web") {
      if (webAudioRef.current) {
        if (isPlaying) {
          webAudioRef.current.pause();
          setIsPlaying(false);
        } else {
          webAudioRef.current.play().catch((e) => console.log("Play error:", e));
          setIsPlaying(true);
        }
      } else if (audioUri) {
        const audio = new Audio(audioUri);
        webAudioRef.current = audio;
        audio.ontimeupdate = () => {
          if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
        };
        audio.onplay = () => setIsPlaying(true);
        audio.onpause = () => setIsPlaying(false);
        audio.onended = () => {
          setIsPlaying(false);
          setProgress(0);
        };
        audio.play().catch((e) => console.log("Play error:", e));
      }
      return;
    }

    // Native playback toggle
    if (playerRef.current) {
      try {
        if (isPlaying) {
          playerRef.current.pause();
          setIsPlaying(false);
        } else {
          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });
          playerRef.current.play();
          setIsPlaying(true);
        }
      } catch (err) {
        console.error("expo-audio toggle error:", err);
      }
    } else if (audioUri) {
      try {
        const player = createAudioPlayer(audioUri);
        playerRef.current = player;
        player.play();
        setIsPlaying(true);
      } catch (e) {
        console.error("expo-audio start error:", e);
      }
    }
  };

  const handleDismiss = () => {
    cleanupPlayers(true);
    clearIncomingIntercom();
  };

  const handleReplay = async () => {
    if (Platform.OS === "web" && webAudioRef.current) {
      webAudioRef.current.currentTime = 0;
      webAudioRef.current.play().catch((e) => console.log("Replay error:", e));
      setIsPlaying(true);
    } else if (playerRef.current) {
      try {
        playerRef.current.seekTo(0);
        playerRef.current.play();
        setIsPlaying(true);
      } catch (e) {
        console.error("expo-audio replay error:", e);
      }
    }
  };

  const timestamp = incomingIntercom.timestamp;
  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "Live";

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        isBanner && styles.floatingBanner,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Left Icon with Pulse */}
        <Animated.View
          style={[
            styles.iconWrapper,
            isPlaying && styles.iconPlayingWrapper,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <SpeakerHigh
            size={22}
            color={isPlaying ? "#34d399" : "#60a5fa"}
            weight={isPlaying ? "fill" : "bold"}
          />
        </Animated.View>

        {/* Sender Info & Progress Bar */}
        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text style={styles.senderLabel} numberOfLines={1}>
              {incomingIntercom.fromName || "Intercom Peer"}
            </Text>
            <Text style={styles.timestampText}>{formattedTime}</Text>
          </View>

          {/* Audio Progress Bar */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          <View style={styles.subRow}>
            <Text style={styles.statusText}>
              {isLoading ? "Loading audio…" : isPlaying ? "Playing broadcast…" : "Voice message ready"}
            </Text>
            <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
        </View>

        {/* Controls: Play/Pause, Replay, Dismiss */}
        <View style={styles.controlsRow}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#60a5fa" style={styles.controlBtn} />
          ) : (
            <TouchableOpacity
              onPress={togglePlayback}
              style={[styles.controlBtn, isPlaying ? styles.pauseBtn : styles.playBtn]}
              activeOpacity={0.8}
            >
              {isPlaying ? (
                <Pause size={16} color="#ffffff" weight="fill" />
              ) : (
                <Play size={16} color="#ffffff" weight="fill" />
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleReplay} style={styles.iconBtn} activeOpacity={0.7}>
            <ArrowsClockwise size={18} color="rgba(255,255,255,0.7)" weight="bold" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDismiss} style={styles.iconBtn} activeOpacity={0.7}>
            <X size={18} color="rgba(255,255,255,0.6)" weight="bold" />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: "#161520",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: "#60a5fa",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  floatingBanner: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(96, 165, 250, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconPlayingWrapper: {
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    borderColor: "rgba(52, 211, 153, 0.4)",
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  senderLabel: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 6,
  },
  timestampText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 10,
    fontWeight: "600",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 2,
    overflow: "hidden",
    marginTop: 2,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#34d399",
    borderRadius: 2,
  },
  subRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 10,
    fontWeight: "500",
  },
  progressPercent: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "700",
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  controlBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  playBtn: {
    backgroundColor: "#2563eb",
  },
  pauseBtn: {
    backgroundColor: "#059669",
  },
  iconBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
});
