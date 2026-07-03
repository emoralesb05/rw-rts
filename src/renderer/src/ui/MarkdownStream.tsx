import { Streamdown, type Components } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import { cn } from "@/lib/cn";

const STREAMDOWN_PLUGINS = { code, mermaid, math, cjk };

const markdownComponents: Components = {
  p({ className, ...props }) {
    return (
      <p
        className={cn("my-1.5 break-words whitespace-pre-wrap", className)}
        {...props}
      />
    );
  },
  h1({ className, ...props }) {
    return (
      <h1
        className={cn(
          "text-accent-alt mt-2.5 mb-1 text-sm font-bold",
          className
        )}
        {...props}
      />
    );
  },
  h2({ className, ...props }) {
    return (
      <h2
        className={cn(
          "text-accent-alt mt-2.5 mb-1 text-[13px] font-bold",
          className
        )}
        {...props}
      />
    );
  },
  h3({ className, ...props }) {
    return (
      <h3
        className={cn(
          "text-accent mt-2.5 mb-1 text-[12.5px] font-bold tracking-[0.6px] uppercase",
          className
        )}
        {...props}
      />
    );
  },
  a({ className, ...props }) {
    return (
      <a
        className={cn(
          "text-accent hover:text-accent-alt break-all underline decoration-current underline-offset-2",
          className
        )}
        {...props}
      />
    );
  },
  inlineCode({ className, ...props }) {
    return (
      <code
        className={cn(
          "bg-accent/[0.12] text-accent rounded-sm px-1.5 py-px font-mono text-[11.5px]",
          className
        )}
        {...props}
      />
    );
  },
  pre({ className, ...props }) {
    return (
      <pre
        className={cn(
          "border-line my-1.5 max-h-[240px] overflow-x-auto overflow-y-auto rounded-md border bg-[#04060d] px-2.5 py-2 font-mono text-[11px] text-[#cfe1ff]",
          className
        )}
        {...props}
      />
    );
  },
  ul({ className, ...props }) {
    return <ul className={cn("my-1 list-disc pl-5", className)} {...props} />;
  },
  ol({ className, ...props }) {
    return (
      <ol className={cn("my-1 list-decimal pl-5", className)} {...props} />
    );
  },
  li({ className, ...props }) {
    return <li className={cn("my-0.5", className)} {...props} />;
  },
  blockquote({ className, ...props }) {
    return (
      <blockquote
        className={cn(
          "border-accent text-muted my-1.5 border-l-[3px] pl-2.5 italic",
          className
        )}
        {...props}
      />
    );
  },
  hr({ className, ...props }) {
    return (
      <hr
        className={cn("border-line my-2.5 border-0 border-t", className)}
        {...props}
      />
    );
  },
};

export default function MarkdownStream({ children }: { children: string }) {
  return (
    <Streamdown plugins={STREAMDOWN_PLUGINS} components={markdownComponents}>
      {children}
    </Streamdown>
  );
}
