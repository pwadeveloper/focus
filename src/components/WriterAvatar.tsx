import React from 'react';
import type { RoomWriter } from '../../api/_lib/types';
import { toneChip } from '../palette';

/** A writer's initial on their room color. */
export const WriterAvatar: React.FC<{
  writer: Pick<RoomWriter, 'name' | 'color'>;
  size?: 'sm' | 'md';
  title?: string;
  className?: string;
}> = ({ writer, size = 'md', title, className = '' }) => (
  <span
    title={title}
    aria-hidden={title ? undefined : true}
    style={toneChip(writer.color)}
    className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase ${
      size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs'
    } ${className}`}
  >
    {writer.name.trim().charAt(0) || '?'}
  </span>
);
