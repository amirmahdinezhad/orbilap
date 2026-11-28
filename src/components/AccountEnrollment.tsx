import { Tooltip } from "./ui/tooltip";
import { ErrorToast } from "./Toast";
import { DisclosureSummary } from "./ui/disclosure-summary";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { beginAccountSetup, discardAccountSetup, loadSetupAccounts, startSetupLogin, pollSetupLogin, cancelSetupLogin, submitSetupCode, importSetupAccount, connectSetupConfig, commitAccountSetup, prettyError, type AccountProvider, type SetupAccount, type SetupLogin } from "../api";
import { BatchAuthImport } from "./BatchAuthImport";
import { AuthFileInput, type AuthFileSelection } from "./AuthFileInput";
import { ProviderLogo } from "../logos";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { AppModal, ModalPageHeader } from "./AppModal";
import { PlanBadge } from "./PlanBadge";
import { ActiveAccountBadge } from "./AccountIdentity";
import { AddIcon, BrowserIcon, CheckIcon, CopyIcon, DeviceIcon, ExternalLinkIcon, FileIcon, FolderIcon, InfoCircleIcon, KeyIcon, NextIcon, RefreshIcon, SpinnerIcon } from "../icons";

export const PROVIDER_LABELS: Record<AccountProvider, string> = { codex: "ChatGPT / Codex", claude: "Claude", antigravity: "Antigravity" };
type FileVerificationResult = { account: SetupAccount; error?: never; notice?: never } | { error: string; account?: never; notice?: never } | { notice: string; account?: never; error?: never };

export function accountSourceLabel({ provider, source }: SetupAccount): string | undefined {
  if (source === "saved") return "Saved in Orbilap";
  if (provider === "codex") return source === "desktop" ? "Codex app" : source === "cli" ? "Codex CLI" : undefined;
  return source === "desktop" ? "Desktop app" : source === "cli" ? "CLI" : undefined;
}

/** One native staging session is shared by discovery and all new-account methods. */
export function useAccountEnrollment(reconnectProfileId?: string) {
  const session = useRef<Promise<string> | null>(null);
  const mounted = useRef(false);
  const [accounts, setAccounts] = useState<SetupAccount[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const checking = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<SetupLogin | null>(null);
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const openingAttempt = useRef<string | null>(null);
  const automaticallyOpened = useRef<string | null>(null);
  const currentAttempt = useRef<string | null>(null);
  currentAttempt.current = login?.attemptId ?? null;
  const [error, setError] = useState<string | null>(null);
  const loadedIds = useRef<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const startingLogin = useRef(false);
  const onLoginAccount = useRef<((account: SetupAccount) => void) | undefined>(undefined);
  const getSession = useCallback(() => {
    if (!session.current) session.current = (reconnectProfileId ? beginAccountSetup(reconnectProfileId) : beginAccountSetup())
      .catch((error) => { session.current = null; throw error; });
    return session.current;
  }, [reconnectProfileId]);
  const openSignIn = useCallback(async () => {
    if (!login?.authUrl || login.status !== "pending" || openingAttempt.current) return;
    const attemptId = login.attemptId;
    openingAttempt.current = attemptId;
    setOpeningBrowser(true); setError(null);
    try {
      await openUrl(login.authUrl);
    } catch (error) {
      if (mounted.current && currentAttempt.current === attemptId) {
        setError(prettyError(error));
      }
    } finally {
      openingAttempt.current = null;
      if (mounted.current) setOpeningBrowser(false);
    }
  }, [login?.attemptId, login?.status, login?.authUrl]);
  useEffect(() => {
    if (!login || login.status !== "pending" || !login.authUrl || openingAttempt.current || automaticallyOpened.current === login.attemptId) return;
    automaticallyOpened.current = login.attemptId;
    void openSignIn();
  }, [login?.attemptId, login?.status, login?.authUrl, openingBrowser, openSignIn]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // StrictMode may immediately remount; an actual leave discards the native draft.
      queueMicrotask(() => { if (!mounted.current && session.current) void session.current.then(discardAccountSetup).catch(() => {}); });
    };
  }, []);
  const add = useCallback((account: SetupAccount) => {
    if (account.alreadyAdded && !reconnectProfileId) { setError("This account is already added to Orbilap."); return; }
    setAccounts((previous) => [...previous.filter((old) => old.id !== account.id), account]);
    setSelected((previous) => [...new Set([...previous, account.id])]);
    setManualIds((previous) => [...new Set([...previous, account.id])]);
    setEditing(false); setRevision((value) => value + 1);
  }, [reconnectProfileId]);
  useEffect(() => {
    if (!login || login.status !== "pending") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const fresh = await pollSetupLogin(await getSession(), login.attemptId);
        if (!active) return;
        setLogin(fresh);
        if (fresh.account) (onLoginAccount.current ?? add)(fresh.account);
        if (fresh.error) setError(fresh.error);
        if (fresh.status === "pending") timer = setTimeout(poll, 1000);
      } catch (error) { if (active) { setLogin(null); setError(prettyError(error)); } }
    };
    timer = setTimeout(poll, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [login?.attemptId, login?.status, getSession, add]);
  const load = async () => {
    if (checking.current || busy || login?.status === "pending") return;
    checking.current = true;
    setLoading(true); setError(null);
    try {
      const fresh = await loadSetupAccounts(await getSession());
      if (!mounted.current) return;
      const previousLoaded = loadedIds.current;
      const keep = (id: string) => !previousLoaded.includes(id) || manualIds.includes(id);
      setAccounts((previous) => [...previous.filter((old) => keep(old.id) && !fresh.some((item) => item.id === old.id)), ...fresh]);
      setSelected((previous) => previous.filter((id) => keep(id) || fresh.some((item) => item.id === id)));
      loadedIds.current = fresh.map((account) => account.id);
      setLoaded(true);
    } catch (error) { if (mounted.current) setError(prettyError(error)); }
    finally {
      checking.current = false;
      if (mounted.current) setLoading(false);
    }
  };
  const run = async (action: (session: string) => Promise<SetupAccount>) => {
    if (busy || login?.status === "pending") return;
    setBusy(true); setError(null);
    try { const account = await action(await getSession()); if (mounted.current) { setLogin(null); add(account); } }
    catch (error) { if (mounted.current) setError(prettyError(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const start = async (provider: AccountProvider, method: string, name: string, onAccount?: (account: SetupAccount) => void) => {
    if (startingLogin.current || busy || login?.status === "pending") return false;
    startingLogin.current = true;
    setBusy(true); setError(null);
    try {
      const login = await startSetupLogin(await getSession(), provider, method, name);
      if (!mounted.current) return false;
      onLoginAccount.current = onAccount;
      setLogin(login);
      return true;
    } catch (error) { if (mounted.current) setError(prettyError(error)); return false; }
    finally { startingLogin.current = false; if (mounted.current) setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await cancelSetupLogin(await getSession()); setLogin(null); setError(null); return true; }
    catch (error) { setError(prettyError(error)); return false; }
    finally { setBusy(false); }
  };
  const commit = async (name: string, accent: string, workspaceId?: string, accountIds = selected) => {
    setBusy(true); setError(null);
    try { return await commitAccountSetup(await getSession(), name, accent, accountIds, workspaceId ?? null); }
    catch (error) { setError(prettyError(error)); return null; }
    finally { if (mounted.current) setBusy(false); }
  };
  return { revision, accounts,
    addMany: (fresh: SetupAccount[]) => {
      const unique = [...new Map(fresh.map(account => [account.id, account])).values()];
      setAccounts(previous => [...previous.filter(old => !unique.some(account => account.id === old.id)), ...unique]);
      setSelected(previous => [...new Set([...previous, ...unique.map(account => account.id)])]);
      setManualIds(previous => [...new Set([...previous, ...unique.map(account => account.id)])]);
      setEditing(false); setRevision(value => value + 1);
    },
    verifyFiles: async (files: AuthFileSelection[], onResult?: (index: number, result: FileVerificationResult) => void) => {
      if (busy || login?.status === "pending") return [];
      setBusy(true); setError(null);
      const results: FileVerificationResult[] = [];
      const record = (result: FileVerificationResult) => {
        results.push(result);
        if (mounted.current) onResult?.(results.length - 1, result);
      };
      const seen = new Set<string>();
      try {
        const id = await getSession();
        for (const file of files) {
          if (!mounted.current) break;
          try {
            const account = await importSetupAccount(id, "codex", "", "credentials" in file ? { credentials: file.credentials } : { path: file.path });
            if (account.alreadyAdded) record({ notice: "This account is already added to Orbilap." });
            else if (seen.has(account.id)) record({ notice: "This account is already in the import list." });
            else { seen.add(account.id); record({ account }); }
          } catch (error) { record({ error: prettyError(error) }); }
        }
      } catch (error) { files.forEach(() => record({ error: prettyError(error) })); }
      finally { if (mounted.current) setBusy(false); }
      return results;
    }, clearVerified: () => { setAccounts([]); setSelected([]); setManualIds([]); setError(null); },
    manualAccounts: accounts.filter((account) => manualIds.includes(account.id)), selected, loaded, loading, busy, login, openingBrowser, openSignIn, error, editing, setEditing, setError, getSession, add, load, run, start, cancel, commit,
    stage: (account: SetupAccount) => {
      if (account.alreadyAdded) return;
      setAccounts((previous) => [...previous.filter((old) => old.id !== account.id), account]);
      setSelected((previous) => [...new Set([...previous, account.id])]);
    },
    pending: login?.status === "pending",
    toggle: (id: string) => setSelected((previous) => previous.includes(id) ? previous.filter((old) => old !== id) : [...previous, id]),
  };
}
export type Enrollment = ReturnType<typeof useAccountEnrollment>;

export function EnrollmentAccounts({ draft }: { draft: Enrollment }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const phase = draft.loading ? "loading" : draft.loaded ? "results" : "idle";
  const previousPhase = useRef(phase);
  useEffect(() => {
    if (phase !== previousPhase.current && phase === "results" && document.activeElement === document.body) heading.current?.focus();
    previousPhase.current = phase;
  }, [phase]);
  return <div className="setup-account-content">
    <div className="setup-selection-summary">
      <h3 ref={heading} tabIndex={-1}>Available accounts</h3>
      <div className="setup-selection-tools">
        <span className="setup-selected-count" aria-live="polite" aria-atomic="true">{draft.selected.length} selected</span>
        <Button size="icon-sm" variant="ghost" aria-label="Check accounts again" title="Check accounts again" aria-busy={draft.loading} disabled={draft.loading || draft.busy} onClick={() => void draft.load()}><RefreshIcon size={14} /></Button>
      </div>
    </div>
    <div role="status" aria-atomic="true">
      {draft.loading ? <div className="setup-account-placeholder setup-account-check">
        <div className="enrollment-waiting"><SpinnerIcon size={16} /><strong>Checking your accounts</strong></div>
        <p>Verifying identity and paid subscriptions…</p>
      </div> : null}
    </div>
    {!draft.loading && (draft.accounts.length ? <>
        <div className="setup-account-list" role="group" aria-label="Available accounts">{draft.accounts.map((account) => <label key={account.id} className={`checkbox-row setup-account-option${draft.selected.includes(account.id) ? " is-selected" : ""}`}>
          <Checkbox persistIndicator aria-label={`Add ${account.displayName ?? account.name} to workspace`} checked={draft.selected.includes(account.id)} disabled={draft.busy || draft.pending} onCheckedChange={() => draft.toggle(account.id)} />
          <ProviderLogo provider={account.provider} />
          <span className="setup-account-identity">
            <span className="setup-account-title">
              <strong className="checkbox-label" dir="auto">{account.displayName ?? account.name}</strong>
              <PlanBadge subscription={account.subscription} />
              {account.source ? <span className="setup-account-source plan-badge">{accountSourceLabel(account)}</span> : null}
              {account.active ? <ActiveAccountBadge /> : null}
            </span>
            <Tooltip content={account.email || PROVIDER_LABELS[account.provider]}><span className="setup-account-email">{account.email || PROVIDER_LABELS[account.provider]}</span></Tooltip>
          </span>
        </label>)}</div>
        <p className="setup-account-note">Only verified accounts with a paid subscription can be added.</p>
      </> : <div className="setup-account-placeholder"><span className="setup-account-empty-icon"><KeyIcon size={21} /></span><strong>{draft.loaded ? "No paid accounts found" : "Find your existing accounts"}</strong><p>{draft.loaded ? "Sign in with a paid subscription, reload, or add an account manually." : "Load accounts from this Mac and choose which to include."}</p></div>)}
  </div>;
}

const METHODS: Record<AccountProvider, { id: string; title: string; detail: string }[]> = {
  codex: [
    { id: "browser", title: "Sign in with ChatGPT", detail: "Continue securely in your browser." },
    { id: "device", title: "Use a device code", detail: "Sign in with a one-time code." },
    { id: "file", title: "Import auth.json", detail: "Use saved JSON login files." },
  ],
  claude: [
    { id: "browser", title: "Sign in with Claude Code", detail: "Continue securely in your browser." },
    { id: "config", title: "Connect a configuration", detail: "Use a signed-in Claude folder." },
  ],
  antigravity: [],
};
/** Provider → method → official sign-in or file; successful additions remain drafts. */
export function AccountEnrollment({ draft, onAdded, onImportConfirmed, initiallyOpen = false, embedded = false, onOpenChange, onLoadExisting, onProviderChange, providerContent, reviewWorkspace, reconnecting = false, emptyIllustration }: { draft: Enrollment; onAdded?: () => void; onImportConfirmed?: (accounts: SetupAccount[]) => Promise<void>; initiallyOpen?: boolean; embedded?: boolean; onOpenChange?: (open: boolean) => void; onLoadExisting?: () => void; onProviderChange?: (provider: AccountProvider | null) => void; providerContent?: ReactNode; reviewWorkspace?: string; reconnecting?: boolean; emptyIllustration?: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);
  const [provider, setProvider] = useState<AccountProvider | null>(reconnecting ? "codex" : null);
  const [method, setMethod] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [code, setCode] = useState("");
  const [file, setFile] = useState<AuthFileSelection | null>(null);
  const [reading, setReading] = useState(false);
  const [batchDirty, setBatchDirty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [deviceHelpOpen, setDeviceHelpOpen] = useState(false);
  const deviceHelpTrigger = useRef<HTMLButtonElement>(null);
  const deviceHelpDescription = useId();
  useEffect(() => {
    let active = true;
    // Let the dialog focus trap settle after the previous step is removed.
    queueMicrotask(() => { if (active && (open || embedded)) heading.current?.focus(); });
    return () => { active = false; };
  }, [open, embedded, provider, method]);
  useEffect(() => { setCopied(false); }, [draft.login?.userCode]);
  useEffect(() => { setLinkCopied(false); setDeviceHelpOpen(false); }, [draft.login?.attemptId]);
  // A finished or failed attempt must never leave an indefinite starting screen.
  useEffect(() => {
    if (provider === "codex" && method && method !== "file" && !draft.busy && !draft.pending && draft.error) setMethod(null);
  }, [provider, method, draft.busy, draft.pending, draft.error]);
  const locked = draft.busy || draft.pending || reading;
  useEffect(() => { draft.setEditing(!!(name || path || file || batchDirty || draft.pending)); }, [name, path, file, batchDirty, draft.pending, draft.setEditing]);
  const before = useRef(draft.revision);
  useEffect(() => {
    if (draft.revision > before.current) {
      before.current = draft.revision;
      setOpen(false); setName(""); setFile(null); setPath(""); setCode("");
      draft.setEditing(false);
      onAdded?.();
    }
  }, [draft.revision, draft.setEditing, onAdded]);
  const close = () => { setOpen(false); setName(""); setFile(null); setPath(""); setCode(""); draft.setEditing(false); draft.setError(null); };
  const chooseMethod = async (choice: string) => {
    if (!provider || locked) return;
    setMethod(choice); draft.setError(null);
    if (provider === "codex" && (choice === "browser" || choice === "device")) {
      if (!await draft.start(provider, choice, "")) setMethod(null);
    }
  };
  const signInContent = <div className="enrollment-login" role="status">
          <div className="enrollment-waiting" role="status"><SpinnerIcon size={16} /><strong>{draft.login?.userCode ? "Enter this code in your browser" : draft.login?.authUrl ? "Waiting for browser sign-in" : provider === "antigravity" ? "Checking Google account access…" : "Opening your browser…"}</strong></div>
          <p>{draft.login?.userCode ? "Paste this code on the sign-in page." : draft.login?.authUrl ? "We’ll verify your account automatically." : provider === "antigravity" ? "The first connection may take a few minutes." : "If your browser doesn’t open, cancel and try another option."}</p>
          {draft.login?.userCode ? <div className="enrollment-code"><code>{draft.login.userCode}</code><Button size="sm" onClick={() => void navigator.clipboard.writeText(draft.login!.userCode!).then(() => setCopied(true)).catch(() => draft.setError("Couldn’t copy the code. Select and copy it manually."))}><CopyIcon size={16} />{copied ? "Copied" : "Copy code"}</Button></div> : null}
          <div className="action-row enrollment-login-actions">
            <Button variant="secondary" disabled={draft.busy} aria-label="Cancel sign-in" onClick={() => {
              void draft.cancel().then((cancelled) => {
                if (!cancelled || method === "file") return;
                setMethod(null);
                if (provider === "antigravity") {
                  setProvider(null);
                  onProviderChange?.(null);
                }
              });
            }}>Cancel</Button>
            {draft.login?.authUrl ? (
              <Button variant="default" disabled={draft.openingBrowser} aria-label={draft.openingBrowser ? "Opening browser…" : "Open browser"} onClick={() => void draft.openSignIn()}>
                <ExternalLinkIcon size={16} />{draft.openingBrowser ? "Opening…" : "Open"}
              </Button>
            ) : null}
          </div>
          {provider === "codex" && (method === "browser" || method === "file") && draft.login?.authUrl ? <>
            <div className="enrollment-help">
              <div className="enrollment-help-label">
                <span>Device limit</span>
                <Button ref={deviceHelpTrigger} variant="ghost" size="icon-sm" aria-label="Device limit help"
                  aria-haspopup="dialog" aria-expanded={deviceHelpOpen} onClick={() => setDeviceHelpOpen(true)}>
                  <InfoCircleIcon size={16} />
                </Button>
              </div>
              <Button size="sm" variant="secondary" onClick={() => {
                void navigator.clipboard.writeText(draft.login!.authUrl!)
                  .then(() => setLinkCopied(true))
                  .catch(() => draft.setError("Couldn’t copy the sign-in link. Check clipboard access and try again."));
              }}>
                <CopyIcon size={16} />{linkCopied ? "Copied" : "Copy link"}
              </Button>
            </div>
            <AppModal open={deviceHelpOpen} onClose={() => setDeviceHelpOpen(false)} title="Device limit reached?"
              cardClass="enrollment-help-dialog" descriptionId={deviceHelpDescription} returnFocusRef={deviceHelpTrigger}>
              <p id={deviceHelpDescription}>
                Copy the sign-in link, open a Private or Incognito window in your browser, and paste the link there.
                Finish signing in, then return to Orbilap. We’ll verify your account automatically.
              </p>
            </AppModal>
          </> : null}
          {provider === "claude" ? <details><DisclosureSummary>Have an authorization code?</DisclosureSummary><label>Authorization code<input aria-label="Authorization code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></label><Button size="sm" disabled={!code.trim() || draft.busy} onClick={() => void draft.getSession().then((session) => submitSetupCode(session, code.trim())).then(() => setCode("")).catch((e) => draft.setError(prettyError(e)))}><NextIcon size={16} />Send code to Claude Code</Button></details> : null}
        </div>;
  const content = <div className={`account-enrollment setup-page${!provider ? " enrollment-provider-picker" : ""}`} key={`${provider ?? "providers"}:${method ?? "methods"}`}>

    {draft.error ? <ErrorToast message={draft.error} /> : null}
    <ModalPageHeader
      title={!provider ? "Add account" : draft.pending ? "Finish signing in" : method === "file" ? provider === "codex" && !reconnecting ? "Import login files" : "Import a saved login" : method === "config" ? "Connect a configuration" : reconnecting ? "Reconnect account" : PROVIDER_LABELS[provider]}
      provider={provider ?? undefined} symbol={!provider ? "add" : undefined}
      onBack={provider && (!reconnecting || method) ? () => { if (method && provider !== "antigravity") setMethod(null); else { setMethod(null); setProvider(null); onProviderChange?.(null); } draft.setError(null); } : undefined}
      backLabel={method && provider !== "antigravity" ? "Sign-in options" : "All providers"}
      backDisabled={locked}
    />
    {!provider ? <>

      {onLoadExisting ? <Button className="enrollment-discover" onClick={onLoadExisting}><RefreshIcon size={16} />Load existing accounts</Button> : null}
      <div className="enrollment-choices" role="group" aria-label="Choose provider">{(Object.keys(PROVIDER_LABELS) as AccountProvider[]).map((id) => <Button key={id} variant="ghost" className="enrollment-choice" aria-label={PROVIDER_LABELS[id]} disabled={locked} onClick={() => { setProvider(id); onProviderChange?.(id); if (id === "antigravity") { setMethod("browser"); void draft.start(id, "browser", ""); } }}>
      <span className="enrollment-choice-icon"><ProviderLogo provider={id} /></span><span><strong>{PROVIDER_LABELS[id]}</strong><span>{id === "codex" ? "ChatGPT accounts & login files" : id === "claude" ? "Claude Code accounts" : "Google accounts"}</span></span><NextIcon size={18} />
    </Button>)}</div></>
    : !method ? <>{providerContent}<div className="enrollment-choices" role="group" aria-label="Choose sign-in method">{METHODS[provider].map((choice) => <Button key={choice.id} variant="ghost" className={`enrollment-choice${choice.id === "browser" ? " enrollment-recommended" : ""}`} aria-label={choice.title} disabled={locked} onClick={() => void chooseMethod(choice.id)}><span className="enrollment-choice-icon">{choice.id === "browser" ? <BrowserIcon size={21} /> : choice.id === "device" ? <DeviceIcon size={21} /> : choice.id === "file" ? <FileIcon size={21} /> : <FolderIcon size={21} />}</span><span><strong>{choice.title}</strong><span>{choice.id === "browser" ? "Opens your browser" : choice.detail}</span></span><NextIcon size={18} /></Button>)}</div></>
    : <>
      <>
        {provider !== "codex" && provider !== "antigravity" ? <label className="enrollment-name">Account name<input aria-label="Account name" autoFocus value={name} maxLength={64} disabled={locked} placeholder="Personal" onChange={(e) => setName(e.target.value)} /></label> : null}
        {method === "file" && provider === "codex" && !reconnecting ? <BatchAuthImport signInContent={signInContent} onContinue={onImportConfirmed} draft={draft} onDirtyChange={setBatchDirty} onReadingChange={setReading} /> : method === "file" && provider === "codex" ? <>
          <AuthFileInput value={file} fileLabel="auth.json" disabled={locked} onReadingChange={setReading} onChange={setFile} />

          <Button className="enrollment-verify" variant={file ? "default" : "secondary"} disabled={locked || (provider !== "codex" && !name.trim()) || !file} onClick={() => { if (file) void draft.run((session) => importSetupAccount(session, "codex", "", "credentials" in file ? { credentials: file.credentials } : { path: file.path })); }}><CheckIcon size={16} />{draft.busy ? "Verifying…" : "Verify account"}</Button>
        </> : method === "config" ? <>
          <label>Configuration folder<input aria-label="Claude configuration folder" value={path} placeholder="~/.claude-work" disabled={locked} onChange={(e) => setPath(e.target.value)} /></label>
          <Button variant="default" disabled={locked || !name.trim() || !path.trim()} onClick={() => void draft.run((session) => connectSetupConfig(session, name.trim(), path.trim()))}><CheckIcon size={16} />{draft.busy ? "Verifying…" : "Verify account"}</Button>
        </> : draft.pending ? signInContent : provider === "antigravity" ? <Button disabled={locked} onClick={() => void draft.start("antigravity", "browser", "")}><RefreshIcon size={16} />{draft.busy ? "Checking Google account…" : "Retry connection"}</Button> : provider === "codex" ? <div className="enrollment-login" role="status"><strong>Starting sign-in…</strong></div> : <Button variant="default" disabled={locked || !name.trim()} onClick={() => void draft.start(provider, method, name.trim())}><BrowserIcon size={16} />{draft.busy ? "Starting…" : "Continue in browser"}</Button>}
      </>
    </>}
    </div>;
  const reviewing = embedded && !open;
  const reviewAccounts = reviewing ? draft.accounts : draft.manualAccounts;
  const openEnrollment = () => { setProvider(null); setMethod(null); setOpen(true); };
  return <div className={reviewing ? "enrollment-overview enrollment-review" : "enrollment-overview"}>
    {(!embedded || !open) ? <>
    {reviewing ? <header className="enrollment-destination">
      <span className="workspace-mark" aria-hidden="true">{reviewWorkspace?.trim().slice(0, 1).toLocaleUpperCase()}</span>
      <div className="enrollment-step-heading"><p>Add accounts to</p><h3 ref={heading} tabIndex={-1} dir="auto">{reviewWorkspace}</h3></div>
    </header> : <>
      {!reviewAccounts.length ? emptyIllustration : null}
      <Button size="sm" onClick={openEnrollment}><AddIcon size={16} />Add account</Button>
    </>}
    {reviewAccounts.length ? <div className="enrollment-added-list" role="group" aria-label={reviewing ? "Verified accounts" : "Added accounts"}>{reviewAccounts.map((account) => <label key={account.id} className={`checkbox-row setup-account-option${draft.selected.includes(account.id) ? " is-selected" : ""}`}>
      <Checkbox aria-label={`Include ${account.name}`} checked={draft.selected.includes(account.id)} disabled={draft.busy} persistIndicator onCheckedChange={() => draft.toggle(account.id)} />
      <ProviderLogo provider={account.provider} />
      <span className="setup-account-identity"><span className="setup-account-title"><strong className="checkbox-label" dir="auto">{account.name}</strong><PlanBadge subscription={account.subscription} />{account.active ? <ActiveAccountBadge /> : null}</span>{account.displayName && account.displayName !== account.name ? <span>{account.displayName}</span> : null}<Tooltip content={reviewing ? account.email : null}><span className="setup-account-email">{account.email || PROVIDER_LABELS[account.provider]}</span></Tooltip></span>
    </label>)}</div> : null}
    {reviewing ? <Button className="enrollment-add-more" variant="ghost" disabled={draft.busy} onClick={openEnrollment}><AddIcon size={18} />Connect another account</Button> : null}
    </> : null}
    {embedded ? open ? content : null : <AppModal open={open} onClose={close} title="Add account" cardClass="account-enrollment-card" busy={locked} hasUnsavedChanges={draft.editing}>{content}</AppModal>}
  </div>;
}
