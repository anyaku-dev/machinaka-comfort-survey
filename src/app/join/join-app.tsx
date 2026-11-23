"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  answerableQuestions,
  buildPayload,
  draftFromPayload,
  emptyDraft,
  newObservation,
  store,
  storageKey,
  visibleAttributes,
  type LocalAnswer,
  type LocalDraft,
  type LocalSession,
  type Outbox,
  type ParticipantQuestion,
} from "@/lib/offline/local-store";
import { observationProblems } from "@/lib/validation/schemas";
import { LoadingIndicator } from "@/components/loading-indicator";
import { QuestionInput } from "./inputs";
import { ObservationEditor, summarize } from "./observation-editor";

interface RoundInfo {
  id: string;
  roundNumber: number;
  title: string;
  surveyName: string;
  purpose: string;
  organizerName: string;
  siteName: string;
  siteAddress: string;
  scopeText: string;
  frontageScopeText: string;
  peripheralScopeText: string;
  surveyDate: string | null;
  startTime: string | null;
  endTime: string | null;
  isNight: boolean;
  eventName: string;
  stayMeasureMinutes: number | null;
  passMeasureMinutes: number | null;
}
interface OpenData {
  round: RoundInfo;
  questions: ParticipantQuestion[];
  link: { expiresAt: string };
}
interface StateData {
  status: "draft" | "submitted" | "returned" | "accepted" | "excluded";
  revision: number;
  draftPayload: unknown;
  submittedAt: string | null;
  reviewNote: string;
  lastIdempotencyKey: string | null;
}

class NetworkError extends Error {}
class ServerError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal, cache: "no-store" });
  } catch {
    throw new NetworkError("通信できませんでした。電波の良い場所で再度お試しください。");
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: { error?: { code: string; message: string } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new NetworkError("サーバーの応答を読み取れませんでした。再度お試しください。");
  }
  if (!res.ok) throw new ServerError(res.status, data?.error?.code ?? "error", data?.error?.message ?? `エラー（${res.status}）`);
  return data as T;
}

const SECTIONS: { key: string; label: string; sections: string[] }[] = [
  { key: "basic", label: "基礎情報", sections: ["basic"] },
  { key: "space_a", label: "空間A（沿道建物・土地）", sections: ["space_a"] },
  { key: "space_b", label: "空間B（機能・設え）", sections: ["space_b"] },
  { key: "observation", label: "滞在者・通行者", sections: ["observation"] },
  { key: "anshin", label: "安心感", sections: ["anshin"] },
  { key: "kanyo", label: "寛容性", sections: ["kanyo", "kanyo_type"] },
  { key: "yasuragi", label: "安らぎ感", sections: ["yasuragi"] },
  { key: "kitai", label: "期待感", sections: ["kitai"] },
];

const SPACE_A_GROUPS = ["建物/利用/飲食店", "建物/利用/販売店", "建物/利用/その他", "建物/未利用", "土地/滞留空間として活用", "土地/滞留空間として未活用"];

type View =
  | { name: "loading" }
  | { name: "fatal"; code: string; message: string }
  | { name: "register" }
  | { name: "home" }
  | { name: "section"; key: string }
  | { name: "observations" }
  | { name: "observation"; index: number }
  | { name: "confirm" }
  | { name: "done"; submittedAt: string | null; duplicate: boolean; status: string };

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export default function JoinApp() {
  const [token] = useState<string | null>(() => {
    const t = window.location.hash.replace(/^#/, "");
    return TOKEN_RE.test(t) ? t : null;
  });
  const [skey, setSkey] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenData | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [draft, setDraft] = useState<LocalDraft>(emptyDraft());
  const [outbox, setOutbox] = useState<Outbox | null>(null);
  const [view, setView] = useState<View>(() =>
    token ? { name: "loading" } : { name: "fatal", code: "invalid_link", message: "参加リンクが正しくありません。主催者から配布されたQRコードを読み取ってください。" },
  );
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [recovered, setRecovered] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error" | "warn"; text: string } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverSavedAt, setServerSavedAt] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [reg, setReg] = useState({ displayName: "", affiliation: "", ageBand: "", gender: "" });
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = () => setRecovered(true);
    const off = () => setRecovered(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const loadState = useCallback(async (t: string, k: string, s: LocalSession, ob: Outbox | null) => {
    const st = await post<StateData>("/api/participant/state", { token: t, surveyorId: s.surveyorId, surveyorKey: s.surveyorKey });
    if (ob && st.lastIdempotencyKey === ob.idempotencyKey) {
      store.setOutbox(k, null);
      setOutbox(null);
      ob = null;
    }
    if (["submitted", "accepted", "excluded"].includes(st.status) && !ob) {
      store.setDraft(k, null);
      setView({ name: "done", submittedAt: st.submittedAt, duplicate: false, status: st.status });
      return;
    }
    if (st.status === "returned") {
      setReviewNote(st.reviewNote);
      const local = store.draft(k);
      if (!local || Object.keys(local.answers).length + local.observations.length === 0) {
        const restored = draftFromPayload(st.draftPayload);
        if (restored) {
          store.setDraft(k, restored);
          setDraft(restored);
        }
      }
    } else if (!store.draft(k) && st.draftPayload) {
      const restored = draftFromPayload(st.draftPayload);
      if (restored) {
        store.setDraft(k, restored);
        setDraft(restored);
      }
    }
    setView({ name: "home" });
  }, []);

  useEffect(() => {
    if (!token) return;
    const t = token;
    (async () => {
      const k = await storageKey(t);
      setSkey(k);
      const s = store.session(k);
      const d = store.draft(k);
      const ob = store.outbox(k);
      setSession(s);
      if (d) setDraft(d);
      setOutbox(ob);
      try {
        const data = await post<OpenData>("/api/participant/open", { token: t });
        store.setCache(k, data);
        setOpen(data);
        if (!s) {
          setView({ name: "register" });
          return;
        }
        await loadState(t, k, s, ob);
      } catch (e) {
        if (e instanceof NetworkError) {
          const cached = store.cache<OpenData>(k);
          if (cached && s) {
            setOpen(cached);
            setNotice({ kind: "warn", text: "オフラインです。端末に保存した内容で入力を続けられます。提出は通信が回復してから行ってください。" });
            setView({ name: "home" });
            return;
          }
        }
        if (e instanceof ServerError && e.code === "invalid_surveyor") {
          store.setSession(k, null);
          setSession(null);
          setView({ name: "register" });
          return;
        }
        setView({ name: "fatal", code: e instanceof ServerError ? e.code : "network", message: (e as Error).message });
      }
    })();
  }, [loadState, token]);

  const updateDraft = useCallback(
    (fn: (d: LocalDraft) => LocalDraft) => {
      setDraft((prev) => {
        const next = { ...fn(prev), updatedAt: new Date().toISOString() };
        if (skey) setStorageOk(store.setDraft(skey, next));
        return next;
      });
    },
    [skey],
  );

  // サーバーへの途中保存（ベストエフォート。失敗しても端末には保存済み）
  useEffect(() => {
    if (!token || !session || !online || view.name === "done" || view.name === "fatal" || draft.updatedAt === new Date(0).toISOString()) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      try {
        const r = await post<{ draftSavedAt: string }>("/api/participant/draft", { token, surveyorId: session.surveyorId, surveyorKey: session.surveyorKey, draft });
        setServerSavedAt(r.draftSavedAt);
      } catch {
        /* 端末保存で継続 */
      }
    }, 4000);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [draft, token, session, online, view.name]);

  const questions = useMemo(() => open?.questions ?? [], [open]);
  const attrs = useMemo(() => visibleAttributes(questions), [questions]);
  const answerable = useMemo(() => answerableQuestions(questions), [questions]);
  const hasObservation = questions.some((q) => q.code === "OBS-PRESENCE");

  const progress = (keys: string[]) => {
    const qs = answerable.filter((q) => keys.includes(q.section));
    const done = qs.filter((q) => draft.answers[q.id]).length;
    return { done, total: qs.length };
  };

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !skey) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await post<{ surveyorId: string; surveyorKey: string }>("/api/participant/register", { token, ...reg });
      const s = { surveyorId: r.surveyorId, surveyorKey: r.surveyorKey, displayName: reg.displayName };
      store.setSession(skey, s);
      setSession(s);
      setView({ name: "home" });
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function send(ob: Outbox) {
    if (!token || !skey || !session) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await post<{ duplicate: boolean; submittedAt: string; status: string }>("/api/participant/submit", {
        token,
        surveyorId: session.surveyorId,
        surveyorKey: session.surveyorKey,
        idempotencyKey: ob.idempotencyKey,
        payload: ob.payload,
      });
      store.setOutbox(skey, null);
      store.setDraft(skey, null);
      setOutbox(null);
      setRecovered(false);
      setView({ name: "done", submittedAt: r.submittedAt, duplicate: r.duplicate, status: r.status });
    } catch (err) {
      const updated = { ...ob, attempts: ob.attempts + 1, lastError: (err as Error).message };
      if (err instanceof ServerError && err.status === 422) {
        // 内容の問題は再送しても通らないため outbox を破棄し、修正してもらう
        store.setOutbox(skey, null);
        setOutbox(null);
        setNotice({ kind: "error", text: `提出できませんでした：${err.message}` });
      } else if (err instanceof ServerError && err.code === "already_submitted") {
        store.setOutbox(skey, null);
        setOutbox(null);
        await loadState(token, skey, session, null).catch(() => undefined);
      } else {
        store.setOutbox(skey, updated);
        setOutbox(updated);
        setNotice({
          kind: err instanceof NetworkError ? "warn" : "error",
          text:
            err instanceof NetworkError
              ? "未送信です。回答は端末に保存されています。通信が回復したら「再送する」を押してください。"
              : `提出できませんでした：${(err as Error).message}`,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (!skey) return;
    const payload = buildPayload(questions, draft, attrs);
    const toSend: Outbox = outbox ?? { idempotencyKey: crypto.randomUUID(), payload, createdAt: new Date().toISOString(), lastError: null, attempts: 0 };
    store.setOutbox(skey, toSend);
    setOutbox(toSend);
    void send(toSend);
  }

  const netbar = (
    <div className={`netbar ${online ? "online" : "offline"}`} role="status" data-testid="netbar">
      {online ? (recovered && outbox ? "通信が回復しました。「再送する」を押して提出を完了してください。" : "オンライン") : "オフライン：入力は端末に保存されます"}
      {storageOk ? "" : "（端末への保存に失敗しています）"}
    </div>
  );

  const outboxBanner = outbox && view.name !== "done" && (
    <div className="alert alert-warn" data-testid="outbox-banner">
      <strong>未送信の提出があります</strong>（{new Date(outbox.createdAt).toLocaleTimeString("ja-JP")} 作成・送信試行 {outbox.attempts} 回）
      {outbox.lastError && <div className="small">{outbox.lastError}</div>}
      <div className="small">この端末に保存されています。同じ内容を再送しても二重に登録されません。</div>
      <button className="btn-primary btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => send(outbox)} data-testid="resend">
        {busy ? "送信中…" : "再送する"}
      </button>
    </div>
  );

  if (view.name === "loading") return <main className="mobile"><LoadingIndicator label="調査を読み込んでいます…" /></main>;

  if (view.name === "fatal") {
    return (
      <main className="mobile">
        {netbar}
        <h1>参加できません</h1>
        <div className="alert alert-error" data-testid="fatal">
          {view.message}
        </div>
        {outboxBanner}
        {view.code === "network" && (
          <button className="btn-block" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        )}
      </main>
    );
  }

  const r = open?.round;
  const header = r && (
    <div className="card small participant-header">
      <span className="eyebrow">現地調査</span>
      <strong>{r.surveyName}</strong> {r.title}
      <div className="muted">
        {r.siteName} ／ {r.surveyDate} {r.startTime ?? ""}～{r.endTime ?? ""}
        {r.isNight && " ／ 夜間"}
      </div>
      {session && <div className="muted">調査者：{session.displayName}</div>}
    </div>
  );

  if (view.name === "register") {
    return (
      <main className="mobile">
        {netbar}
        <h1>調査に参加</h1>
        {header}
        {r?.purpose && <p className="small">{r.purpose}</p>}
        <form className="card" onSubmit={register}>
          <p className="small muted">調査者（あなた）の情報を入力してください。主催者だけが確認します。現地で観察する人の情報ではありません。</p>
          <div className="field">
            <label htmlFor="displayName">氏名 *</label>
            <input id="displayName" type="text" required maxLength={100} value={reg.displayName} onChange={(e) => setReg({ ...reg, displayName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="affiliation">所属</label>
            <input id="affiliation" type="text" maxLength={200} value={reg.affiliation} onChange={(e) => setReg({ ...reg, affiliation: e.target.value })} />
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="ageBand">年代</label>
              <select id="ageBand" value={reg.ageBand} onChange={(e) => setReg({ ...reg, ageBand: e.target.value })}>
                <option value="">選択しない</option>
                {[
                  ["10s", "10代"],
                  ["20s", "20代"],
                  ["30s", "30代"],
                  ["40s", "40代"],
                  ["50s", "50代"],
                  ["60s", "60代"],
                  ["70plus", "70代以上"],
                  ["no_answer", "回答しない"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field grow">
              <label htmlFor="gender">性別</label>
              <select id="gender" value={reg.gender} onChange={(e) => setReg({ ...reg, gender: e.target.value })}>
                <option value="">選択しない</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">その他</option>
                <option value="no_answer">回答しない</option>
              </select>
            </div>
          </div>
          {notice && <div className={`alert alert-${notice.kind === "ok" ? "ok" : notice.kind === "warn" ? "warn" : "error"}`}>{notice.text}</div>}
          <button className="btn-primary btn-block" disabled={busy} type="submit">
            参加する
          </button>
        </form>
      </main>
    );
  }

  if (view.name === "done") {
    return (
      <main className="mobile">
        {netbar}
        <h1>提出が完了しました</h1>
        <div className="alert alert-ok" data-testid="done">
          回答を受け付けました{view.submittedAt ? `（${new Date(view.submittedAt).toLocaleString("ja-JP")}）` : ""}。ご協力ありがとうございました。
          {view.duplicate && <div className="small">※この提出は既に受け付け済みでした（二重登録はされていません）。</div>}
        </div>
        <p className="small muted">集計結果は主催者が確認します。この画面を閉じて構いません。</p>
      </main>
    );
  }

  const bottomBar = (children: React.ReactNode) => (
    <div className="sticky-bottom">
      <div className="inner">{children}</div>
    </div>
  );
  const savedLine = (
    <p className="small muted" data-testid="saved-line">
      端末に保存済み {draft.updatedAt !== new Date(0).toISOString() && new Date(draft.updatedAt).toLocaleTimeString("ja-JP")}
      {serverSavedAt && ` ／ サーバーに途中保存 ${new Date(serverSavedAt).toLocaleTimeString("ja-JP")}`}
    </p>
  );

  if (view.name === "home") {
    const overall = progress(SECTIONS.filter((s) => s.key !== "observation").flatMap((s) => s.sections));
    const progressPercent = overall.total > 0 ? Math.round((overall.done / overall.total) * 100) : 0;
    return (
      <main className="mobile">
        {netbar}
        {header}
        {outboxBanner}
        {notice && <div className={`alert alert-${notice.kind === "ok" ? "ok" : notice.kind === "warn" ? "warn" : "error"}`}>{notice.text}</div>}
        {reviewNote && (
          <div className="alert alert-warn" data-testid="returned">
            主催者から差し戻されました：{reviewNote}
            <div className="small">修正して再度提出してください。</div>
          </div>
        )}
        <div className="progress-block" aria-label={`回答の進捗 ${overall.done}/${overall.total} 問`}>
          <div className="row"><strong className="grow">回答の進捗</strong><strong>{overall.done}/{overall.total} 問</strong></div>
          <div className="progress-track" role="progressbar" aria-valuenow={overall.done} aria-valuemin={0} aria-valuemax={Math.max(overall.total, 1)} aria-label="回答済みの設問数">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <details className="card small">
          <summary>調査範囲・計測時間</summary>
          <p>
            <strong>計測対象範囲：</strong>
            {r?.scopeText || "（未設定）"}
          </p>
          <p>
            <strong>沿道建物・土地の範囲：</strong>
            {r?.frontageScopeText || "（未設定）"}
          </p>
          <p>
            <strong>周辺エリア：</strong>
            {r?.peripheralScopeText || "（未設定）"}
          </p>
          <p>
            滞在者 {r?.stayMeasureMinutes ?? "—"} 分計測／通行者 {r?.passMeasureMinutes ?? "—"} 分計測
          </p>
          {r?.eventName && <p>イベント：{r.eventName}</p>}
        </details>
        <h2 className="section-title">入力する項目</h2>
        <nav className="section-list" aria-label="入力する項目">
          {SECTIONS.map((s) => {
            if (s.key === "observation") {
              if (!hasObservation) return null;
              return (
                <a key={s.key} href="#" onClick={(e) => (e.preventDefault(), setView({ name: "observations" }))} data-testid={`section-${s.key}`}>
                  <span>{s.label}</span>
                  <span className="progress">{draft.observations.length} グループ</span>
                </a>
              );
            }
            const p = progress(s.sections);
            if (p.total === 0) return null;
            return (
              <a key={s.key} href="#" onClick={(e) => (e.preventDefault(), setView({ name: "section", key: s.key }), window.scrollTo(0, 0))} data-testid={`section-${s.key}`}>
                <span>{s.label}</span>
                <span className="progress">
                  {p.done}/{p.total}
                </span>
              </a>
            );
          })}
        </nav>
        {savedLine}
        {bottomBar(
          <button className="btn-primary btn-block" onClick={() => (setView({ name: "confirm" }), window.scrollTo(0, 0))} data-testid="to-confirm">
            入力内容を確認して提出
          </button>,
        )}
      </main>
    );
  }

  if (view.name === "section") {
    const sec = SECTIONS.find((s) => s.key === view.key)!;
    const qs = answerable.filter((q) => sec.sections.includes(q.section));
    const setAnswer = (id: string, a: LocalAnswer | undefined) =>
      updateDraft((d) => {
        const answers = { ...d.answers };
        if (a) answers[id] = a;
        else delete answers[id];
        return { ...d, answers };
      });
    const idx = SECTIONS.findIndex((s) => s.key === view.key);
    const nextSec = SECTIONS.slice(idx + 1).find((s) => (s.key === "observation" ? hasObservation : progress(s.sections).total > 0));
    const groupHeads = new Set<string>();
    {
      let last = "";
      for (const q of qs) {
        if (view.key === "space_a" && q.category && q.category !== last && SPACE_A_GROUPS.includes(q.category)) {
          groupHeads.add(q.id);
          last = q.category;
        }
      }
    }
    return (
      <main className="mobile">
        {netbar}
        <h1>{sec.label}</h1>
        {view.key === "space_a" && <p className="small muted">沿道建物の1階部分（1階から見える地下を含む）と土地を、項目ごとに件数で数えます。0件は「0件」を押してください（未入力とは区別されます）。</p>}
        {view.key === "space_b" && <p className="small muted">「（※）」の項目は周辺エリア（概ね300m）も含めて確認します。</p>}
        {["anshin", "kanyo", "yasuragi", "kitai"].includes(view.key) && (
          <p className="small muted">主観（あなたが感じたこと）と活動（実際にいる人の様子）は別々に回答します。活動：1 いない／2 一人いる／3 数人いる／4 たくさんいる</p>
        )}
        {qs.map((q) => {
          const groupHead = groupHeads.has(q.id) ? q.category : null;
          const pairHead = q.pairNo && q.kind === "subjective" ? `No.${q.pairNo}` : null;
          return (
            <div key={q.id}>
              {groupHead && <h3>{groupHead}</h3>}
              {pairHead && <h3 className="small">{pairHead}</h3>}
              {q.section === "kanyo_type" && q === qs.find((x) => x.section === "kanyo_type") && <h3>活動の種類（21以降）</h3>}
              <QuestionInput q={q} answer={draft.answers[q.id]} onChange={(a) => setAnswer(q.id, a)} isNight={Boolean(r?.isNight)} />
            </div>
          );
        })}
        {savedLine}
        {bottomBar(
          <>
            <button className="btn-block" onClick={() => (setView({ name: "home" }), window.scrollTo(0, 0))}>
              一覧へ
            </button>
            {nextSec && (
              <button
                className="btn-primary btn-block"
                onClick={() => (setView(nextSec.key === "observation" ? { name: "observations" } : { name: "section", key: nextSec.key }), window.scrollTo(0, 0))}
              >
                次へ：{nextSec.label}
              </button>
            )}
          </>,
        )}
      </main>
    );
  }

  if (view.name === "observations") {
    const stay = draft.observations.filter((o) => o.presence === "stay").reduce((a, o) => a + o.groupSize, 0);
    const pass = draft.observations.filter((o) => o.presence === "pass").reduce((a, o) => a + o.groupSize, 0);
    const add = (presence: "stay" | "pass") => {
      const o = newObservation(presence);
      updateDraft((d) => ({ ...d, observations: [...d.observations, o] }));
      setView({ name: "observation", index: draft.observations.length });
      window.scrollTo(0, 0);
    };
    return (
      <main className="mobile">
        {netbar}
        <h1>滞在者・通行者</h1>
        <p className="small muted">
          グループごとに記録します。滞在者＝その場で立ち止まり、何かしらの活動をした人／通行者＝滞在者以外の人。計測時間：滞在者 {r?.stayMeasureMinutes ?? "—"} 分・通行者{" "}
          {r?.passMeasureMinutes ?? "—"} 分
        </p>
        <div className="card row small">
          <span>滞在 {stay} 人</span>
          <span>通行 {pass} 人</span>
          <span>{draft.observations.length} グループ</span>
        </div>
        <div className="row">
          <button className="btn-primary grow" onClick={() => add("stay")} data-testid="add-stay">
            ＋ 滞在を記録
          </button>
          <button className="btn-primary grow" onClick={() => add("pass")} data-testid="add-pass">
            ＋ 通行を記録
          </button>
        </div>
        <div style={{ marginTop: 12 }}>
          {draft.observations.map((o, i) => {
            const probs = observationProblems(o as unknown as Record<string, unknown>, attrs);
            return (
              <div key={o.localId} className="obs-item">
                <a href="#" onClick={(e) => (e.preventDefault(), setView({ name: "observation", index: i }))}>
                  No.{i + 1} {summarize(o)}
                </a>
                {probs.length > 0 && <span className="badge badge-warn">要確認</span>}
                <button
                  className="btn-small"
                  aria-label={`No.${i + 1}を削除`}
                  onClick={() => {
                    if (confirm(`No.${i + 1} を削除しますか？`)) updateDraft((d) => ({ ...d, observations: d.observations.filter((x) => x.localId !== o.localId) }));
                  }}
                >
                  削除
                </button>
              </div>
            );
          })}
          {draft.observations.length === 0 && <p className="muted small">まだ記録がありません（0人の場合は記録なしのまま提出できます）。</p>}
        </div>
        {savedLine}
        {bottomBar(
          <button className="btn-block" onClick={() => setView({ name: "home" })}>
            一覧へ
          </button>,
        )}
      </main>
    );
  }

  if (view.name === "observation") {
    const o = draft.observations[view.index];
    if (!o) {
      return (
        <main className="mobile">
          <button className="btn-block" onClick={() => setView({ name: "observations" })}>
            記録一覧へ
          </button>
        </main>
      );
    }
    return (
      <main className="mobile">
        {netbar}
        <h1>No.{view.index + 1} の記録</h1>
        <ObservationEditor value={o} attrs={attrs} onChange={(n) => updateDraft((d) => ({ ...d, observations: d.observations.map((x, i) => (i === view.index ? n : x)) }))} />
        {savedLine}
        {bottomBar(
          <>
            <button className="btn-block" onClick={() => setView({ name: "observations" })} data-testid="obs-done">
              記録一覧へ
            </button>
            <button
              className="btn-primary btn-block"
              onClick={() => {
                const n = newObservation(o.presence);
                updateDraft((d) => ({ ...d, observations: [...d.observations, n] }));
                setView({ name: "observation", index: draft.observations.length });
                window.scrollTo(0, 0);
              }}
            >
              続けて記録
            </button>
          </>,
        )}
      </main>
    );
  }

  // confirm
  const payload = buildPayload(questions, draft, attrs);
  const unanswered = answerable.filter((q) => !draft.answers[q.id]);
  const naCount = answerable.filter((q) => draft.answers[q.id]?.state === "not_applicable").length;
  const obsProblems = draft.observations.flatMap((o, i) => observationProblems(o as unknown as Record<string, unknown>, attrs).map((p) => `No.${i + 1}: ${p}`));
  return (
    <main className="mobile">
      {netbar}
      <h1>入力確認</h1>
      {outboxBanner}
      {notice && <div className={`alert alert-${notice.kind === "ok" ? "ok" : notice.kind === "warn" ? "warn" : "error"}`} data-testid="notice">{notice.text}</div>}
      <div className="card small">
        <div>回答済み：{payload.answers.filter((a) => a.state === "answered").length} 問</div>
        <div>適用外：{naCount} 問</div>
        <div>未回答：{unanswered.length} 問</div>
        <div>滞在者・通行者：{draft.observations.length} グループ</div>
      </div>
      {unanswered.length > 0 && (
        <details className="card small" data-testid="unanswered">
          <summary>未回答の設問（{unanswered.length}）— 未回答のまま提出できます</summary>
          <ul>
            {unanswered.map((q) => (
              <li key={q.id}>
                <a href="#" onClick={(e) => (e.preventDefault(), setView({ name: "section", key: SECTIONS.find((s) => s.sections.includes(q.section))?.key ?? "basic" }))}>
                  {q.kind === "subjective" ? "【主観】" : q.kind === "activity" ? "【活動】" : ""}
                  {q.text}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      {obsProblems.length > 0 && (
        <div className="alert alert-error small" data-testid="confirm-obs-problems">
          滞在者・通行者の記録に不整合があります。修正してください。
          {obsProblems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}
      <p className="small muted">提出後は修正できません（主催者から差し戻された場合を除く）。</p>
      {bottomBar(
        <>
          <button className="btn-block" onClick={() => setView({ name: "home" })}>
            戻る
          </button>
          {!outbox && (
            <button className="btn-primary btn-block" disabled={busy || obsProblems.length > 0} onClick={submit} data-testid="submit">
              {busy ? "送信中…" : "提出する"}
            </button>
          )}
        </>,
      )}
    </main>
  );
}
