"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.trim().split("\n");
  const tableLines = lines.filter(l => l.includes("|"));
  if (tableLines.length < 3) return null;
  const rows = tableLines
    .filter(l => !l.match(/^\|[\s-|]+\|$/))
    .map(l => l.split("|").map(c => c.trim()).filter(Boolean));
  return rows.length >= 2 ? rows : null;
}

const SUGGESTIONS: Record<string, string[]> = {
  admin: ["¿Cuánto vendimos este mes?", "Clientes con deuda vencida", "Resumen del día", "Guías pendientes"],
  secretaria: ["¿Cheques que vencen esta semana?", "Guías pendientes de despacho", "¿Cómo creo un reclamo?"],
  contabilidad: ["Deducciones de esta quincena", "¿Saldo del préstamo de...?", "Gastos de caja este mes"],
  vendedor: ["¿Cuánto debe City Mall?", "Último pedido de...", "Productos en oferta"],
  director: ["Ventas por empresa este mes", "CxC vencida total", "Reclamos abiertos"],
};

function extractAction(content: string): string | null {
  const match = content.match(/\[ACTION:([^\]]+)\]/);
  return match ? match[1] : null;
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [visible, setVisible] = useState(false);
  const [welcomeLoaded, setWelcomeLoaded] = useState(false);
  const [history, setHistory] = useState<{ messages: Message[]; date: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [role, setRole] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show for all roles except bodega and cliente
  useEffect(() => {
    const r = sessionStorage.getItem("cxc_role");
    if (r && r !== "bodega" && r !== "cliente") {
      setVisible(true);
      setRole(r);
    }
    // Load history from localStorage
    try {
      const saved = JSON.parse(localStorage.getItem("fg_chat_history") || "[]");
      setHistory(saved.slice(0, 5));
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // #1: Proactive welcome with real data
  const loadWelcome = useCallback(async () => {
    if (welcomeLoaded) return;
    setWelcomeLoaded(true);
    try {
      const res = await fetch("/api/home-stats");
      if (!res.ok) return;
      const stats = await res.json();
      const role = sessionStorage.getItem("cxc_role") || "";
      const name = sessionStorage.getItem("fg_user_name") || "";
      const h = new Date().getHours();
      const greeting = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";

      const lines: string[] = [];
      lines.push(`${greeting}${name ? `, ${name}` : ""}. Resumen de hoy:`);
      if (stats.vencenEstaSemana > 0) lines.push(`• ${stats.vencenEstaSemana} cheques vencen esta semana ($${Math.round(stats.chequesTotalPendiente / 1000)}K)`);
      if (stats.reclamosPendientes > 0) lines.push(`• ${stats.reclamosPendientes} reclamos abiertos${stats.reclamosViejos > 0 ? ` (${stats.reclamosViejos} con +45 días)` : ""}`);
      if (stats.cxcVencida > 0) lines.push(`• CxC vencida: $${Math.round(stats.cxcVencida / 1000)}K`);
      if (lines.length === 1) lines.push("• Todo al día, sin alertas pendientes");
      lines.push("\n¿En qué te puedo ayudar?");

      setMessages([{ role: "assistant", content: lines.join("\n") }]);
    } catch { /* */ }
  }, [welcomeLoaded]);

  useEffect(() => {
    if (open && !welcomeLoaded && messages.length === 0) loadWelcome();
  }, [open, welcomeLoaded, messages.length, loadWelcome]);

  // #3: Save to history on close
  function handleClose() {
    if (messages.length > 1) {
      const entry = { messages: messages.slice(0, 20), date: new Date().toISOString() };
      const updated = [entry, ...history].slice(0, 5);
      setHistory(updated);
      localStorage.setItem("fg_chat_history", JSON.stringify(updated));
    }
    setOpen(false);
    setExpanded(false);
    setMessages([]);
    setInput("");
    setWelcomeLoaded(false);
    setShowHistory(false);
  }

  function restoreHistory(idx: number) {
    setMessages(history[idx].messages);
    setShowHistory(false);
    setWelcomeLoaded(true);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    // Check if user is confirming a pending action
    const confirmWords = ["sí", "si", "confirmar", "dale", "ok", "confirmo", "hazlo", "yes"];
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === "assistant" && confirmWords.includes(text.toLowerCase())) {
      const pendingAction = extractAction(lastMsg.content);
      if (pendingAction) { setInput(""); executeAction(pendingAction); return; }
    }

    const userMsg: Message = { role: "user", content: text };
    const hist = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: hist }),
      });
      if (!res.ok) throw new Error();
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const data = line.replace("data: ", "");
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") last.content += parsed.text;
                return updated;
              });
            }
          } catch { /* */ }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant" && !last.content) last.content = "Error al conectar. Intenta de nuevo.";
        return updated;
      });
    } finally { setStreaming(false); }
  }

  // Execute confirmed action
  async function executeAction(actionStr: string) {
    setMessages(prev => [...prev, { role: "user", content: "Sí, confirmar" }]);
    setStreaming(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionStr }),
      });
      const data = await res.json();
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = data.actionResult || "Acción completada";
        return [...updated];
      });
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = "❌ Error al ejecutar la acción";
        return [...updated];
      });
    }
    setStreaming(false);
  }

  // #5: Export table to Excel
  async function exportTable(content: string) {
    const table = parseMarkdownTable(content);
    if (!table) return;
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const ws = XLSX.utils.aoa_to_sheet(table);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Datos");
      const blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `chat-export-${Date.now()}.xlsx`; a.click();
    } catch { /* */ }
  }

  if (!visible) return null;

  // #7: Panel sizing
  const panelClass = expanded
    ? "fixed inset-4 z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col"
    : "fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-40 w-full sm:w-[400px] h-[100dvh] sm:h-[600px] sm:max-h-[80vh] bg-white dark:bg-gray-900 sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col fade-in";

  return (
    <>
      {/* #7: Overlay for expanded mode */}
      {expanded && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setExpanded(false)} />}

      {/* Floating button */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 bg-black dark:bg-white text-white dark:text-black rounded-full shadow-lg hover:scale-105 transition flex items-center justify-center"
          title="Asistente IA">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className={panelClass}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="text-sm font-semibold dark:text-white">Asistente FG</span>
            </div>
            <div className="flex items-center gap-1">
              {/* #3: History button */}
              {history.length > 0 && (
                <button onClick={() => setShowHistory(!showHistory)} className="text-gray-400 hover:text-black dark:hover:text-white transition p-1.5" title="Historial">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
                </button>
              )}
              {/* #7: Expand button (desktop only) */}
              <button onClick={() => setExpanded(!expanded)} className="hidden sm:block text-gray-400 hover:text-black dark:hover:text-white transition p-1.5" title={expanded ? "Reducir" : "Expandir"}>
                {expanded ? <span className="text-sm">⤡</span> : <span className="text-sm">⤢</span>}
              </button>
              <button onClick={handleClose} className="text-gray-400 hover:text-black dark:hover:text-white transition p-1.5">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* #3: History dropdown */}
          {showHistory && (
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-2 space-y-1 max-h-40 overflow-y-auto flex-shrink-0">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Conversaciones recientes</p>
              {history.map((h, i) => {
                const preview = h.messages.find(m => m.role === "user")?.content || "...";
                return (
                  <button key={i} onClick={() => restoreHistory(i)}
                    className="w-full text-left text-xs text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition truncate py-1 border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <span className="text-gray-300 mr-1">{new Date(h.date).toLocaleDateString("es-PA")}</span>
                    {preview.slice(0, 60)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !welcomeLoaded && (
              <div className="text-center text-gray-400 text-sm mt-8">
                <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mx-auto mb-3" />
                <p>Cargando datos...</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <div className={`px-3 py-2 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-black text-white dark:bg-white dark:text-black whitespace-pre-wrap"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 chat-markdown"
                  }`}>
                    {msg.role === "assistant" ? (
                      <>
                        <ReactMarkdown
                          components={{
                            table: ({ children, ...props }) => <table className="w-full text-xs border-collapse my-2" {...props}>{children}</table>,
                            thead: ({ children, ...props }) => <thead className="bg-gray-200 dark:bg-gray-700" {...props}>{children}</thead>,
                            th: ({ children, ...props }) => <th className="text-left px-2 py-1 border border-gray-300 dark:border-gray-600 font-medium" {...props}>{children}</th>,
                            td: ({ children, ...props }) => <td className="px-2 py-1 border border-gray-300 dark:border-gray-600" {...props}>{children}</td>,
                            p: ({ children, ...props }) => <p className="mb-1 last:mb-0" {...props}>{children}</p>,
                            ul: ({ children, ...props }) => <ul className="list-disc pl-4 mb-1" {...props}>{children}</ul>,
                            ol: ({ children, ...props }) => <ol className="list-decimal pl-4 mb-1" {...props}>{children}</ol>,
                            li: ({ children, ...props }) => <li className="mb-0.5" {...props}>{children}</li>,
                            strong: ({ children, ...props }) => <strong className="font-semibold" {...props}>{children}</strong>,
                            h2: ({ children, ...props }) => <h2 className="font-semibold text-sm mt-2 mb-1" {...props}>{children}</h2>,
                            h3: ({ children, ...props }) => <h3 className="font-semibold text-sm mt-1.5 mb-0.5" {...props}>{children}</h3>,
                          }}
                        >
                          {msg.content.replace(/\[ACTION:[^\]]+\]/g, "").trim()}
                        </ReactMarkdown>
                        {!msg.content && streaming && (
                          <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5" />
                        )}
                      </>
                    ) : msg.content}
                  </div>
                  {/* Action buttons */}
                  {msg.role === "assistant" && !streaming && extractAction(msg.content) && i === messages.length - 1 && (
                    <div className="flex gap-2 mt-1.5 ml-1">
                      <button onClick={() => executeAction(extractAction(msg.content)!)} className="text-[11px] bg-emerald-600 text-white px-3 py-1 rounded-full hover:bg-emerald-700 transition">Confirmar ✓</button>
                      <button onClick={() => { setMessages(prev => [...prev, { role: "user", content: "No, cancelar" }]); }} className="text-[11px] text-gray-400 hover:text-gray-600 transition">Cancelar</button>
                    </div>
                  )}
                  {/* Export button for tables */}
                  {msg.role === "assistant" && msg.content && parseMarkdownTable(msg.content) && (
                    <button onClick={() => exportTable(msg.content)} className="text-[10px] text-gray-400 hover:text-black dark:hover:text-white mt-1 ml-1 transition">
                      Exportar a Excel ↓
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions — only before first user message */}
          {messages.length <= 1 && !streaming && SUGGESTIONS[role] && (
            <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              {SUGGESTIONS[role].map((s, i) => (
                <button key={i} onClick={() => { setInput(s); }} className="text-[11px] border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded-full hover:border-gray-400 transition truncate max-w-[180px]">{s}</button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex gap-2">
              <input ref={inputRef} type="text" value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Escribe tu pregunta..."
                disabled={streaming}
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-full px-4 py-2.5 text-sm bg-transparent dark:text-white focus:outline-none focus:border-black dark:focus:border-white disabled:opacity-50" />
              <button onClick={handleSend} disabled={streaming || !input.trim()}
                className="w-10 h-10 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-200 transition disabled:opacity-30">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
