import * as ImagePicker from 'expo-image-picker';
import { Linking, Platform } from 'react-native';

// Thin wrapper over expo-image-picker (SDK 54 → ~17.0.11, bundled in Expo Go).
//
// Exists so screens never deal with permission plumbing or the picker's
// result union directly: every entry point returns the same three-way
// PickOutcome, so the caller renders a real message instead of silently
// no-op'ing when the user denies access.

export type PickedAsset = ImagePicker.ImagePickerAsset;

export type PickOutcome =
  | { status: 'picked'; asset: PickedAsset }
  | { status: 'cancelled' }
  // `blocked` means the OS will no longer show a prompt — the only way back is
  // the Settings app, so the caller should surface a link there.
  | { status: 'denied'; message: string; blocked: boolean };

// `quality` is the important one: the API caps uploads at 5 MB
// (multer `fileSize` in api/src/routes/products.ts), and a modern phone camera
// easily clears that at full quality. 0.7 keeps a typical 12 MP shot near 1 MB
// with no visible loss at storefront sizes. `allowsEditing` gives the merchant
// a square crop, which is what the storefront grid expects.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.7,
};

function toOutcome(result: ImagePicker.ImagePickerResult): PickOutcome {
  if (result.canceled || !result.assets?.length) return { status: 'cancelled' };
  return { status: 'picked', asset: result.assets[0] };
}

/**
 * Pick one image from the device photo library.
 *
 * Android needs no permission here — the system photo picker hands back a
 * single user-chosen file without granting the app library-wide access. iOS
 * still gates the picker behind NSPhotoLibraryUsageDescription.
 */
export async function pickFromLibrary(): Promise<PickOutcome> {
  if (Platform.OS !== 'android') {
    const { granted, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      return {
        status: 'denied',
        blocked: !canAskAgain,
        message: canAskAgain
          ? 'Photo access is needed to choose an image.'
          : 'Photo access is blocked. Enable it in Settings, then try again.',
      };
    }
  }
  return toOutcome(await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS));
}

/** Take a photo. Camera permission IS required on both platforms. */
export async function takePhoto(): Promise<PickOutcome> {
  const { granted, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
  if (!granted) {
    return {
      status: 'denied',
      blocked: !canAskAgain,
      message: canAskAgain
        ? 'Camera access is needed to take a photo.'
        : 'Camera access is blocked. Enable it in Settings, then try again.',
    };
  }
  return toOutcome(await ImagePicker.launchCameraAsync(PICKER_OPTIONS));
}

/** Deep-link to this app's settings page so a blocked permission can be re-granted. */
export function openAppSettings(): void {
  Linking.openSettings().catch(() => {});
}
