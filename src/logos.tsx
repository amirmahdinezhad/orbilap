import { Avatar, AvatarFallback } from "./components/ui/avatar";
import appIcon from "./assets/app-icon.webp?no-inline";
import antigravity from "./assets/antigravity.svg?no-inline";
import claude from "./assets/claude.svg?no-inline";
import gemini from "./assets/gemini.svg?no-inline";
import openaiBlack from "./assets/openai-black.svg?no-inline";
import openaiWhite from "./assets/openai-white.svg?no-inline";
import opencodeDark from "./assets/opencode-dark.svg?no-inline";
import opencodeLight from "./assets/opencode-light.svg?no-inline";
import { hashHue } from "./format";

export function AppLogo() {
  return <img className="app-mark" src={appIcon} alt="" aria-hidden="true" draggable={false} />;
}

function ProviderMark({ dark, light, className = "" }: { dark: string; light?: string; className?: string }) {
  if (!light) return <img className="plogo" src={dark} alt="" aria-hidden="true" draggable={false} />;
  return <span className={`plogo provider-mark ${className}`.trimEnd()} aria-hidden="true">
    <img className="provider-mark-dark" src={dark} alt="" draggable={false} />
    <img className="provider-mark-light" src={light} alt="" draggable={false} />
  </span>;
}

/** Product marks come from the respective providers' published brand assets. */
export function ProviderLogo({ provider }: { provider: string }) {
  if (/antigravity/i.test(provider)) return <ProviderMark dark={antigravity} />;
  if (/opencode/i.test(provider)) return <ProviderMark dark={opencodeDark} light={opencodeLight} />;
  if (/anthropic|claude/i.test(provider)) return <ProviderMark dark={claude} />;
  if (/openai|codex/i.test(provider)) return <ProviderMark dark={openaiWhite} light={openaiBlack} className="provider-mark-blossom" />;
  if (/gemini|google/i.test(provider)) return <ProviderMark dark={gemini} />;
  return <Avatar className="plogo avatar" style={{ background: `hsl(${hashHue(provider)} 40% 42%)` }}>
    <AvatarFallback>{provider.charAt(0).toUpperCase()}</AvatarFallback>
  </Avatar>;
}
