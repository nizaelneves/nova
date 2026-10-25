import { ApiKeyInput, CLOUD_KEYS } from './keys';
import { Icon, type IconName } from './Icon';
import type { ToolInfo } from '../lib/api';

const CATEGORY_ICON: Record<string, IconName> = {
  math: 'pie-chart-2', filesystem: 'folder', code: 'code', vcs: 'layers', memory: 'database', knowledge: 'book-2',
  knowledge_graph: 'target', storage: 'safe-square', communication: 'chat-round-dots', channel: 'chat-round-dots',
  media: 'clapperboard-play', system: 'cpu', web: 'link-round', search: 'magnifer',
};

/** "web_search" becomes "Web Search". */
const toolTitle = (name: string): string => name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** The keys of a tool the user has to add by hand (the cloud model keys live in the island). */
const ownKeys = (t: ToolInfo): string[] => t.credential_keys.filter((k) => !CLOUD_KEYS.has(k));

/** Every tool Phibe can use, one card each: ready when it works, with a key field when it needs one. */
export function ToolCards({ tools }: { tools: ToolInfo[] }) {
  return (
    <div className="ds-grid">
      {[...tools].sort((x, y) => toolTitle(x.name).localeCompare(toolTitle(y.name), undefined, { sensitivity: 'base' })).map((t) => {
        const keys = ownKeys(t);
        return (
          <div key={t.name} className="ds-card ds-tool" data-on={t.configured || undefined}>
            <div className="ds-top">
              <div className="logo-tile" style={{ width: 44, height: 44 }} aria-hidden="true">
                <Icon name={CATEGORY_ICON[t.category] ?? 'bolt'} size={22} />
              </div>
              <span className="ds-state" data-on={t.configured || undefined}>{t.configured ? 'Ready' : 'Needs a key'}</span>
            </div>
            <div className="ds-name">{toolTitle(t.name)}</div>
            <div className="ds-desc">{t.description || t.category}</div>
            {keys.length > 0 && (
              <div className="ds-keys">
                {keys.map((k) => (
                  <div key={k} className="ds-key">
                    <span>{k.replace(/_API_KEY$|_TOKEN$|_ID$/, '').replace(/_/g, ' ').toLowerCase()}</span>
                    <ApiKeyInput keyName={k} placeholder={k} toolName={t.name} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
