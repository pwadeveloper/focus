import { DocumentItem, DocumentUnit, TextMetrics } from './types';

export function computeMetrics(html: string): TextMetrics {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const blocks = temp.querySelectorAll('p, h1, h2, h3, li, blockquote, pre, div');
  let paragraphCount = 0;
  blocks.forEach((b) => {
    const t = (b.textContent || '').trim();
    if (t.length > 0) paragraphCount += 1;
    b.appendChild(document.createTextNode(' '));
  });

  const rawText = temp.textContent || '';
  const normalized = rawText.replace(/\s+/g, ' ').trim();
  const words = normalized.length === 0 ? 0 : normalized.split(' ').length;
  const characters = rawText.replace(/\n/g, '').trim().length;
  const charactersNoSpaces = rawText.replace(/\s+/g, '').length;
  const readingTimeMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 225));

  return {
    words,
    characters,
    charactersNoSpaces,
    paragraphs: Math.max(words > 0 ? 1 : 0, paragraphCount),
    readingTimeMinutes,
  };
}

export function computeDocumentTotalMetrics(doc: DocumentItem): TextMetrics {
  if (!doc.units || doc.units.length === 0) {
    return computeMetrics(doc.contentHtml || '');
  }
  const combinedHtml = doc.units.map((u) => u.contentHtml).join('\n');
  return computeMetrics(combinedHtml);
}

export function getUnitBadgeLabel(
  unit: DocumentUnit,
  allUnits: DocumentUnit[]
): string {
  const sceneIdx = allUnits.findIndex((u) => u.id === unit.id) + 1;
  return `Scene ${Math.max(1, sceneIdx)}`;
}

export function extractPlainTextSnippet(html: string, maxLength = 150): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  // For screenplays, skip the first slugline node if there's action/dialogue below it
  const firstSlug = temp.querySelector('p[data-sp-type="slugline"]');
  if (firstSlug && temp.children.length > 1) {
    firstSlug.remove();
  }
  const blocks = temp.querySelectorAll('p, h1, h2, h3, li, blockquote');
  blocks.forEach((b) => b.appendChild(document.createTextNode(' ')));
  const raw = (temp.textContent || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Empty page — click to begin writing…';
  if (raw.length <= maxLength) return raw;
  return `${raw.slice(0, maxLength).trim()}…`;
}

export function extractScreenplayCharacters(doc: DocumentItem): string[] {
  const names = new Set<string>();
  const units = doc.units || [];
  const temp = document.createElement('div');

  units.forEach((u) => {
    temp.innerHTML = u.contentHtml;
    temp.querySelectorAll('p[data-sp-type="character"]').forEach((el) => {
      const raw = (el.textContent || '')
        .replace(/\(.*?\)/g, '')
        .trim()
        .toUpperCase();
      if (raw && raw.length >= 2 && raw.length <= 32) {
        names.add(raw);
      }
    });
  });

  return Array.from(names);
}

export function extractScreenplayLocations(doc: DocumentItem): string[] {
  const locs = new Set<string>();
  const units = doc.units || [];
  const temp = document.createElement('div');

  units.forEach((u) => {
    if (u.slugline) {
      locs.add(u.slugline.toUpperCase());
    }
    temp.innerHTML = u.contentHtml;
    temp.querySelectorAll('p[data-sp-type="slugline"]').forEach((el) => {
      const raw = (el.textContent || '').trim().toUpperCase();
      if (raw) locs.add(raw);
    });
  });

  return Array.from(locs);
}

export function extractPlainText(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const lines: string[] = [];

  temp.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) lines.push(text);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        Array.from(el.querySelectorAll('li')).forEach((li, idx) => {
          const prefix = tag === 'ol' ? `${idx + 1}. ` : '• ';
          lines.push(`${prefix}${li.textContent?.trim() || ''}`);
        });
      } else if (tag === 'hr') {
        lines.push('---');
      } else {
        lines.push(el.textContent?.trim() || '');
      }
    }
  });

  return lines.join('\n\n').trim();
}

export function htmlToMarkdown(title: string, html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  function inlineToMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = Array.from(el.childNodes).map(inlineToMd).join('');

    switch (tag) {
      case 'strong':
      case 'b':
        return inner.trim() ? `**${inner}**` : '';
      case 'em':
      case 'i':
        return inner.trim() ? `*${inner}*` : '';
      case 's':
      case 'strike':
      case 'del':
        return inner.trim() ? `~~${inner}~~` : '';
      case 'code':
        return `\`${inner}\``;
      case 'a': {
        const href = el.getAttribute('href') || '';
        return `[${inner}](${href})`;
      }
      case 'br':
        return '\n';
      default:
        return inner;
    }
  }

  const blocks: string[] = [];
  if (title.trim()) {
    blocks.push(`# ${title.trim()}`);
  }

  Array.from(temp.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim();
      if (t) blocks.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const spType = el.getAttribute('data-sp-type');
    const content = Array.from(el.childNodes).map(inlineToMd).join('').trim();

    if (spType === 'slugline') {
      blocks.push(`### ${content.toUpperCase()}`);
      return;
    }
    if (spType === 'character') {
      const dualMark = el.getAttribute('data-dual') === '2' ? ' ^' : '';
      blocks.push(`**${content.toUpperCase()}**${dualMark}`);
      return;
    }
    // Remaining screenplay elements follow Fountain notation
    if (spType === 'shot' || spType === 'cast-list' || spType === 'sequence') {
      blocks.push(content.toUpperCase());
      return;
    }
    if (spType === 'centered' || spType === 'act-break') {
      blocks.push(`> ${content.toUpperCase()} <`);
      return;
    }
    if (spType === 'lyrics') {
      blocks.push(`~${content}`);
      return;
    }
    if (spType === 'section') {
      blocks.push(`# ${content}`);
      return;
    }
    if (spType === 'synopsis') {
      blocks.push(`= ${content}`);
      return;
    }
    if (spType === 'note') {
      blocks.push(`[[${content}]]`);
      return;
    }
    if (spType === 'page-break') {
      blocks.push('===');
      return;
    }
    if (spType === 'parenthetical') {
      blocks.push(`*${content}*`);
      return;
    }
    if (spType === 'transition') {
      blocks.push(`> ${content.toUpperCase()}`);
      return;
    }

    switch (tag) {
      case 'h1':
        blocks.push(`# ${content}`);
        break;
      case 'h2':
        blocks.push(`## ${content}`);
        break;
      case 'h3':
        blocks.push(`### ${content}`);
        break;
      case 'blockquote':
        blocks.push(`> ${content}`);
        break;
      case 'ul': {
        const items = Array.from(el.querySelectorAll('li')).map(
          (li) => `- ${Array.from(li.childNodes).map(inlineToMd).join('').trim()}`
        );
        blocks.push(items.join('\n'));
        break;
      }
      case 'ol': {
        const items = Array.from(el.querySelectorAll('li')).map(
          (li, idx) => `${idx + 1}. ${Array.from(li.childNodes).map(inlineToMd).join('').trim()}`
        );
        blocks.push(items.join('\n'));
        break;
      }
      case 'pre':
        blocks.push(`\`\`\`\n${el.textContent || ''}\n\`\`\``);
        break;
      case 'hr':
        blocks.push('---');
        break;
      default:
        if (content) blocks.push(content);
        break;
    }
  });

  return blocks.join('\n\n').trim() + '\n';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const DEFAULT_TITLE_PAGE_CREDIT = 'Written by';

/** Fountain title page block: `Key: value` lines, multi-line values indented. */
export function titlePageToFountain(doc: DocumentItem): string {
  const tp = doc.titlePage ?? {};
  const fields: [string, string | undefined][] = [
    ['Title', doc.title],
    ['Episode', tp.episode?.trim() ? `"${tp.episode.trim()}"` : undefined],
    ['Credit', tp.credit ?? DEFAULT_TITLE_PAGE_CREDIT],
    ['Author', tp.author],
    ['Source', tp.source],
    ['Draft date', tp.draftDate],
    ['Contact', tp.contact],
    ['Notes', tp.notes],
    ['Copyright', tp.copyright],
  ];
  return fields
    .filter(([, value]) => value && value.trim())
    .map(([key, value]) => {
      const lines = value!.trim().split(/\n/);
      return lines.length === 1
        ? `${key}: ${lines[0]}`
        : `${key}:\n${lines.map((l) => `    ${l}`).join('\n')}`;
    })
    .join('\n');
}

export function documentToFullMarkdown(doc: DocumentItem): string {
  if (!doc.units || doc.units.length === 0) {
    return htmlToMarkdown(doc.title, doc.contentHtml);
  }

  // Screenplays open with a Fountain title page
  const sections: string[] = [titlePageToFountain(doc)];

  const allUnits = doc.units;
  allUnits.forEach((u) => {
    const badge = getUnitBadgeLabel(u, allUnits);
    sections.push(htmlToMarkdown(`${badge}: ${u.slugline || u.title}`, u.contentHtml));
  });

  return sections.join('\n\n') + '\n';
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function slugifyFilename(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'untitled-screenplay';
}
