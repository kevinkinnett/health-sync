import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownContent({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={`rich-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children: tableChildren }) => (
            <div className="rich-text-table" tabIndex={0}>
              <table>{tableChildren}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
