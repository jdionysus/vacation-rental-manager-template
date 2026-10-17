import { X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TermsPage {
  id: number;
  title: string;
  content: string | null;
}

interface Props {
  terms?: TermsPage;
  onClose: () => void;
  onAccept: () => void;
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul])/gm, "<p>")
    .replace(/(?<![>])$/gm, "</p>")
    .replace(/<p><\/p>/g, "");
}

export default function TermsModal({ terms, onClose, onAccept }: Props) {
  if (!terms) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="font-serif text-xl text-gray-900">{terms.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            className="prose-rental text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(terms.content ?? "") }}
          />
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button
            onClick={onAccept}
            className="flex-1 bg-[#FF385C] hover:bg-[#e0314f] text-white gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            I Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
