'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { memberLabel, type Membership } from '@/lib/schedule-core/types';
import { WorkspaceSearch, type Ws } from '@/components/workspace-search';

interface Props {
  me: Membership;
  /** 이미 속한 워크스페이스 — 목록에서 뺀다 */
  joinedSlugs: string[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

/**
 * 다른 워크스페이스에 참여 요청하기.
 *
 * 로그인 전에도 /request 로 같은 일을 할 수 있지만, 이미 들어와 있는 사람이
 * 그 화면을 쓰려면 로그아웃했다 돌아와야 한다. 이름·이메일도 이미 아는 값이라
 * 다시 받을 이유가 없다 — 고를 것만 남긴다.
 */
export function JoinWorkspace({ me, joinedSlugs, onClose, onToast }: Props) {
  const [list, setList] = useState<Ws[] | null>(null);
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Ws | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    createClient()
      .rpc('list_open_workspaces')
      .then(({ data }: { data: Ws[] | null }) => {
        if (alive) setList(data ?? []);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function send() {
    if (!picked) return;
    setSending(true);
    const { error } = await createClient().rpc('request_access', {
      req_email: me.email ?? '',
      req_name: me.display_name ?? memberLabel(me),
      req_note: note.trim() || null,
      ws_slug: picked.slug,
    });
    setSending(false);
    if (error) return onToast(error.message);
    setSent(picked.name);
  }

  return (
    <div className="quick" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="wsnew">
        <div className="qf__head">
          <h2 className="qf__title">다른 워크스페이스 참여</h2>
          <button type="button" className="btn btn--ghost" aria-label="닫기" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="wsnew__body">
          {sent ? (
            <>
              <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.7 }}>
                <b>{sent}</b> 에 참여를 요청했습니다.
                <br />
                <span style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                  관리자가 승인하면 위쪽 워크스페이스 목록에 나타납니다.
                </span>
              </p>
              <button className="btn" style={{ width: '100%' }} onClick={onClose}>
                닫기
              </button>
            </>
          ) : (
            <>
              <WorkspaceSearch
                list={list}
                exclude={joinedSlugs}
                picked={picked}
                onPick={setPicked}
                autoFocus
              />

              {picked && (
                <textarea
                  className="textarea"
                  rows={2}
                  maxLength={500}
                  placeholder="관리자에게 남길 말 (선택) — 소속이나 용건"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}

              <p className="set__note" style={{ margin: 0 }}>
                {me.email} 로 요청합니다. 승인되면 이 계정으로 바로 들어갈 수 있습니다.
              </p>

              <button
                className="btn btn--primary"
                disabled={!picked || sending}
                onClick={send}
                style={{ width: '100%' }}
              >
                {sending ? '보내는 중…' : picked ? `${picked.name} 에 참여 요청` : '워크스페이스를 고르세요'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
