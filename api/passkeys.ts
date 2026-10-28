import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { db, toNumber } from './_lib/db.js';
import { requireDeviceCheck, requireWriter, sessionPayload, type Writer } from './_lib/auth.js';
import { HttpError, assertSameOrigin, cleanText, handle, json, readJson } from './_lib/http.js';
import type { DevicePasskey } from './_lib/types.js';

/**
 * Device passkeys (WebAuthn): Face ID, Touch ID, Windows Hello or a security
 * key. Confirming with one opens shared writers rooms on this device.
 */

interface PasskeysBody {
  action: 'register-options' | 'register' | 'confirm-options' | 'confirm' | 'remove';
  response: unknown;
  label: string;
  id: string;
}

const CHALLENGE_SECONDS = 300;

/** The site the browser is on: passkeys are bound to this hostname. */
function relyingParty(request: Request) {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

async function saveChallenge(writer: Writer, challenge: string) {
  await db()`
    insert into webauthn_challenges (session_hash, challenge, expires_at)
    values (${writer.sessionHash}, ${challenge}, now() + make_interval(secs => ${CHALLENGE_SECONDS}::int))
    on conflict (session_hash) do update set challenge = excluded.challenge, expires_at = excluded.expires_at
  `;
}

/** The pending challenge, usable once. */
async function takeChallenge(writer: Writer): Promise<string> {
  const [row] = await db()`
    delete from webauthn_challenges
    where session_hash = ${writer.sessionHash}
    returning challenge, expires_at > now() as fresh
  `;
  if (!row?.fresh) throw new HttpError(400, 'That took too long. Try again.');
  return String(row.challenge);
}

async function markVerified(writer: Writer) {
  await db()`update sessions set room_verified_at = now() where token_hash = ${writer.sessionHash}`;
}

async function listDevices(writerId: string) {
  return db()`
    select id, label, transports, created_at, last_used_at from device_passkeys
    where writer_id = ${writerId} order by created_at
  `;
}

/** GET: this writer's device passkeys. */
export function GET(request: Request) {
  return handle(async () => {
    const me = await requireWriter(request);
    const devices: DevicePasskey[] = (await listDevices(me.id)).map((row) => ({
      id: String(row.id),
      label: String(row.label),
      createdAt: new Date(row.created_at as string).toISOString(),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string).toISOString() : null,
    }));
    return json({ devices });
  });
}

export function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const me = await requireWriter(request);
    const body = await readJson<PasskeysBody>(request);
    const { rpID, origin } = relyingParty(request);
    const sql = db();

    switch (body.action) {
      case 'register-options': {
        // A first device passkey only needs the signed-in session; adding more
        // needs a recent confirmation, so a stolen text passkey can't add one
        if (me.devicePasskeys > 0) {
          requireDeviceCheck(me, 'Confirm with a device you already added before adding another.');
        }
        const existing = await listDevices(me.id);
        const options = await generateRegistrationOptions({
          rpName: 'Focus',
          rpID,
          userName: me.name,
          userDisplayName: me.name,
          userID: new TextEncoder().encode(me.id),
          attestationType: 'none',
          excludeCredentials: existing.map((row) => ({
            id: String(row.id),
            transports: (row.transports as string[] | null) ?? undefined,
          })),
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        });
        await saveChallenge(me, options.challenge);
        return json(options);
      }

      case 'register': {
        if (me.devicePasskeys > 0) {
          requireDeviceCheck(me, 'Confirm with a device you already added before adding another.');
        }
        const expectedChallenge = await takeChallenge(me);
        let verification;
        try {
          verification = await verifyRegistrationResponse({
            response: body.response as RegistrationResponseJSON,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
          });
        } catch {
          throw new HttpError(400, 'Your device’s response couldn’t be checked. Try again.');
        }
        if (!verification.verified) throw new HttpError(400, 'Your device’s response couldn’t be checked. Try again.');
        const { credential } = verification.registrationInfo;
        await sql`
          insert into device_passkeys (id, writer_id, public_key, counter, transports, label)
          values (
            ${credential.id}, ${me.id}, ${Buffer.from(credential.publicKey).toString('base64url')},
            ${credential.counter}, ${credential.transports ?? null}, ${cleanText(body.label, 60) || 'Device passkey'}
          )
          on conflict (id) do nothing
        `;
        // Adding one is itself a confirmation
        await markVerified(me);
        return json(await sessionPayload({ ...me, devicePasskeys: me.devicePasskeys + 1, roomVerified: true }));
      }

      case 'confirm-options': {
        const devices = await listDevices(me.id);
        if (devices.length === 0) throw new HttpError(400, 'Add Face ID, Touch ID or a security key first.');
        const options = await generateAuthenticationOptions({
          rpID,
          userVerification: 'required',
          allowCredentials: devices.map((row) => ({
            id: String(row.id),
            transports: (row.transports as string[] | null) ?? undefined,
          })),
        });
        await saveChallenge(me, options.challenge);
        return json(options);
      }

      case 'confirm': {
        const response = body.response as AuthenticationResponseJSON;
        const expectedChallenge = await takeChallenge(me);
        const [device] = await sql`
          select id, public_key, counter, transports from device_passkeys
          where id = ${String(response?.id ?? '')} and writer_id = ${me.id}
        `;
        if (!device) throw new HttpError(400, 'That passkey isn’t one you added to Focus.');
        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
            credential: {
              id: String(device.id),
              publicKey: new Uint8Array(Buffer.from(String(device.public_key), 'base64url')),
              counter: toNumber(device.counter),
              transports: (device.transports as string[] | null) ?? undefined,
            },
          });
        } catch {
          throw new HttpError(400, 'Your device’s response couldn’t be checked. Try again.');
        }
        if (!verification.verified) throw new HttpError(400, 'Your device’s response couldn’t be checked. Try again.');
        await sql`
          update device_passkeys
          set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now()
          where id = ${device.id}
        `;
        await markVerified(me);
        return json(await sessionPayload({ ...me, roomVerified: true }));
      }

      case 'remove': {
        requireDeviceCheck(me, 'Confirm it’s you before removing a device.');
        await sql`delete from device_passkeys where id = ${String(body.id ?? '')} and writer_id = ${me.id}`;
        const [row] = await sql`select count(*)::int as n from device_passkeys where writer_id = ${me.id}`;
        return json(await sessionPayload({ ...me, devicePasskeys: Number(row.n) }));
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  });
}
