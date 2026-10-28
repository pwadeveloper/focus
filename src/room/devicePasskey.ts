import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type { SessionResponse } from '../../api/_lib/types';
import { roomApi } from './api';

/** e.g. "iPhone · Safari", so writers can tell their devices apart. */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
    ? 'iPad'
    : /Android/.test(ua)
    ? 'Android'
    : /Mac/.test(ua)
    ? 'Mac'
    : /Windows/.test(ua)
    ? 'Windows'
    : /Linux/.test(ua)
    ? 'Linux'
    : 'Device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
    ? 'Firefox'
    : /Chrome\//.test(ua)
    ? 'Chrome'
    : /Safari\//.test(ua)
    ? 'Safari'
    : '';
  return browser ? `${device} · ${browser}` : device;
}

/** Turns WebAuthn failures into something a writer can act on. */
function friendly(error: unknown): Error {
  const name = (error as { name?: string })?.name;
  // Browsers report "cancelled" and "no passkey on this device" the same way
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return new Error(
      'Not confirmed. If this device doesn’t have your passkey, choose your phone in the prompt and scan the QR code.'
    );
  }
  if (name === 'InvalidStateError') {
    return new Error('This device is already added. Use “Confirm it’s you” instead.');
  }
  return error instanceof Error ? error : new Error('Your device couldn’t finish. Try again.');
}

function assertSupported() {
  if (!browserSupportsWebAuthn()) {
    throw new Error('This browser can’t use Face ID, Touch ID or security keys. Try a recent Chrome, Safari, Edge or Firefox.');
  }
}

/** Confirms it's this writer with a device passkey they added earlier. */
export async function confirmWithDevice(): Promise<SessionResponse> {
  assertSupported();
  const options = await roomApi.devicePasskeyAction<PublicKeyCredentialRequestOptionsJSON>('confirm-options');
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (error) {
    throw friendly(error);
  }
  return roomApi.devicePasskeyAction<SessionResponse>('confirm', { response });
}

/** Adds this device's Face ID / Touch ID / screen lock (or a security key). */
export async function addThisDevice(): Promise<SessionResponse> {
  assertSupported();
  const options = await roomApi.devicePasskeyAction<PublicKeyCredentialCreationOptionsJSON>('register-options');
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (error) {
    throw friendly(error);
  }
  return roomApi.devicePasskeyAction<SessionResponse>('register', { response, label: deviceLabel() });
}

/**
 * The extra step for writers rooms: confirm with a device passkey, or add
 * this device's when the writer has none yet.
 */
export const unlockRooms = (account: SessionResponse) =>
  account.security.devicePasskeys > 0 ? confirmWithDevice() : addThisDevice();
