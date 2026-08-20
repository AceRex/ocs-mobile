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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Microphone,
  MicrophoneSlash,
  CheckCircle,
  WarningCircle,
  Broadcast,
  Sparkle,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

export default function IntercomScreen() {
  const router = useRouter();
  const { isConnected, isPaired, setVoiceActive, sendVoiceAudio } = useSocketStore();

  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "sending" | "confirmed" | "error">("idle");
  const [transcriptResult, setTranscriptResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mediaRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordStartTimeRef = useRef<number>(0);

  useEffect(() => {
    // Check audio permission on mount
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          setHasPermission(true);
          // Stop stream tracks after permission check
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch(() => {
          setHasPermission(false);
        });
    } else {
      setHasPermission(true);
    }
  }, []);

  useEffect(() => {
    if (recordingState === "recording") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
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
    setRecordingState("recording");
    setVoiceActive(true);
    recordStartTimeRef.current = Date.now();

    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
          },
        });
        audioChunksRef.current = [];
        const mediaRecorder = new (window as any).MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        mediaRecorder.start(100);
      }
    } catch (err: any) {
      console.error("Recording start error:", err);
      setRecordingState("error");
      setErrorMessage("Microphone access failed.");
      setVoiceActive(false);
    }
  };

  const stopRecording = async () => {
    if (recordingState !== "recording") return;

    setRecordingState("sending");
    setVoiceActive(false);
    const durationMs = Date.now() - recordStartTimeRef.current;

    try {
      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
          const stream = mediaRecorder.stream;
          if (stream) {
            stream.getTracks().forEach((track: any) => track.stop());
          }

          // Convert Blob to ArrayBuffer -> Int16 PCM or Base64
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.includes("base64,") ? dataUrl.split("base64,")[1] : dataUrl;

            // Transmit to desktop
            const res = await sendVoiceAudio({
              dataBase64: base64Data,
              format: mediaRecorder.mimeType || "webm",
              durationMs,
            });

            if (res.ok) {
              setRecordingState("confirmed");
              setTranscriptResult(res.text || "Command recognized on desktop");
            } else {
              setRecordingState("error");
              setErrorMessage(res.error || "Desktop voice command failed");
            }
          };
          reader.readAsDataURL(audioBlob);
        };
        mediaRecorder.stop();
      } else {
        // Mock / Fallback if audio recorder not active
        setTimeout(() => {
          setRecordingState("idle");
        }, 500);
      }
    } catch (err: any) {
      console.error("Recording stop error:", err);
      setRecordingState("error");
      setErrorMessage(err.message || "Failed to process audio.");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <View className="items-center">
          <Text className="text-white text-lg font-bold">Voice Intercom</Text>
          <Text className="text-white/40 text-xs">Secondary Voice Input (PTT)</Text>
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

      <ScrollView contentContainerStyle={{ padding: 20, alignItems: "center" }} className="flex-1">
        {/* Instructions Card */}
        <View className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 mb-8">
          <View className="flex-row items-center gap-2 mb-1">
            <Sparkle size={18} color="#60A5FA" weight="duotone" />
            <Text className="text-white/90 font-bold text-sm">Push-to-Talk Commands</Text>
          </View>
          <Text className="text-white/50 text-xs leading-relaxed">
            Hold the button to speak Scripture (<Text className="text-blue-300">"John 3:16"</Text>), Timer (<Text className="text-amber-300">"Set timer 30 minutes"</Text>), or Slide Navigation (<Text className="text-purple-300">"Next slide"</Text>). Release to execute on the desktop display.
          </Text>
        </View>

        {/* Central PTT Hold Button */}
        <View className="items-center justify-center my-8">
          <Animated.View
            style={{
              transform: [{ scale: pulseAnim }],
            }}
            className={`w-52 h-52 rounded-full items-center justify-center border-4 ${
              recordingState === "recording"
                ? "bg-red-600/30 border-red-500 shadow-2xl shadow-red-500/50"
                : recordingState === "sending"
                ? "bg-blue-600/20 border-blue-400"
                : "bg-white/5 border-white/15"
            }`}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={recordingState === "sending"}
              className={`w-40 h-40 rounded-full items-center justify-center shadow-xl ${
                recordingState === "recording"
                  ? "bg-red-600"
                  : recordingState === "sending"
                  ? "bg-blue-600"
                  : "bg-gradient-to-tr bg-blue-600 active:bg-blue-700"
              }`}
            >
              {recordingState === "sending" ? (
                <ActivityIndicator size="large" color="white" />
              ) : (
                <Microphone size={54} color="white" weight={recordingState === "recording" ? "fill" : "bold"} />
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* State Label */}
        <View className="items-center mb-6">
          <Text className="text-white font-black text-xl mb-1">
            {recordingState === "recording"
              ? "Listening…"
              : recordingState === "sending"
              ? "Transcribing & Dispatching…"
              : recordingState === "confirmed"
              ? "Command Executed"
              : "Hold to Speak"}
          </Text>
          <Text className="text-white/40 text-xs">
            {recordingState === "recording"
              ? "Release button when done speaking"
              : recordingState === "sending"
              ? "Sending audio buffer to desktop ASR"
              : "Hold and speak naturally into your microphone"}
          </Text>
        </View>

        {/* Transcript / Feedback Banner */}
        {transcriptResult && (
          <View className="w-full bg-green-500/15 border border-green-500/30 rounded-2xl p-4 flex-row items-center gap-3 mb-4">
            <CheckCircle size={24} color="#4ADE80" weight="fill" />
            <View className="flex-1">
              <Text className="text-green-400 text-xs font-bold uppercase tracking-wider mb-0.5">Desktop Recognized</Text>
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
              Microphone permission is required for Push-to-Talk voice commands.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
