// Adapted from quarto-awesomecv-typst (MIT) — https://github.com/kazuyanagimoto/quarto-awesomecv-typst @ 33e70a3ef0bcf28960773f2f8438861ed94b5b4a (v0.3.3). Changes: see PATCHES.md.
#show: resume.with(
$if(title)$
  title: [$title$],
  title-meta: "$title-meta$$if(title-meta)$$else$$title$$endif$",
$endif$
$if(date)$
  date: [$date$],
$endif$
$if(author)$
  author: (
    firstname: unescape_text("$author.firstname$"),
    lastname: unescape_text("$author.lastname$"),
    address: unescape_text("$author.address$"),
    position: unescape_text("$author.position$"),
    contacts: ($for(author.contacts)$(
      text: unescape_text("$it.text$"),
      url: unescape_text("$it.url$"),
      icon: unescape_text("$it.icon$"),
    )$sep$, $endfor$),
  ),
  author-meta: "$author.firstname$" + " " + "$author.lastname$",
$endif$
$if(profile-photo)$
  profile-photo: unescape_text("$profile-photo$"),
$endif$
$if(style.font-header)$
  font-header: ("$style.font-header$",),
$elseif(brand.defaults.awesomecv-typst.font-header)$
  font-header: ("$brand.defaults.awesomecv-typst.font-header$", ),
$elseif(brand.typography.headings.family)$
  // Alterbrain patch: the name at the top uses the brand's heading font.
  font-header: $brand.typography.headings.family$ + ("Arial",),
$endif$
$if(style.font-text)$
  font-text: ("$style.font-text$",),
$elseif(brand.typography.base.family)$
  font-text: $brand.typography.base.family$ + ("Arial",),
$endif$
$if(style.color-accent)$
  color-accent: rgb("$style.color-accent$"),
$else$
  // Alterbrain patch: take the accent from the brand file (color.primary). Quarto always defines brand-color, empty if no brand.
  color-accent: brand-color.at("primary", default: rgb("#dc3522")),
$endif$
$if(style.color-link)$
  color-link: rgb("$style.color-link$"),
$else$
  color-link: brand-color.at("link", default: color-darknight),
$endif$
$if(keywords)$
  keywords: [$for(keywords)$$keywords$$sep$, $endfor$],
  keywords-meta: ($for(keywords)$"$keywords$"$sep$, $endfor$),
$endif$
)