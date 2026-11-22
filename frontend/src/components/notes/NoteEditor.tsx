import { useEffect, useRef } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import { filterSuggestionItems } from '@blocknote/core';
import { SuggestionMenuController, useCreateBlockNote } from '@blocknote/react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';

/**
 * The block editor. The note's Markdown is the original: it is turned into blocks when the note opens and
 * back into Markdown on every change. Loaded on demand, because the editor is large.
 */
export default function NoteEditor({ markdown, onChange, upload, mentions, plain = false }: {
  /** No block handles on the side: it reads like plain text, and Markdown shortcuts (## , ### , > , - ) do the formatting. */
  plain?: boolean;
  markdown: string;
  mentions: { id: string; title: string }[];
  onChange: (markdown: string) => void;
  upload: (file: File) => Promise<string>;
}) {
  const editor = useCreateBlockNote({ uploadFile: upload });
  const baseline = useRef<string | null>(null); // what the note reads like right after loading: not a change by the user

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(markdown);
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      baseline.current = await editor.blocksToMarkdownLossy(editor.document);
    })();
    return () => { cancelled = true; };
    // The editor is created for one note (the parent gives it a key), so it loads once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="nt-editor">
      <BlockNoteView
        editor={editor}
        theme="dark"
        sideMenu={!plain}
        onChange={() => {
          if (baseline.current === null) return;
          const md = editor.blocksToMarkdownLossy(editor.document);
          if (md !== baseline.current) { baseline.current = md; onChange(md); }
        }}
      >
        {/* Typing @ offers the other notes; the choice becomes a link to that note (and a backlink on it). */}
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={async (query) => filterSuggestionItems(
            mentions.map((m) => ({
              title: m.title || 'Untitled',
              onItemClick: () => editor.insertInlineContent([{ type: 'link', href: `/notes?note=${m.id}`, content: m.title || 'Untitled' }, ' ']),
            })),
            query,
          ).slice(0, 8)}
        />
      </BlockNoteView>
    </div>
  );
}
