import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

interface VideoThumbProps {
  uri: string;
  /** Style applied to the outer container (same size as your thumb) */
  style?: StyleProp<ViewStyle>;
  /** Icon size for the play overlay. Default 32. */
  iconSize?: number;
}

/**
 * Generates a real thumbnail from a video URI.
 * Falls back to the dark purple placeholder if extraction fails.
 */
export default function VideoThumb({ uri, style, iconSize = 32 }: VideoThumbProps) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.6 })
      .then((result) => {
        if (!cancelled) setThumbUri(result.uri);
      })
      .catch(() => {
        // Silently fall back to placeholder
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return (
    <View style={[styles.container, style]}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]} />
      )}
      {/* Play icon overlay */}
      <MaterialIcons name="play-circle-filled" size={iconSize} color="#fff" style={styles.icon} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    backgroundColor: '#1e1b4b',
  },
  icon: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
