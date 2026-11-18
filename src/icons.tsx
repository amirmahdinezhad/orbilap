import {
  Browser, File, Folder, Laptop, Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Calendar, ChartBar, Check, CheckCircle,
  ChevronDown, ChevronLeft, ChevronRight, Clock, Close, Copy, Download, Edit, Eye, InfoCircle, Lock,
  Layers, List, Logout, MoreHorizontal, Password, PieChart, Plus, Refresh, Search, Settings, Trash, Type, Undo, User,
} from "@neaticons/react";
import { Settings as SharpSettings } from "@neaticons/react/sharp-stroke";

interface IconProps {
  size?: number | string;
  className?: string;
}

function neat(Icon: typeof Plus) {
  return function NeatIcon({ size = 20, className }: IconProps) {
    return <Icon size={size} className={className ? `ak-icon ${className}` : "ak-icon"} aria-hidden="true" />;
  };
}

export const BrowserIcon = neat(Browser);
export const FileIcon = neat(File);
export const FolderIcon = neat(Folder);
export const DeviceIcon = neat(Laptop);
export const SortDirectionIcon = neat(ArrowDown);
export const SortDescendingIcon = neat(ArrowUp);
export const ClockIcon = neat(Clock);
export const AccountIcon = neat(User);
export const AlphabetIcon = neat(Type);
export const BankedResetsIcon = neat(Layers);
export const CapacityIcon = neat(PieChart);
export const CalendarIcon = neat(Calendar);
export const DownIcon = neat(ChevronDown);
export const CheckIcon = neat(Check);
export const BackIcon = neat(ArrowLeft);
export const ExternalLinkIcon = neat(ArrowUpRight);
export const RefreshIcon = neat(Refresh);
export const DownloadIcon = neat(Download);
export const SearchIcon = neat(Search);
export const ListIcon = neat(List);

export function SpinnerIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      className={`ak-icon ak-spin${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const SettingIcon = neat(Settings);
export const HeaderSettingsIcon = neat(SharpSettings);
export const PrevIcon = neat(ChevronLeft);
export const NextIcon = neat(ChevronRight);
export const TrashIcon = neat(Trash);
export const InfoCircleIcon = neat(InfoCircle);
export const ErrorIcon = neat(AlertCircle);
export const WarningIcon = neat(AlertTriangle);
export const UsageIcon = neat(Activity);
export const ChartIcon = neat(ChartBar);
export const LogoutIcon = neat(Logout);
export const CloseIcon = neat(Close);
export const AddIcon = neat(Plus);
export const SaveIcon = neat(CheckCircle);
export const CopyIcon = neat(Copy);
export const EyeIcon = neat(Eye);
export const EyeOffIcon = neat(Lock);
export const KeyIcon = neat(Password);
export const TickIcon = SaveIcon;
export const ResetIcon = neat(Undo);
export const MoreIcon = neat(MoreHorizontal);
export function AccountSwitchIcon({ size = 19 }: IconProps) {
  return <span className="account-switch-glyph" style={{ width: size, height: size }} aria-hidden="true">
    <ArrowRight size="74%" /><ArrowLeft size="74%" />
  </span>;
}
export const EditIcon = neat(Edit);
