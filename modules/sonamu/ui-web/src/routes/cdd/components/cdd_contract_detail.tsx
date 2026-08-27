import { useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import PencilIcon from "~icons/lucide/pencil";

import { defaultCatch } from "../../../services/sonamu.shared";
import { CddService } from "../service";
import { type CddTreeNode } from "../types";
import { CddFileIcon } from "./cdd_file_icon";

const markdownComponents: Components = {
  pre({ children }) {
    return <>{children}</>;
  },
  code({ className, children }) {
    const match = /language-(\w+)/.exec(className ?? "");
    const code = String(children).replace(/\n$/, "");
    const isBlock = code.includes("\n") || match;
    if (isBlock) {
      return (
        <SyntaxHighlighter
          style={oneLight}
          language={match?.[1] ?? "text"}
          customStyle={{
            margin: 0,
            borderRadius: "0.5rem",
            fontSize: "0.8125rem",
            border: "1px solid #e2e8f0",
          }}
        >
          {code}
        </SyntaxHighlighter>
      );
    }
    return (
      <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-900 text-[0.8125rem]">
        {children}
      </code>
    );
  },
};

export function CddContractDetail({
  node,
  onRefetch,
}: {
  node: CddTreeNode;
  onRefetch: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { data, isLoading, refetch: refetchContent } = CddService.useReadCddContent(node.path);

  const handleEdit = () => {
    setEditing(true);
    CddService.editCddContent(node.path)
      .then(() => {
        onRefetch();
        refetchContent();
      })
      .catch(defaultCatch)
      .finally(() => setEditing(false));
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  const content = data?.content ?? "";

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 shrink-0">
        <div className="max-w-4xl mx-auto h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white shrink-0">
              <CddFileIcon
                fileType={node.fileType}
                name={node.name}
                className="w-4 h-4 text-white"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-none truncate">{node.name}</div>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{node.path}</p>
            </div>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleEdit}
            disabled={editing}
          >
            <PencilIcon className="w-3 h-3" />
            {editing ? "Opening..." : "Edit"}
          </button>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="prose prose-slate max-w-none prose-headings:font-semibold prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-900 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-p:leading-relaxed prose-li:leading-relaxed">
            <Markdown components={markdownComponents}>{content}</Markdown>
          </div>
        </div>
      </div>
    </div>
  );
}
