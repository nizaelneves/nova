import { Pin, PinOff, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAppStore } from '../../lib/store';
import type { Conversation } from '../../types';

interface Props {
  searchQuery: string;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ConversationRow({ conv }: { conv: Conversation }) {
  const navigate = useNavigate();
  const activeId = useAppStore((s) => s.activeId);
  const streamingConversationId = useAppStore((s) =>
    s.streamState.isStreaming ? s.streamState.conversationId : null,
  );
  const selectConversation = useAppStore((s) => s.selectConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const togglePinConversation = useAppStore((s) => s.togglePinConversation);

  const isActive = conv.id === activeId;
  const isStreaming = conv.id === streamingConversationId;

  return (
    <div
      className="group flex items-center rounded-lg cursor-pointer transition-colors"
      style={{ background: isActive ? 'var(--color-bg-tertiary)' : 'transparent' }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = 'var(--color-bg-secondary)';
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent';
      }}
    >
      <button
        onClick={() => {
          selectConversation(conv.id);
          navigate('/');
        }}
        className="flex-1 text-left px-3 py-2 min-w-0 cursor-pointer"
      >
        <div
          className="text-sm truncate"
          style={{
            color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
            fontWeight: isActive ? 500 : 400,
          }}
        >
          {conv.title}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
          {formatRelativeTime(conv.updatedAt)}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          togglePinConversation(conv.id);
        }}
        className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        style={{ color: conv.pinned ? 'var(--color-accent)' : 'var(--color-text-tertiary)', opacity: conv.pinned ? 1 : undefined }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = conv.pinned ? 'var(--color-accent)' : 'var(--color-text-tertiary)')}
        title={conv.pinned ? 'Unpin' : 'Pin'}
      >
        {conv.pinned ? <PinOff size={13} /> : <Pin size={13} />}
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          deleteConversation(conv.id);
        }}
        disabled={isStreaming}
        className="p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
        style={{ color: 'var(--color-text-tertiary)' }}
        onMouseEnter={(e) => {
          if (!isStreaming) e.currentTarget.style.color = 'var(--color-error)';
        }}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        title={isStreaming ? 'Stop generating before deleting this conversation' : 'Delete conversation'}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/**
 * Conversation history, split like most chat apps: a "Pinned" group for
 * conversations the user pinned, and "Recents" listing every conversation
 * (pinned ones included) sorted by last activity.
 */
export function ConversationList({ searchQuery }: Props) {
  const conversations = useAppStore((s) => s.conversations);

  const filtered = searchQuery
    ? conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : conversations;
  const pinned = filtered.filter((c) => c.pinned);

  if (filtered.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        {searchQuery ? 'No matching chats' : 'No conversations yet'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      {pinned.length > 0 && (
        <div>
          <p className="px-3 pb-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
            Pinned
          </p>
          <div className="flex flex-col gap-0.5">
            {pinned.map((conv) => (
              <ConversationRow key={conv.id} conv={conv} />
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="px-3 pb-1 text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          Recents
        </p>
        <div className="flex flex-col gap-0.5">
          {filtered.map((conv) => (
            <ConversationRow key={conv.id} conv={conv} />
          ))}
        </div>
      </div>
    </div>
  );
}
