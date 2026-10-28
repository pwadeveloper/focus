import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentItem } from '../types';
import type { RoomWriter } from '../../api/_lib/types';
import { RoomSync, type DocUpdate, type RoomSyncState } from './RoomSync';

interface UseRoomSyncOptions {
  /** The open document; syncing runs only when it is a writers room script. */
  doc: DocumentItem;
  me: RoomWriter | null;
  /** The scene on screen, or null outside the editor */
  sceneId: string | null;
  /** Ask to hold sceneId so this writer can type in it */
  wantLock: boolean;
  onRemote: (docId: string, update: DocUpdate) => void;
}

/** Runs a RoomSync for the open writers room script. */
export function useRoomSync({ doc, me, sceneId, wantLock, onRemote }: UseRoomSyncOptions) {
  const [state, setState] = useState<RoomSyncState | null>(null);
  const engineRef = useRef<RoomSync | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const onRemoteRef = useRef(onRemote);
  onRemoteRef.current = onRemote;

  const scriptId = me ? doc.room?.scriptId : undefined;
  const docId = doc.id;

  useEffect(() => {
    if (!scriptId || !me) {
      setState(null);
      return;
    }
    const engine = new RoomSync(scriptId, me, docRef.current, setState, (update) =>
      onRemoteRef.current(docId, update)
    );
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
      setState(null);
    };
    // A new engine per script and writer; the doc itself streams in below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, docId, me?.id]);

  useEffect(() => {
    engineRef.current?.setDoc(doc);
  }, [doc]);

  useEffect(() => {
    engineRef.current?.setFocus(sceneId, wantLock);
  }, [sceneId, wantLock, scriptId]);

  const keepWriting = useCallback(() => engineRef.current?.keepWriting(), []);

  return { state, keepWriting };
}
