import type { Workspace } from "../types";
import { AppLogo } from "../logos";
import { AddIcon, HeaderSettingsIcon, LogoutIcon, RefreshIcon } from "../icons";
import { Button } from "./ui/button";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useTimeDisplay } from "../displayPrefsContext";
import { formatDateTime } from "../timeDisplay";
import { UpdateDot } from "./ui/update-dot";

/** One fixed toolbar leaves the rest of the tray available for accounts. */
export function HomeHeader({ workspace, workspaces, workspaceBusy, addBusy, refreshing, updatedAt, updateUnread = false, onSelect, onRefresh, onQuit, onAdd, onSettings, onCreate, onRenameWorkspace, onDeleteWorkspace }: {
  workspace?: Workspace; workspaces: Workspace[]; workspaceBusy: boolean; refreshing: boolean; updatedAt: string | null;
  addBusy: boolean; onAdd: () => void; onSettings: () => void;
  updateUnread?: boolean;
  onDeleteWorkspace?: (id: string) => Promise<void>;
  onRenameWorkspace?: (name: string) => Promise<void>;
  onSelect: (id: string) => void; onRefresh: () => void; onQuit: () => void; onCreate: (origin?: HTMLElement) => void;
}) {
  const { timeFormat } = useTimeDisplay();
  return <header className="app-header home-header">
    <div className="home-topline"><div className="brand">{workspace ? <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} busy={workspaceBusy} onSelect={onSelect} onCreate={onCreate} onRename={onRenameWorkspace} onDelete={onDeleteWorkspace} status={null} /> : <><AppLogo /><div className="brand-text workspace-brand"><span className="brand-caption">Orbilap</span><span className="profile-picker-name">Account manager</span></div></>}</div>
    <div className="header-actions" role="group" aria-label="Account and app actions">
      {workspace ? <>
        <Button size="icon-sm" variant="ghost" className={`gear-btn home-refresh home-icon-button${refreshing ? " spinning" : ""}`} aria-label="Refresh data" title={refreshing ? "Refreshing accounts…" : updatedAt ? `Refresh · last checked ${formatDateTime(new Date(updatedAt), timeFormat)}` : "Refresh accounts"} aria-busy={refreshing} disabled={refreshing} onClick={onRefresh}><RefreshIcon size={18} /></Button>
        <Button size="icon-sm" variant="default" className="home-add-account" aria-label="Add account" title="Add account" disabled={addBusy} onClick={onAdd}><AddIcon size={22} /></Button>
      </> : <Button size="icon-sm" variant="destructive" className="home-quit home-icon-button" aria-label="Quit Orbilap" title="Quit Orbilap" onClick={onQuit}><LogoutIcon size={18} /></Button>}
      {workspace ? <Button size="icon-sm" variant="ghost" className="home-settings home-icon-button" aria-label={updateUnread ? "Settings · Update available" : "Settings"} title={updateUnread ? "Settings · Update available" : "Settings"} onClick={onSettings}><HeaderSettingsIcon size={18} />{updateUnread ? <UpdateDot /> : null}</Button> : null}
    </div></div>
    {workspace ? <><h1 className="sr-only">Accounts</h1><span className="sr-only" role="status">{refreshing ? "Refreshing accounts…" : updatedAt ? "Accounts refreshed" : ""}</span></> : null}
  </header>;
}
