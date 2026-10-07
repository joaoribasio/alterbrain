// Alterbrain ATS-plain CV: one column, plain text, no icons, no colours, no tables.
// Applicant tracking systems (the software many employers use to read CVs) read this reliably.
// Pandoc escapes characters such as @ inside strings. Remove those backslashes.
#let unescape(s) = s.replace("\\", "")

#let cv-ats(
  title: none,
  author: (:),
  font: ("Arial",),
  lang: "en",
  doc,
) = {
  set document(title: if title != none { title } else { author.firstname + " " + author.lastname + " CV" },
               author: author.firstname + " " + author.lastname)
  set text(font: font, size: 10.5pt, lang: lang, fill: black, fallback: true)
  set par(justify: false, leading: 0.6em, spacing: 0.9em)
  set list(indent: 0.6em, body-indent: 0.5em, spacing: 0.5em)
  show link: set text(fill: black)

  show heading.where(level: 1): it => block(above: 1.3em, below: 0.7em, width: 100%)[
    #set text(size: 11.5pt, weight: "bold")
    #upper(it.body)
    #v(-0.55em)
    #line(length: 100%, stroke: 0.6pt + black)
  ]
  show heading.where(level: 2): it => block(above: 1em, below: 0.4em)[
    #set text(size: 10.5pt, weight: "bold")
    #it.body
  ]

  // Header: name, target role, address, then one line of contacts.
  block(below: 0.2em)[
    #text(size: 20pt, weight: "bold")[#author.firstname #author.lastname]
  ]
  if author.at("position", default: "").len() > 0 {
    block(below: 0.3em)[#text(size: 11pt)[#author.position]]
  }
  if author.at("address", default: "").len() > 0 {
    block(below: 0.3em)[#author.address]
  }
  let parts = author.at("contacts", default: ()).map(c =>
    if c.url.len() > 0 { link(unescape(c.url))[#unescape(c.text)] } else { unescape(c.text) })
  if parts.len() > 0 {
    block(below: 0.4em)[#parts.join([ | ])]
  }

  doc
}
