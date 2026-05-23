/**
 * Custom High-Fidelity Markdown Parser to safely translate markdown content
 * into standard HTML without requiring complex and heavy dependency libraries.
 */
export function renderMarkdown(markdown: string): string {
  if (!markdown) return "";
  
  let html = markdown;

  // Escape HTML characters first to avoid injection
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code Blocks ```language ... ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const languageLabel = lang ? `<span class="absolute top-2 right-3 text-xs text-gray-500 font-mono select-none uppercase">${lang}</span>` : '';
    return `<div class="relative group my-4">
      <pre class="bg-[#0f0f0f] border border-[#2c2c2c] rounded-lg p-4 pt-8 overflow-x-auto font-mono text-xs text-gray-200">
        ${languageLabel}
        <code>${code.trim()}</code>
      </pre>
    </div>`;
  });

  // Inline Code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-[#2a2a2a] text-[#ffb454] px-1.5 py-0.5 rounded font-mono text-xs">$1</code>');

  // Bold **text**
  html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Italic *text*
  html = html.replace(/\*([^\*]+)\*/g, '<em class="italic text-gray-300">$1</em>');

  // Headers (h3, h2, h1)
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-base font-semibold text-gray-200 mt-4 mb-2 border-b border-[#2c2c2c] pb-1">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-lg font-semibold text-white mt-5 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold text-white mt-6 mb-3">$1</h1>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote class="border-l-2 border-[#cc7d5c] pl-4 italic text-gray-400 my-2">$1</blockquote>');

  // Bullet Lists (* or -)
  // Let's split by newline to handle lists elegantly
  const lines = html.split("\n");
  let inList = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("* ") || line.startsWith("- ")) {
      const content = line.substring(2);
      if (!inList) {
        lines[i] = `<ul class="list-disc pl-5 my-2 space-y-1">\n  <li>${content}</li>`;
        inList = true;
      } else {
        lines[i] = `  <li>${content}</li>`;
      }
    } else {
      if (inList) {
        lines[i - 1] = lines[i - 1] + "\n</ul>";
        inList = false;
      }
    }
  }
  if (inList) {
    lines[lines.length - 1] = lines[lines.length - 1] + "\n</ul>";
  }
  html = lines.join("\n");

  // Numbered Lists (1. item)
  const lines2 = html.split("\n");
  let inNumList = false;
  
  for (let i = 0; i < lines2.length; i++) {
    const line = lines2[i].trim();
    if (/^\d+\.\s+(.*)/.test(line)) {
      const content = line.replace(/^\d+\.\s+/, "");
      if (!inNumList) {
        lines2[i] = `<ol class="list-decimal pl-5 my-2 space-y-1">\n  <li>${content}</li>`;
        inNumList = true;
      } else {
        lines2[i] = `  <li>${content}</li>`;
      }
    } else {
      if (inNumList) {
        lines2[i - 1] = lines2[i - 1] + "\n</ol>";
        inNumList = false;
      }
    }
  }
  if (inNumList) {
    lines2[lines2.length - 1] = lines2[lines2.length - 1] + "\n</ol>";
  }
  html = lines2.join("\n");


  // Line breaks to <br/> inside paragraphs
  html = html.replace(/\n\n/g, '</p><p class="mb-3">');

  return `<div class="markdown-body text-gray-200 text-sm md:text-base leading-relaxed space-y-2 select-text">${html}</div>`;
}

/**
 * Returns dynamic greeting based on system hour
 */
export function getGreeting(): { text: string; subtext: string } {
  const hour = new Date().getHours();
  let greetingText = "Morning, Tushar";
  if (hour >= 12 && hour < 17) {
    greetingText = "Afternoon, Tushar";
  } else if (hour >= 17 && hour < 22) {
    greetingText = "Evening, Tushar";
  } else if (hour >= 22 || hour < 5) {
    greetingText = "Night, Tushar";
  }

  return {
    text: greetingText,
    subtext: "How can I help you today?"
  };
}
