import { Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

// Tap-to-enlarge lightbox: shows the image full-screen (contained, so landscape
// photos fill the width like on Instagram). Tap anywhere / the × to close.
export default function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        {uri ? <Image source={{ uri }} style={styles.image} contentFit="contain" /> : null}
      </TouchableOpacity>
      <TouchableOpacity style={styles.close} onPress={onClose}>
        <Ionicons name="close" size={28} color="#FFF" />
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '78%' },
  close: { position: 'absolute', top: 54, right: 18, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
