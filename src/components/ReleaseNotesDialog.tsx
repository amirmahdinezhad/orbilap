import { useRef, useState } from "react";
import { ListIcon } from "../icons";
import { AppModal } from "./AppModal";
import { Button } from "./ui/button";

/** Render the plain-text, headings and bullet lists used in the release feed. */
function ReleaseNotes({ body, version }: { body: string; version: string }) {
  const blocks = body.trim().split(/\r?\n[ \t]*\r?\n/);
  return blocks.map((block, index) => {
    if (!block.trim() || (index === 0 && block === `# Orbilap ${version}`)) return null;
    const heading = block.match(/^#{1,6} ([^\r\n]+)$/);
    if (heading) return <h3 key={index}>{heading[1]}</h3>;
    const lines = block.split(/\r?\n/);
    if (lines.every(line => /^[-*] .+/.test(line))) {
      return <ul key={index}>{lines.map((line, item) => <li key={item}>{line.slice(2)}</li>)}</ul>;
    }
    return <p key={index}>{block}</p>;
  });
}

export function ReleaseNotesDialog({ body, version, disabled }: { body: string; version: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);

  return (
    <>
      <Button ref={trigger} variant="secondary" aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
        <ListIcon size={16} />What's new
      </Button>
      <AppModal
        title="What's new"
        cardClass="release-notes-dialog"
        open={open}
        onClose={() => setOpen(false)}
        initialFocusRef={content}
        returnFocusRef={trigger}
      >
        <div ref={content} className="release-notes-content" tabIndex={-1} role="region" aria-label="Release notes">
          <p className="release-notes-version">Version {version}</p>
          <ReleaseNotes body={body} version={version} />
        </div>
      </AppModal>
    </>
  );
}
