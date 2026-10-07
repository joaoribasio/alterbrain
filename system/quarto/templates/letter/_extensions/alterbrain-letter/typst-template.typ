// Alterbrain cover letter. A4, one column, a clear sender block, then the letter.
// Written for Alterbrain (MIT). It does not copy any third-party template.
#let letter(
  sender: (:),
  recipient: (:),
  place: none,
  date: none,
  subject: none,
  reference: none,
  salutation: none,
  closing: [Kind regards,],
  signature: none,
  enclosures: none,
  font: ("Arial",),
  fontsize: 10.5pt,
  lang: "en",
  accent: rgb("#1F3A5F"),
  doc,
) = {
  set text(font: font, size: fontsize, lang: lang, fallback: true)
  set par(justify: false, leading: 0.7em, spacing: 1.1em)
  set page(numbering: none)
  set document(title: if subject != none { subject } else { "Letter" })
  show link: set text(fill: accent)

  // Sender block: name large, details small, a thin rule underneath.
  block(below: 1.4em)[
    #if sender.at("name", default: none) != none [
      #text(size: 1.6em, weight: "bold", fill: accent)[#sender.name]
      #v(0.2em)
    ]
    #let bits = ()
    #for line in sender.at("address", default: ()) { bits.push(line) }
    #if sender.at("email", default: none) != none { bits.push(sender.email) }
    #if sender.at("phone", default: none) != none { bits.push(sender.phone) }
    #if sender.at("link", default: none) != none { bits.push(sender.link) }
    #text(size: 0.9em, fill: luma(90))[#bits.join([ #h(0.4em) | #h(0.4em) ])]
    #v(0.5em)
    #line(length: 100%, stroke: 0.8pt + accent)
  ]

  // Recipient block on the left, place and date on the right.
  let recipient-lines = ()
  for key in ("name", "role", "company") {
    let v = recipient.at(key, default: none)
    if v != none { recipient-lines.push(v) }
  }
  for line in recipient.at("address", default: ()) { recipient-lines.push(line) }
  let place-date = ()
  if place != none { place-date.push(place) }
  if date != none { place-date.push(date) }
  grid(
    columns: (1fr, 1fr),
    column-gutter: 1em,
    recipient-lines.join(linebreak()),
    align(right, place-date.join([, ])),
  )

  v(1.6em)
  if subject != none {
    text(weight: "bold")[#subject]
    if reference != none [ #h(0.5em) #text(size: 0.9em, fill: luma(90))[(#reference)]]
    v(0.9em)
  }

  if salutation != none { block(below: 0.9em)[#salutation] }

  doc

  v(0.8em)
  closing
  v(2.2em)
  if signature != none { text(weight: "bold")[#signature] }
  if enclosures != none {
    v(1.4em)
    text(size: 0.9em, fill: luma(90))[Enclosures: #enclosures]
  }
}
