import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as WebBrowser from 'expo-web-browser';
import { useSocketStore } from '../store/socketStore';

export default function TeleprompterCameraPrompt() {
    const teleprompterCameraRequest = useSocketStore((state) => state.teleprompterCameraRequest);
    const isCameraStreaming = useSocketStore((state) => state.isCameraStreaming);
    const teleprompterCountdown = useSocketStore((state) => state.teleprompterCountdown);
    const acceptCameraRequest = useSocketStore((state) => state.acceptCameraRequest);
    const rejectCameraRequest = useSocketStore((state) => state.rejectCameraRequest);
    const stopCameraStream = useSocketStore((state) => state.stopCameraStream);
    const streamMicChunk = useSocketStore((state) => state.streamMicChunk);
    const sendCameraFrame = useSocketStore((state) => state.sendCameraFrame);
    const serverIp = useSocketStore((state) => state.serverIp);

    const [permission, requestPermission] = useCameraPermissions();
    const [facing, setFacing] = useState<'front' | 'back'>('front');
    const [streamQuality, setStreamQuality] = useState<'fast' | 'hd' | 'eco'>('fast');
    const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
    const [torch, setTorch] = useState<boolean>(false);
    const [zoom, setZoom] = useState<number>(0);
    const [sentFps, setSentFps] = useState<number>(0);

    const cameraRef = useRef<any>(null);
    const fpsTrackerRef = useRef({ count: 0, lastCheck: Date.now() });

    // Pick optimal low-overhead picture size for streaming on camera ready
    const handleCameraReady = useCallback(async () => {
        try {
            if (cameraRef.current?.getAvailablePictureSizesAsync) {
                const sizes: string[] = await cameraRef.current.getAvailablePictureSizesAsync();
                if (sizes && sizes.length > 0) {
                    // Match fast resolution (480p / 720p / 640x480)
                    const preferred =
                        sizes.find((s) => s === '640x480') ||
                        sizes.find((s) => s === '800x600') ||
                        sizes.find((s) => s === '1280x720') ||
                        sizes.find((s) => s === '960x540') ||
                        sizes[sizes.length - 1];
                    if (preferred) setPictureSize(preferred);
                }
            }
        } catch (_) {}
    }, []);

    // High-performance adaptive cadence frame engine (zero-lag, non-blocking)
    useEffect(() => {
        let isMounted = true;
        let isCapturing = false;
        let animFrameId: any = null;
        let lastCaptureTime = 0;

        // FPS meter updater
        const fpsInterval = setInterval(() => {
            const now = Date.now();
            const delta = (now - fpsTrackerRef.current.lastCheck) / 1000;
            if (delta > 0) {
                setSentFps(Math.round(fpsTrackerRef.current.count / delta));
                fpsTrackerRef.current.count = 0;
                fpsTrackerRef.current.lastCheck = now;
            }
        }, 1000);

        const pumpFrame = async () => {
            if (!isMounted || !isCameraStreaming || !permission?.granted) return;

            const now = performance.now();
            // Cadence pacing: fast = ~50ms (20fps), hd = ~70ms (14fps), eco = ~100ms (10fps)
            const minInterval = streamQuality === 'fast' ? 50 : streamQuality === 'hd' ? 70 : 100;

            if (!isCapturing && now - lastCaptureTime >= minInterval && cameraRef.current) {
                isCapturing = true;
                lastCaptureTime = now;
                try {
                    const qualityVal = streamQuality === 'hd' ? 0.38 : streamQuality === 'eco' ? 0.18 : 0.26;
                    const photo = await cameraRef.current.takePictureAsync({
                        quality: qualityVal,
                        base64: true,
                        skipProcessing: true,
                        shutterSound: false,
                        fastMode: true,
                        maxDownsampling: 2,
                    });
                    if (photo?.base64 && isMounted) {
                        sendCameraFrame(photo.base64);
                        fpsTrackerRef.current.count++;
                    }
                } catch (_) {
                    // Drop frame silently if camera HAL is busy
                } finally {
                    isCapturing = false;
                }
            }

            if (isMounted && isCameraStreaming) {
                animFrameId = requestAnimationFrame(pumpFrame);
            }
        };

        if (isCameraStreaming && permission?.granted) {
            animFrameId = requestAnimationFrame(pumpFrame);
        }

        return () => {
            isMounted = false;
            if (animFrameId) cancelAnimationFrame(animFrameId);
            clearInterval(fpsInterval);
        };
    }, [isCameraStreaming, permission?.granted, streamQuality]);

    // Stream microphone audio to desktop ASR during teleprompter camera session
    useEffect(() => {
        let micInterval: any = null;
        if (isCameraStreaming) {
            streamMicChunk({ volume: 60, active: true });
            micInterval = setInterval(() => {
                streamMicChunk({ volume: 60, active: true });
            }, 500);
        } else {
            streamMicChunk({ volume: 0, active: false });
        }
        return () => {
            if (micInterval) clearInterval(micInterval);
            streamMicChunk({ volume: 0, active: false });
        };
    }, [isCameraStreaming, streamMicChunk]);

    const handleAccept = async () => {
        if (!permission?.granted) {
            const res = await requestPermission();
            if (!res.granted) return;
        }
        acceptCameraRequest();
    };

    const handleOpenWebRtcStudio = async () => {
        const url = `http://${serverIp || 'localhost'}:4000/studio-camera`;
        try {
            await WebBrowser.openBrowserAsync(url);
        } catch (_) {}
    };

    const isRecording = teleprompterCountdown?.action === 'start';

    return (
        <>
            {/* ─── Full-Screen Active Studio Camera Viewfinder & Stream ─── */}
            <Modal
                visible={isCameraStreaming}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={stopCameraStream}
            >
                <View style={styles.fullscreenContainer}>
                    {permission?.granted ? (
                        <CameraView
                            ref={cameraRef}
                            style={StyleSheet.absoluteFill}
                            facing={facing}
                            animateShutter={false}
                            pictureSize={pictureSize}
                            enableTorch={facing === 'back' && torch}
                            zoom={zoom}
                            onCameraReady={handleCameraReady}
                        />
                    ) : (
                        <View style={styles.permissionFallback}>
                            <Text style={styles.permissionText}>Camera permission needed to stream</Text>
                            <TouchableOpacity onPress={requestPermission} style={styles.acceptButton}>
                                <Text style={styles.acceptButtonText}>Grant Permission</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Studio Tally Border */}
                    <View
                        style={[
                            styles.tallyBorder,
                            isRecording ? styles.tallyBorderRec : styles.tallyBorderLive,
                        ]}
                    />

                    {/* Top Floating Controls */}
                    <View style={styles.topControlBar}>
                        <View style={styles.liveBadge}>
                            <View
                                style={[
                                    styles.liveIndicator,
                                    isRecording ? styles.liveIndicatorRec : styles.liveIndicatorLive,
                                ]}
                            />
                            <Text style={styles.liveBadgeText}>
                                {isRecording
                                    ? 'REC ON AIR'
                                    : teleprompterCountdown?.action === 'test'
                                    ? 'TEST MODE'
                                    : 'STUDIO LIVE'}
                            </Text>
                            <Text style={styles.fpsText}>{sentFps} FPS</Text>
                        </View>

                        <View style={styles.topActions}>
                            {/* Torch Fill Light for rear camera */}
                            {facing === 'back' && (
                                <TouchableOpacity
                                    onPress={() => setTorch((t) => !t)}
                                    style={[styles.actionBtn, torch && styles.actionBtnActive]}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.actionBtnText}>{torch ? '💡 ON' : '💡'}</Text>
                                </TouchableOpacity>
                            )}

                            {/* Lens Flip */}
                            <TouchableOpacity
                                onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                                style={styles.actionBtn}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.actionBtnText}>🔄 Flip</Text>
                            </TouchableOpacity>

                            {/* Stop Stream */}
                            <TouchableOpacity
                                onPress={stopCameraStream}
                                style={styles.stopButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.stopButtonText}>Stop Sharing</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* FR-5.54: Synced Pre-Recording Countdown Overlay */}
                    {teleprompterCountdown?.value !== null && teleprompterCountdown?.value !== undefined && (
                        <View style={styles.countdownOverlay}>
                            <Text style={styles.countdownDigit}>
                                {teleprompterCountdown.value === 0 ? 'GO' : teleprompterCountdown.value}
                            </Text>
                            <Text style={styles.countdownSub}>Look at the camera — starting now</Text>
                        </View>
                    )}

                    {/* Bottom Studio Controls Deck */}
                    <View style={styles.bottomControlDeck}>
                        {/* Quality Switcher Pills */}
                        <View style={styles.qualityPillGroup}>
                            {(['fast', 'hd', 'eco'] as const).map((q) => (
                                <TouchableOpacity
                                    key={q}
                                    onPress={() => setStreamQuality(q)}
                                    style={[styles.qualityPill, streamQuality === q && styles.qualityPillActive]}
                                    activeOpacity={0.8}
                                >
                                    <Text
                                        style={[
                                            styles.qualityPillText,
                                            streamQuality === q && styles.qualityPillTextActive,
                                        ]}
                                    >
                                        {q === 'fast' ? '⚡ FAST' : q === 'hd' ? '🌟 HD' : '🌱 ECO'}
                                    </Text>
                                </TouchableOpacity>
                            ))}

                            {/* Zoom Toggles */}
                            <View style={styles.zoomGroup}>
                                {[0, 0.05, 0.1].map((z, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        onPress={() => setZoom(z)}
                                        style={[styles.zoomBtn, zoom === z && styles.zoomBtnActive]}
                                    >
                                        <Text style={styles.zoomText}>{idx === 0 ? '1x' : idx === 1 ? '1.5x' : '2x'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Broadcast WebRTC Mode Link */}
                        <TouchableOpacity
                            onPress={handleOpenWebRtcStudio}
                            style={styles.webRtcLinkBtn}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.webRtcLinkText}>
                                🚀 Open Ultra HD WebRTC Studio (60 FPS Native)
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ─── Incoming Camera Request Modal ─── */}
            <Modal
                visible={!!teleprompterCameraRequest && !isCameraStreaming}
                transparent
                animationType="fade"
                onRequestClose={rejectCameraRequest}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.iconCircle}>
                            <Text style={{ fontSize: 28 }}>📹</Text>
                        </View>

                        <Text style={styles.modalTitle}>Camera Access Requested</Text>

                        <Text style={styles.modalBody}>
                            The desktop operator is requesting your phone camera feed for the Teleprompter panel
                            {teleprompterCameraRequest?.scriptTitle ? ` ("${teleprompterCameraRequest.scriptTitle}")` : ''}.
                        </Text>

                        <View style={styles.privacyBox}>
                            <Text style={styles.privacyText}>
                                🔒 Stream is transmitted directly over your local Wi-Fi network and is not uploaded to cloud servers.
                            </Text>
                        </View>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                onPress={rejectCameraRequest}
                                style={styles.declineButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.declineButtonText}>Decline</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={handleAccept}
                                style={styles.acceptButton}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.acceptButtonText}>Accept & Stream</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    fullscreenContainer: {
        flex: 1,
        backgroundColor: '#000000',
    },
    tallyBorder: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderWidth: 3,
        pointerEvents: 'none',
        zIndex: 40,
    },
    tallyBorderLive: {
        borderColor: 'rgba(16, 185, 129, 0.6)',
    },
    tallyBorderRec: {
        borderColor: 'rgba(239, 68, 68, 0.95)',
    },
    permissionFallback: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    permissionText: {
        color: '#ffffff',
        fontSize: 14,
        marginBottom: 16,
    },
    topControlBar: {
        position: 'absolute',
        top: 48,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50,
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    liveIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    liveIndicatorLive: {
        backgroundColor: '#10b981',
    },
    liveIndicatorRec: {
        backgroundColor: '#ef4444',
    },
    liveBadgeText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 0.5,
    },
    fpsText: {
        color: '#10b981',
        fontSize: 10,
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        marginLeft: 4,
    },
    topActions: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'center',
    },
    actionBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    actionBtnActive: {
        backgroundColor: '#f59e0b',
        borderColor: '#fbbf24',
    },
    actionBtnText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    stopButton: {
        backgroundColor: '#dc2626',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    stopButtonText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    countdownOverlay: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    countdownDigit: {
        fontSize: 110,
        fontWeight: '900',
        color: '#ffffff',
        textAlign: 'center',
    },
    countdownSub: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: 12,
    },
    bottomControlDeck: {
        position: 'absolute',
        bottom: 28,
        left: 14,
        right: 14,
        gap: 8,
        zIndex: 50,
    },
    qualityPillGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: 14,
        padding: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    qualityPill: {
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 8,
    },
    qualityPillActive: {
        backgroundColor: '#7c3aed',
    },
    qualityPillText: {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: 10,
        fontWeight: 'bold',
    },
    qualityPillTextActive: {
        color: '#ffffff',
    },
    zoomGroup: {
        flexDirection: 'row',
        gap: 4,
        marginLeft: 'auto',
    },
    zoomBtn: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 6,
    },
    zoomBtnActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    zoomText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    webRtcLinkBtn: {
        backgroundColor: 'rgba(124, 58, 237, 0.85)',
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.4)',
    },
    webRtcLinkText: {
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 0.3,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#12111a',
        borderWidth: 1,
        borderColor: 'rgba(124, 58, 237, 0.4)',
        borderRadius: 24,
        padding: 24,
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(124, 58, 237, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    modalBody: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16,
    },
    privacyBox: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
        width: '100%',
    },
    privacyText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 11,
        lineHeight: 15,
        textAlign: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    declineButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
    },
    declineButtonText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
    },
    acceptButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: '#7c3aed',
        alignItems: 'center',
    },
    acceptButtonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
    },
});
