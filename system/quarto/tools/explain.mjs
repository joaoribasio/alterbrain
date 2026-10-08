// Turn Quarto and Typst messages into plain English. Zero dependencies.
//
//   explain(text) -> [{ level: 'error'|'warning', message, fix }]
//
// `message` says what happened. `fix` says what to do next, in one short sentence.

const RULES = [
  {
    re: /quarto: command not found|'quarto' is not recognized|Quarto is not installed/i,
    level: 'error',
    message: () => 'Quarto, the program that makes the PDF, is not installed on this computer.',
    fix: () => 'Install it from quarto.org (on Windows: winget install --id Posit.Quarto -e), then try again.',
  },
  {
    re: /unknown font family:\s*([^\r\n]+)/i,
    level: 'warning',
    message: (m) => `The font "${titleCase(m[1])}" is not installed, so a plain substitute font was used.`,
    fix: () =>
      'Install the font (download the .ttf or .otf file and double-click it), or drop the file into system/quarto/fonts/. ' +
      'Run node system/quarto/tools/fonts.mjs to see what is missing.',
  },
  {
    re: /file not found \(searched at ([^)\r\n]+)\)/i,
    level: 'error',
    message: (m) => `A file the document needs was not found: ${tidyPath(m[1])}.`,
    fix: () => 'Check the file name and that it sits in the same folder as the document (images, references.bib, data files).',
  },
  {
    re: /Could not find (?:file|resource)[:\s]+([^\r\n]+)/i,
    level: 'error',
    message: (m) => `A file the document needs was not found: ${tidyPath(m[1])}.`,
    fix: () => 'Check the file name and the folder it is in.',
  },
  {
    re: /label [`'"]?<([^>]+)>[`'"]? does not exist/i,
    level: 'error',
    message: (m) => `The text points to "${m[1]}", but no section, figure or table has that label.`,
    fix: () => 'Add the label to the heading, figure or table (for example {#fig-sales}), or fix the spelling in the reference.',
  },
  {
    re: /Unable to resolve crossref @([\w:.-]+)/i,
    level: 'warning',
    message: (m) => `The reference @${m[1]} points to nothing.`,
    fix: () => 'Check the label spelling. Figures start with fig-, tables with tbl-, sections with sec-.',
  },
  {
    re: /key [`'"]?([^`'"\s]+)[`'"]? does not exist in the bibliography|(?:citation|reference) [`'"@]?([\w:.-]+)[`'"]? (?:not found|not in)/i,
    level: 'error',
    message: (m) => `A source called "${m[1] || m[2]}" is cited, but it is not in the reference list file.`,
    fix: () => 'Add it to references.bib, or correct the key after the @ sign.',
  },
  {
    re: /unclosed (?:delimiter|label|string|math|raw)|unexpected end of (?:file|block|content)/i,
    level: 'error',
    message: () => 'A bracket, quote or backtick was opened and never closed.',
    fix: () => 'Look near the line shown above. Close the bracket or quote, or put a backslash before it if it is just text.',
  },
  {
    re: /unknown variable:\s*([\w-]+)/i,
    level: 'error',
    message: (m) => `The text contains "#${m[1]}", which the layout engine reads as a command.`,
    fix: () => 'If it is ordinary text, put a backslash before the hash sign, like \\#.',
  },
  {
    re: /expected (expression|comma|semicolon|closing paren|closing bracket|identifier|equals sign)/i,
    level: 'error',
    message: () => 'The layout engine could not read part of the text.',
    fix: () => 'This is usually a stray $, #, @ or underscore. Put a backslash in front of it (for example \\$98m).',
  },
  {
    re: /EBUSY|EPERM|being used by another process|Permission denied|The process cannot access the file/i,
    level: 'error',
    message: () => 'The output file is open in another program, so it could not be replaced.',
    fix: () => 'Close the PDF in your viewer (and in any preview pane) and run it again.',
  },
  {
    re: /would escape the project root/i,
    level: 'error',
    message: () => 'A file the document uses (such as the citation style file) sits outside the document folder, so it could not be read.',
    fix: () => 'Copy the file into the same folder as the document and try again. If a template supplies it, tell Claude so the template tool can be fixed.',
  },
  {
    re: /_brand\.yml|field 'brand'/i,
    only: /error|invalid|cannot|could not|attempt to/i,
    not: /would escape the project root/i,
    level: 'error',
    message: () => 'The brand file (colours and fonts) could not be read.',
    fix: () => 'Open vault/80_me/brand/_brand.yml and check the indentation. Or delete it to use the default look.',
  },
  {
    re: /Error reading metadata file from ([^\r\n]+)/i,
    level: 'error',
    message: (m) => `The data file ${tidyPath(m[1])} could not be read.`,
    fix: () => 'Look for a missing quote, a tab instead of spaces, or an odd character such as a backslash in the line it points to.',
  },
  {
    re: /Validation of YAML front matter failed/i,
    level: 'error',
    message: () => 'One of the settings at the top of the document has the wrong kind of value.',
    fix: () => 'Look at the line named in the technical details. For example, section-numbering needs "1.1" or "" in quotes, not true or false.',
  },
  {
    re: /YAMLError|YAML parse exception|bad indentation|mapping values are not allowed/i,
    level: 'error',
    message: () => 'The settings block at the top of the document (between the --- lines) is not written correctly.',
    fix: () => 'Check that every line is indented with spaces (not tabs) and that text with a colon in it is in "quotes".',
  },
  {
    re: /no such file or directory[^\r\n]*\.typ|image .* not found|failed to load image|file not found.*\.(png|jpg|jpeg|svg|pdf)/i,
    level: 'error',
    message: () => 'A picture could not be loaded.',
    fix: () => 'Check the picture path in the document and that the file is a PNG, JPG, SVG or PDF.',
  },
  {
    re: /pdf-print|Edge or Chrome|no browser/i,
    level: 'warning',
    message: () => 'No Edge or Chrome browser was found, so the slides could not be saved as a PDF.',
    fix: () => 'Open the HTML file in a browser, add ?print-pdf to the address, then print and choose "Save as PDF".',
  },
];

function titleCase(s) {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function tidyPath(p) {
  return p.replace(/^\\\\\?\\/, '').trim();
}

/** Explain a block of Quarto/Typst output. Repeated problems are reported once. */
export function explain(text) {
  const seen = new Set();
  const out = [];
  const body = String(text || '');
  for (const rule of RULES) {
    if (rule.only && !rule.only.test(body)) continue;
    if (rule.not && rule.not.test(body)) continue;
    const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
    let m;
    while ((m = re.exec(body))) {
      const item = { level: rule.level, message: rule.message(m), fix: rule.fix(m) };
      const key = item.message;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // Anything left that Typst called an error: say so plainly, quoting its own words.
  if (!out.some((o) => o.level === 'error') && /\berror\b/i.test(body) && /ERROR|error:/.test(body)) {
    const line = body.split(/\r?\n/).find((l) => /error:/i.test(l)) || '';
    out.push({
      level: 'error',
      message: `The document could not be built. Quarto said: ${line.replace(/^.*error:\s*/i, '').trim() || 'an unknown error'}.`,
      fix: 'Look at the line number it shows, fix that spot, and run it again. Ask Claude if it is not clear.',
    });
  }
  return out;
}

/** Format explain() output as short plain lines for the terminal. */
export function formatExplanation(items) {
  return items.map((i) => `${i.level === 'error' ? 'Problem' : 'Note'}: ${i.message} ${i.fix}`).join('\n');
}
