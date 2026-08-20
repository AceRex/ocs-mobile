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
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { Waveform, Play, Pause, X, SpeakerHigh, ArrowsClockwise } from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

export default function IncomingIntercomPlayer({ isBanner = false }: { isBanner?: boolean }) {
  const { incomingIntercom, clearIncomingIntercom } = useSocketStore();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  const playerRef = useRef<AudioPlayer | null>(null);
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;

  // Prepare audio whenever a new message arrives
  useEffect(() => {
    if (!incomingIntercom?.audioBase64) {
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch (_) {}
        playerRef.current = null;
      }
      if (webAudioRef.current) {
        try {
          webAudioRef.current.pause();
        } catch (_) {}
        webAudioRef.current = null;
      }
      setIsPlaying(false);
      setAudioUri(null);
      return;
    }

    let isMounted = true;

    // Slide banner in
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 50,
      friction: 8,
    }).start();

    const loadAndPlayAudio = async () => {
      try {
        setIsLoading(true);
        const cleanBase64 = incomingIntercom.audioBase64.includes("base64,")
          ? incomingIntercom.audioBase64.split("base64,")[1]
          : incomingIntercom.audioBase64;

        const ext = incomingIntercom.format || "m4a";

        if (Platform.OS === "web") {
          // Web Browser audio strategy: Use HTML5 Audio directly with data URI
          const mimeType = ext === "wav" ? "audio/wav" : ext === "mp3" ? "audio/mpeg" : "audio/mp4";
          const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
          setAudioUri(dataUrl);

          if (webAudioRef.current) {
            try {
              webAudioRef.current.pause();
            } catch (_) {}
          }

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
              console.log("[IncomingIntercomPlayer] Web auto-play notice:", err.message);
            });
          }
        } else {
          // Native (iOS/Android) strategy: Cache to temp file and use expo-audio
          const fileUri = `${FileSystem.cacheDirectory}intercom_${Date.now()}.${ext}`;

          await FileSystem.writeAsStringAsync(fileUri, cleanBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (!isMounted) return;
          setAudioUri(fileUri);

          await setAudioModeAsync({
            playsInSilentMode: true,
            allowsRecording: false,
          });

          if (playerRef.current) {
            try {
              playerRef.current.release();
            } catch (_) {}
          }

          const player = createAudioPlayer({ uri: fileUri });
          playerRef.current = player;

          player.addListener("playbackStatusUpdate", (status: any) => {
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

          setIsLoading(false);

          if (autoPlay) {
            player.play();
            setIsPlaying(true);
          }
        }
      } catch (err) {
        console.error("[IncomingIntercomPlayer] Error preparing audio:", err);
        if (isMounted) {
          setIsLoading(false);
          setIsPlaying(false);
        }
      }
    };

    loadAndPlayAudio();

    return () => {
      isMounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.pause();
          playerRef.current.release();
        } catch (_) {}
        playerRef.current = null;
      }
      if (webAudioRef.current) {
        try {
          webAudioRef.current.pause();
        } catch (_) {}
        webAudioRef.current = null;
      }
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
    if (!playerRef.current) {
      if (audioUri) {
        try {
          const player = createAudioPlayer({ uri: audioUri });
          playerRef.current = player;
          player.addListener("playbackStatusUpdate", (status: any) => {
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
          player.play();
          setIsPlaying(true);
        } catch (e) {
          console.error("Play error:", e);
        }
      }
      return;
    }

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
      console.error("Toggle playback error:", err);
    }
  };

  const handleDismiss = () => {
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        playerRef.current.release();
      } catch (_) {}
      playerRef.current = null;
    }
    if (webAudioRef.current) {
      try {
        webAudioRef.current.pause();
      } catch (_) {}
      webAudioRef.current = null;
    }
    setIsPlaying(false);
    clearIncomingIntercom();
  };

  const containerStyle = isBanner
    ? [styles.bannerContainer, { transform: [{ translateY: slideAnim }] }]
    : styles.cardContainer;

  return (
    <Animated.View style={containerStyle}>
      <View style={styles.headerRow}>
        <View style={styles.senderBadge}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <SpeakerHigh size={18} color="#C084FC" weight="fill" />
          </Animated.View>
          <Text style={styles.senderLabel}>
            Voice Message from <Text style={styles.senderName}>{incomingIntercom.fromName}</Text>
          </Text>
        </View>
        <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <X size={16} color="#9ca3af" weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Playback Controls & Waveform */}
      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={togglePlayback}
          disabled={isLoading}
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="white" />
          ) : isPlaying ? (
            <Pause size={18} color="white" weight="fill" />
          ) : (
            <Play size={18} color="white" weight="fill" />
          )}
          <Text style={styles.playButtonText}>{isPlaying ? "Pause" : "Listen Now"}</Text>
        </TouchableOpacity>

        {/* Progress Wave Indicator */}
        <View style={styles.waveformContainer}>
          <View style={styles.waveformTrack}>
            <View style={[styles.waveformFill, { width: `${Math.max(5, progress * 100)}%` }]} />
          </View>
          <Text style={styles.timeText}>
            {isPlaying ? "Playing..." : progress > 0 ? "Replay" : "Ready"}
          </Text>
        </View>

        {/* Auto Play Toggle */}
        <TouchableOpacity
          onPress={() => setAutoPlay(!autoPlay)}
          style={[styles.autoPlayPill, autoPlay && styles.autoPlayPillActive]}
        >
          <Text style={[styles.autoPlayText, autoPlay && styles.autoPlayTextActive]}>
            Auto: {autoPlay ? "ON" : "OFF"}
          </Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 25,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: "#1e1b4b", // deep indigo
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: "#a855f7",
    shadowColor: "#a855f7",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
  },
  cardContainer: {
    backgroundColor: "#1e1b4b",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#a855f7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  senderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  senderLabel: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "600",
  },
  senderName: {
    color: "#f472b6", // pink-400
    fontWeight: "bold",
  },
  closeBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#7c3aed",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  playButtonActive: {
    backgroundColor: "#ec4899",
  },
  playButtonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "bold",
  },
  waveformContainer: {
    flex: 1,
    gap: 4,
  },
  waveformTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 3,
    overflow: "hidden",
  },
  waveformFill: {
    height: "100%",
    backgroundColor: "#c084fc",
    borderRadius: 3,
  },
  timeText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "600",
  },
  autoPlayPill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  autoPlayPillActive: {
    backgroundColor: "rgba(168, 85, 247, 0.25)",
    borderColor: "#a855f7",
  },
  autoPlayText: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
  },
  autoPlayTextActive: {
    color: "#e9d5ff",
  },
});
