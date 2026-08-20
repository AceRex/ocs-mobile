import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  ArrowLeft,
  FileArrowUp,
  Image as ImageIcon,
  VideoCamera,
  SpeakerHigh,
  Presentation,
  CheckCircle,
  XCircle,
  WarningCircle,
  Files,
} from "phosphor-react-native";
import { useSocketStore } from "../store/socketStore";

export default function AssetsScreen() {
  const router = useRouter();
  const { isConnected, isPaired, sendAsset } = useSocketStore();

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    type: "image" | "video" | "audio" | "presentation" | "media";
    mimeType: string;
    dataBase64: string;
    previewUri?: string;
  } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [transferStatus, setTransferStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  const MAX_BYTES = 50 * 1024 * 1024; // 50MB

  // Universal helper to read URI or file to base64
  const readUriToBase64 = async (uri: string, mimeType?: string): Promise<string> => {
    // 1. Universal Fetch + Blob + FileReader (Reliably reads Android DocumentPicker cache, iOS & Web)
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("FileReader did not produce string"));
          }
        };
        reader.onerror = () => reject(new Error("FileReader failed"));
        reader.readAsDataURL(blob);
      });
      if (dataUrl && dataUrl.startsWith("data:")) {
        return dataUrl;
      }
    } catch (fetchErr) {
      console.warn("[readUriToBase64] Universal fetch strategy notice:", fetchErr);
    }

    // 2. Native FileSystem fallback
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const prefix = mimeType ? `data:${mimeType};base64,` : "data:application/octet-stream;base64,";
      return `${prefix}${base64}`;
    } catch (fsErr) {
      console.error("[readUriToBase64] FileSystem fallback failed:", fsErr);
      throw fsErr;
    }
  };

  const pickImageOrVideo = async (mediaType: "images" | "videos") => {
    setTransferStatus(null);
    setUploadProgress(null);
    try {
      if (Platform.OS !== "web") {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permission Required",
            "Photo and media library access is required to select images or videos."
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: mediaType === "images" ? ["images"] : ["videos"],
        allowsEditing: false,
        quality: 1,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const filename = asset.fileName || (mediaType === "images" ? `image_${Date.now()}.jpg` : `video_${Date.now()}.mp4`);
      const fileSize = asset.fileSize || 0;

      if (fileSize > MAX_BYTES) {
        Alert.alert("File Too Large", "Maximum allowed size is 50MB.");
        return;
      }

      let dataBase64 = asset.base64 ? `data:${asset.mimeType || (mediaType === "images" ? "image/jpeg" : "video/mp4")};base64,${asset.base64}` : "";
      if (!dataBase64) {
        dataBase64 = await readUriToBase64(asset.uri, asset.mimeType);
      }

      setSelectedFile({
        name: filename,
        size: fileSize,
        type: mediaType === "images" ? "image" : "video",
        mimeType: asset.mimeType || (mediaType === "images" ? "image/jpeg" : "video/mp4"),
        dataBase64,
        previewUri: mediaType === "images" ? asset.uri : undefined,
      });
    } catch (err: any) {
      console.error("ImagePicker error:", err);
      Alert.alert("Picker Error", err.message || "Failed to pick media.");
    }
  };

  const pickDocument = async (category: "audio" | "presentation" | "all") => {
    setTransferStatus(null);
    setUploadProgress(null);
    try {
      let typeFilter: string[] = ["*/*"];
      if (category === "presentation") {
        typeFilter = [
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.ms-powerpoint",
          "application/pdf",
        ];
      } else if (category === "audio") {
        typeFilter = ["audio/*", "audio/mpeg", "audio/wav", "audio/aac", "audio/m4a", "audio/ogg", "audio/flac"];
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: typeFilter,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const fileSize = asset.size || 0;

      if (fileSize > MAX_BYTES) {
        Alert.alert("File Too Large", "Maximum allowed size is 50MB.");
        return;
      }

      const filename = asset.name || `file_${Date.now()}`;
      const dataBase64 = await readUriToBase64(asset.uri, asset.mimeType);

      // Detect type
      let detectedType: "image" | "video" | "audio" | "presentation" | "media" = "media";
      const ext = filename.toLowerCase();
      if (category === "presentation" || ext.endsWith(".pptx") || ext.endsWith(".ppt") || ext.endsWith(".pdf")) {
        detectedType = "presentation";
      } else if (category === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(ext)) {
        detectedType = "audio";
      } else if (/\.(png|jpe?g|webp|gif|svg)$/i.test(ext)) {
        detectedType = "image";
      } else if (/\.(mp4|webm|mov|mkv)$/i.test(ext)) {
        detectedType = "video";
      }

      setSelectedFile({
        name: filename,
        size: fileSize,
        type: detectedType,
        mimeType: asset.mimeType || "application/octet-stream",
        dataBase64,
        previewUri: detectedType === "image" ? asset.uri : undefined,
      });
    } catch (err: any) {
      console.error("DocumentPicker error:", err);
      Alert.alert("Picker Error", err.message || "Failed to open document picker.");
    }
  };

  const handleSend = async () => {
    if (!selectedFile) return;
    if (!isConnected || !isPaired) {
      Alert.alert(
        "Not Connected",
        "Please connect and pair with the desktop controller first."
      );
      return;
    }

    setUploading(true);
    setUploadProgress(15);
    setTransferStatus(null);

    const progTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (!prev) return 25;
        if (prev < 85) return prev + 15;
        return prev;
      });
    }, 250);

    try {
      const res = await sendAsset({
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
        mimeType: selectedFile.mimeType,
        dataBase64: selectedFile.dataBase64,
      });

      clearInterval(progTimer);
      setUploadProgress(100);

      if (res.ok) {
        setTransferStatus({
          success: true,
          message: res.message || "Asset accepted by desktop operator!",
        });
        setSelectedFile(null);
      } else {
        setTransferStatus({
          success: false,
          message: res.error || "Transfer declined or failed.",
        });
      }
    } catch (err: any) {
      clearInterval(progTimer);
      setTransferStatus({
        success: false,
        message: err.message || "Transfer error.",
      });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(null), 1500);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getTypeIcon = () => {
    if (!selectedFile) return null;
    switch (selectedFile.type) {
      case "image":
        return <ImageIcon size={32} color="#60A5FA" weight="duotone" />;
      case "video":
        return <VideoCamera size={32} color="#A78BFA" weight="duotone" />;
      case "audio":
        return <SpeakerHigh size={32} color="#FBBF24" weight="duotone" />;
      case "presentation":
        return <Presentation size={32} color="#FB923C" weight="duotone" />;
      default:
        return <FileArrowUp size={32} color="#9CA3AF" weight="duotone" />;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="flex-row items-center justify-between p-4 border-b border-white/10">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <ArrowLeft size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold">Transfer Assets</Text>
        <View className="w-6" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Status / Instruction Banner */}
        <View className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
          <Text className="text-white/80 font-bold text-sm mb-1">
            Send Media to Desktop
          </Text>
          <Text className="text-white/50 text-xs leading-relaxed">
            Select an Image, Video, Audio Track (Intro/Outro), or PowerPoint
            presentation (.pptx) to send to the desktop controller. The
            operator will review and accept before applying.
          </Text>
        </View>

        {/* Selected File Card */}
        {selectedFile ? (
          <View className="bg-white/5 border border-white/15 rounded-3xl p-5 mb-6">
            <View className="flex-row items-center gap-4 mb-4">
              {selectedFile.previewUri ? (
                <Image
                  source={{ uri: selectedFile.previewUri }}
                  className="w-16 h-16 rounded-2xl bg-black/40 border border-white/10"
                />
              ) : (
                <View className="w-16 h-16 rounded-2xl bg-white/10 border border-white/10 items-center justify-center">
                  {getTypeIcon()}
                </View>
              )}
              <View className="flex-1 min-w-0">
                <Text
                  className="text-white font-bold text-sm truncate"
                  numberOfLines={1}
                >
                  {selectedFile.name}
                </Text>
                <Text className="text-white/40 text-xs uppercase font-mono mt-1">
                  {selectedFile.type} • {formatBytes(selectedFile.size)}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setSelectedFile(null)}
                className="flex-1 py-3 bg-red-500/10 rounded-xl items-center border border-red-500/20"
              >
                <Text className="text-red-400 font-semibold text-xs">Clear Selection</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* Category Picker Buttons */
          <View className="flex-col gap-3 mb-6">
            <Text className="text-white/40 text-xs font-bold uppercase tracking-wider mb-1">
              Select Asset Type
            </Text>

            {/* 1. Photos & Images */}
            <TouchableOpacity
              onPress={() => pickImageOrVideo("images")}
              activeOpacity={0.8}
              className="bg-white/5 border border-white/10 hover:border-blue-500/40 rounded-2xl p-4 flex-row items-center gap-4"
            >
              <View className="w-12 h-12 rounded-xl bg-blue-500/20 items-center justify-center border border-blue-500/30">
                <ImageIcon size={26} color="#60A5FA" weight="duotone" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">Photos & Images</Text>
                <Text className="text-white/40 text-xs">PNG, JPG, WebP, SVG for Media / Canvas</Text>
              </View>
            </TouchableOpacity>

            {/* 2. Video Clips */}
            <TouchableOpacity
              onPress={() => pickImageOrVideo("videos")}
              activeOpacity={0.8}
              className="bg-white/5 border border-white/10 hover:border-purple-500/40 rounded-2xl p-4 flex-row items-center gap-4"
            >
              <View className="w-12 h-12 rounded-xl bg-purple-500/20 items-center justify-center border border-purple-500/30">
                <VideoCamera size={26} color="#A78BFA" weight="duotone" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">Video Clips</Text>
                <Text className="text-white/40 text-xs">MP4, MOV, WebM background or media</Text>
              </View>
            </TouchableOpacity>

            {/* 3. Audio Tracks (Intro / Outro) */}
            <TouchableOpacity
              onPress={() => pickDocument("audio")}
              activeOpacity={0.8}
              className="bg-white/5 border border-white/10 hover:border-amber-500/40 rounded-2xl p-4 flex-row items-center gap-4"
            >
              <View className="w-12 h-12 rounded-xl bg-amber-500/20 items-center justify-center border border-amber-500/30">
                <SpeakerHigh size={26} color="#FBBF24" weight="duotone" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">Audio Track / Bumper</Text>
                <Text className="text-white/40 text-xs">MP3, WAV, M4A for Intro or Outro Bumper</Text>
              </View>
            </TouchableOpacity>

            {/* 4. PowerPoint Presentations (.pptx) */}
            <TouchableOpacity
              onPress={() => pickDocument("presentation")}
              activeOpacity={0.8}
              className="bg-white/5 border border-white/10 hover:border-orange-500/40 rounded-2xl p-4 flex-row items-center gap-4"
            >
              <View className="w-12 h-12 rounded-xl bg-orange-500/20 items-center justify-center border border-orange-500/30">
                <Presentation size={26} color="#FB923C" weight="duotone" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">PowerPoint Presentation</Text>
                <Text className="text-white/40 text-xs">.pptx deck with notes extraction</Text>
              </View>
            </TouchableOpacity>

            {/* 5. Browse All Documents */}
            <TouchableOpacity
              onPress={() => pickDocument("all")}
              activeOpacity={0.8}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 flex-row items-center gap-4"
            >
              <View className="w-12 h-12 rounded-xl bg-white/10 items-center justify-center border border-white/10">
                <Files size={26} color="#9CA3AF" weight="duotone" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-sm">Browse All Files</Text>
                <Text className="text-white/40 text-xs">Select any file on your device (Max 50MB)</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Action Button */}
        {/* Upload Progress Bar */}
        {uploadProgress !== null && (
          <View className="w-full bg-white/5 border border-blue-500/30 rounded-2xl p-4 mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-blue-400 font-bold text-xs">
                {uploadProgress < 100 ? "Uploading & Transferring to Controller…" : "Awaiting Operator Review…"}
              </Text>
              <Text className="text-white font-mono font-bold text-xs">{uploadProgress}%</Text>
            </View>
            <View className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
              <View
                style={{ width: `${uploadProgress}%` }}
                className="h-full bg-blue-500 rounded-full"
              />
            </View>
          </View>
        )}

        {selectedFile && (
          <TouchableOpacity
            onPress={handleSend}
            disabled={uploading}
            activeOpacity={0.8}
            className={`w-full p-4 rounded-2xl items-center flex-row justify-center gap-2 mb-6 ${
              uploading ? "bg-blue-600/50" : "bg-blue-600 active:bg-blue-700 shadow-lg shadow-blue-600/30"
            }`}
          >
            {uploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <FileArrowUp size={20} color="white" weight="bold" />
            )}
            <Text className="text-white font-bold text-base">
              {uploading ? "Transferring File…" : "Send to Desktop Controller"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Transfer Result Banner */}
        {transferStatus && (
          <View
            className={`p-4 rounded-2xl border flex-row items-center gap-3 ${
              transferStatus.success
                ? "bg-green-500/15 border-green-500/30"
                : "bg-red-500/15 border-red-500/30"
            }`}
          >
            {transferStatus.success ? (
              <CheckCircle size={24} color="#4ADE80" weight="fill" />
            ) : (
              <XCircle size={24} color="#F87171" weight="fill" />
            )}
            <Text
              className={`text-sm font-semibold flex-1 ${
                transferStatus.success ? "text-green-300" : "text-red-300"
              }`}
            >
              {transferStatus.message}
            </Text>
          </View>
        )}

        {!isConnected && (
          <View className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex-row items-center gap-3 mt-4">
            <WarningCircle size={20} color="#FBBF24" weight="bold" />
            <Text className="text-amber-300/80 text-xs flex-1">
              Not connected to desktop. Connect in Remote settings to transfer files.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
