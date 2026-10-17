import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useCallback } from "react";
import {
  Bold, Italic, List, ListOrdered, Heading2, Heading3,
  Minus, Undo, Redo, Code
} from "lucide-react";

// Simple markdown → HTML converter (no external lib needed for basic markdown)
function mdToHtml(md: string): string {
  if (!md) return "";
  let html = md
    // Escape HTML entities first
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // HR
    .replace(/^---+$/gm, "<hr>")
    // Unordered lists (collect consecutive items)
    .replace(/^[-*•] (.+)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Paragraphs (double newline)
    .split(/\n\n+/)
    .map(block => {
      block = block.trim();
      if (!block) return "";
      if (block.startsWith("<h") || block.startsWith("<hr") || block.startsWith("<li")) {
        // Wrap consecutive <li> in <ul>
        if (block.includes("<li>")) return "<ul>" + block + "</ul>";
        return block;
      }
      // Single newlines become <br> within paragraphs
      return "<p>" + block.replace(/\n/g, "<br>") + "</p>";
    })
    .filter(Boolean)
    .join("\n");
  return html;
}

// Simple HTML → markdown converter
function htmlToMd(html: string): string {
  if (!html) return "";
  return html
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    // Bold/italic
    .replace(/<strong><em>(.*?)<\/em><\/strong>/gi, "***$1***")
    .replace(/<strong>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    // Code
    .replace(/<code>(.*?)<\/code>/gi, "`$1`")
    // Links
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    // Lists
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, inner) =>
      inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string, c: string) => `- ${c}\n`).trim()
    )
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner) => {
      let i = 1;
      return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_: string) => `${i++}. $1\n`).trim();
    })
    // Standalone li
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    // HR
    .replace(/<hr[^>]*>/gi, "\n---\n")
    // BR
    .replace(/<br[^>]*>/gi, "\n")
    // Paragraphs
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode entities
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    // Clean up extra newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function MarkdownEditor({ value, onChange, placeholder = "Start writing...", minHeight = "200px" }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: {},
        orderedList: {},
        code: {},
        horizontalRule: {},
      }),
    ],
    content: mdToHtml(value),
    onUpdate: ({ editor }) => {
      onChange(htmlToMd(editor.getHTML()));
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[inherit] px-3 py-2",
        style: `min-height: ${minHeight}`,
      },
    },
  });

  // Sync external value changes (e.g. when switching pages)
  useEffect(() => {
    if (!editor) return;
    const currentMd = htmlToMd(editor.getHTML());
    if (currentMd !== value) {
      editor.commands.setContent(mdToHtml(value));
    }
  }, [value]);

  const btn = useCallback((active: boolean) =>
    `p-1.5 rounded transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`,
    []
  );

  if (!editor) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-secondary/30 flex-wrap">
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={btn(editor.isActive("heading", { level: 2 }))} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={btn(editor.isActive("heading", { level: 3 }))} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
          className={btn(editor.isActive("bold"))} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
          className={btn(editor.isActive("italic"))} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleCode().run()}
          className={btn(editor.isActive("code"))} title="Inline code">
          <Code className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={btn(editor.isActive("bulletList"))} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={btn(editor.isActive("orderedList"))} title="Numbered list">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
          className={btn(false)} title="Divider">
          <Minus className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-0.5" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()}
          className={btn(false)} title="Undo" disabled={!editor.can().undo()}>
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()}
          className={btn(false)} title="Redo" disabled={!editor.can().redo()}>
          <Redo className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  );
}
