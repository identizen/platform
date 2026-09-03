import { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { parseChallengeId } from '../challenges/receive';
import { Button, ErrorText, Muted, Screen } from '../components/ui';

export interface ScanScreenProps {
  onScanned: (challengeId: string) => Promise<void>;
  onBack: () => void;
}

/** PRD 7.2 step 2c: scan the QR the site shows; it encodes the same deep link. */
export function ScanScreen({ onScanned, onBack }: ScanScreenProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  const onBarcode = ({ data }: { data: string }) => {
    if (handled.current) return;
    const id = parseChallengeId(data);
    if (!id) {
      setError('That is not an Identizen sign-in code.');
      return;
    }
    handled.current = true;
    void onScanned(id).catch((err: unknown) => {
      handled.current = false;
      setError(String(err));
    });
  };

  if (!permission?.granted) {
    return (
      <Screen scroll={false} testID="scan-permission" title="Camera" onBack={onBack}>
        <Muted>Identizen needs the camera to read sign-in codes. Nothing is recorded.</Muted>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} testID="scan" title="Scan the code" onBack={onBack}>
      <Muted center>Point the camera at the code the site is showing.</Muted>
      <View className="flex-1 overflow-hidden rounded-lg">
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcode}
        />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Screen>
  );
}
