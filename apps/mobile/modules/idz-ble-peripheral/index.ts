/**
 * JS face of the native BLE peripheral (ios/IdzBlePeripheralModule.swift). When the native module
 * is absent (Expo Go, Jest, simulator without the module) every call is a no-op and the state is
 * `unsupported`, so the rest of the app never has to check.
 */
import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from 'expo-modules-core';

export type BleRadioState =
  | 'unknown'
  | 'resetting'
  | 'unsupported'
  | 'unauthorized'
  | 'poweredOff'
  | 'poweredOn';

export type BleAuthorization = 'notDetermined' | 'restricted' | 'denied' | 'allowedAlways';

export interface BleNativeState {
  state: BleRadioState;
  authorization: BleAuthorization;
  advertising: boolean;
  error?: string;
}

export interface BleReadEvent {
  /** CoreBluetooth identifier of the central that read the characteristic (opaque, per phone). */
  central: string;
  /** Milliseconds since the epoch. */
  at: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- an interface has no implicit index signature, which NativeModule<EventsMap> requires
export type BleEvents = {
  onStateChange: (state: BleNativeState) => void;
  onRead: (event: BleReadEvent) => void;
};

export interface IdzBlePeripheralNative {
  isSupported(): boolean;
  getState(): BleNativeState;
  /** Start advertising with the 16-byte rotating id as 32 hex chars. */
  start(rotatingIdHex: string): Promise<void>;
  /** Replace the rotating id at a window boundary. */
  update(rotatingIdHex: string): Promise<void>;
  stop(): Promise<void>;
  addListener<E extends keyof BleEvents>(event: E, listener: BleEvents[E]): EventSubscription;
}

const UNSUPPORTED: BleNativeState = {
  state: 'unsupported',
  authorization: 'notDetermined',
  advertising: false,
};

/** Fallback used wherever the Swift module is not linked. */
export const noopBlePeripheral: IdzBlePeripheralNative = {
  isSupported: () => false,
  getState: () => UNSUPPORTED,
  start: () => Promise.resolve(),
  update: () => Promise.resolve(),
  stop: () => Promise.resolve(),
  addListener: () => ({ remove: () => undefined }),
};

type NativeShape = NativeModule<BleEvents> & Omit<IdzBlePeripheralNative, 'addListener'>;

let native: IdzBlePeripheralNative =
  (requireOptionalNativeModule<NativeShape>('IdzBlePeripheral') as IdzBlePeripheralNative | null) ??
  noopBlePeripheral;

/** The linked native module, or the no-op fallback. */
export function blePeripheral(): IdzBlePeripheralNative {
  return native;
}

/** Test hook: swap in a fake. Returns the previous implementation. */
export function setBlePeripheralForTests(impl: IdzBlePeripheralNative | null): IdzBlePeripheralNative {
  const previous = native;
  native = impl ?? noopBlePeripheral;
  return previous;
}
