// Alterbrain report format for Typst: A4, 11 pt, numbered sections, summary box,
// source notes, brand colours. Written for Alterbrain (MIT); no third-party template is copied.
//
// Options (all optional, set in the document's front matter):
//   line-spacing: 1.15        line spacing as a Word-style multiple (1.0, 1.15, 1.5, 2.0)
//   paragraph-spacing: 0.9em  space between paragraphs
//   first-line-indent: 1.5em  indent the first line of each paragraph (off by default)
//   left-aligned: true        ragged right edge instead of justified text
//   margin: {x: 2.5cm, y: 2.5cm}, fontsize: 11pt, papersize: a4, section-numbering: "1.1"

// Colour shared with the summary box (set once, inside report()).
#let ab-accent = state("ab-accent", rgb("#1F3A5F"))

#let report(
  title: none,
  subtitle: none,
  short-title: none,
  authors: none,
  course: none,
  programme: none,
  date: none,
  abstract: none,
  abstract-title: none,
  keywords: (),
  lang: "en",
  region: "GB",
  font: ("Arial",),
  fontsize: 11pt,
  heading-family: none,
  codefont: none,
  sectionnumbering: none,
  line-spacing: 1.15,
  paragraph-spacing: 0.9em,
  first-line-indent: none,
  justify: true,
  toc: false,
  toc_title: none,
  toc_depth: 3,
  accent: rgb("#1F3A5F"),
  accent-soft: rgb("#EEF2F7"),
  doc,
) = {
  let grey = luma(95)

  // Document information (shows in the PDF properties).
  set document(title: if title != none { title } else { "Report" }, keywords: keywords)
  set document(
    author: authors.map(a => content-to-string(a.name)).join(", "),
  ) if authors != none and authors != ()
  ab-accent.update(accent)

  // Text. The two edge values make every line exactly 1em tall, so that
  // line-spacing behaves like Word: the gap between baselines is line-spacing x 1.22em.
  set text(
    font: font, size: fontsize, lang: lang, region: region, fallback: true,
    top-edge: 0.8em, bottom-edge: -0.2em,
  )
  set par(
    justify: justify,
    leading: line-spacing * 1.22em - 1em,
    spacing: paragraph-spacing,
    first-line-indent: if first-line-indent != none { (amount: first-line-indent, all: false) } else { 0pt },
  )
  show raw: set text(font: codefont) if codefont != none
  show link: set text(fill: accent)
  show ref: set text(fill: accent)

  // Headings: numbered, in the brand colour.
  set heading(numbering: sectionnumbering)
  show heading: set text(fill: accent)
  show heading: set text(font: heading-family) if heading-family != none
  show heading: set par(first-line-indent: 0pt, justify: false)
  show heading: set block(sticky: true)
  show heading.where(level: 1): set text(size: 1.3em, weight: "bold")
  show heading.where(level: 1): set block(above: 1.7em, below: 0.8em)
  show heading.where(level: 2): set text(size: 1.12em, weight: "bold")
  show heading.where(level: 2): set block(above: 1.4em, below: 0.6em)
  show heading.where(level: 3): set text(size: 1em, weight: "bold", style: "italic")
  show heading.where(level: 3): set block(above: 1.2em, below: 0.5em)

  // Figures, tables and their captions.
  show figure.caption: it => {
    set text(size: 0.9em, fill: grey)
    set par(justify: false)
    it
  }
  show figure.where(kind: table): set figure.caption(position: top)
  show figure.where(kind: "quarto-float-tbl"): set figure.caption(position: top)
  show figure: set block(above: 1.4em, below: 1em)
  show figure.where(kind: "quarto-float-tbl"): set align(left)
  show figure.where(kind: table): set align(left)
  set table(
    inset: (x: 6pt, y: 5pt),
    stroke: (x, y) => (bottom: 0.4pt + luma(200)),
    fill: (x, y) => if y == 0 { accent } else if calc.even(y) { accent-soft } else { none },
  )
  show table.cell.where(y: 0): set text(fill: white, weight: "bold")
  show table: set text(size: 0.92em)
  show table: set par(justify: false)

  // Page: footer with a short title on the left and the page number on the right.
  set page(footer: context {
    set text(size: 8.5pt, fill: grey, top-edge: "ascender", bottom-edge: "descender")
    let label = if short-title != none { short-title } else if title != none { title } else { none }
    grid(
      columns: (1fr, auto),
      if label != none { label },
      counter(page).display("1"),
    )
  })

  // Title block.
  if title != none {
    block(width: 100%, below: 1.6em)[
      #set par(first-line-indent: 0pt, justify: false, leading: 0.35em)
      #set text(font: heading-family) if heading-family != none
      #text(size: 1.9em, weight: "bold", fill: accent)[#title]
      #if subtitle != none [
        #v(0.25em)
        #text(size: 1.15em, fill: grey)[#subtitle]
      ]
      #v(0.7em)
      #let meta = ()
      #if authors != none and authors != () {
        meta.push(authors.map(a => a.name).join([, ]))
      }
      #if course != none { meta.push(course) }
      #if programme != none { meta.push(programme) }
      #if date != none { meta.push(date) }
      #text(size: 0.95em, fill: grey)[#meta.join([ #h(0.35em)|#h(0.35em) ])]
      #v(0.5em)
      #line(length: 100%, stroke: 1pt + accent)
    ]
  }

  if abstract != none {
    block(below: 1.2em)[
      #set par(first-line-indent: 0pt)
      #text(weight: "bold")[#abstract-title] #h(0.6em) #abstract
    ]
  }

  if toc {
    block(above: 0em, below: 1.6em)[
      #outline(title: toc_title, depth: toc_depth, indent: 1.5em)
    ]
  }

  doc
}

// Summary box: ::: {.box} ... :::   (optionally ::: {.box title="Summary"})
#let summary-box(title: none, body) = context {
  block(
    width: 100%, breakable: false, above: 1em, below: 1.2em,
    fill: luma(247), stroke: (left: 3pt + ab-accent.get()), inset: (x: 12pt, y: 10pt), radius: (right: 3pt),
  )[
    #set par(first-line-indent: 0pt, justify: false)
    #if title != none [#text(weight: "bold")[#title] #v(0.2em)]
    #body
  ]
}

// Source note under a figure or table: a paragraph written entirely in italics.
#let source-note(body) = {
  v(-0.55em)
  block(above: 0em, below: 1.1em)[
    #set text(size: 0.85em, fill: luma(95), style: "italic")
    #set par(first-line-indent: 0pt, justify: false)
    #body
  ]
}
