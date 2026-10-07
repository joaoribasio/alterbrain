#show: doc => report(
$if(title)$
  title: [$title$],
$endif$
$if(subtitle)$
  subtitle: [$subtitle$],
$endif$
$if(short-title)$
  short-title: [$short-title$],
$endif$
$if(by-author)$
  authors: (
$for(by-author)$
$if(it.name.literal)$
    ( name: [$it.name.literal$],
      affiliation: [$for(it.affiliations)$$it.name$$sep$, $endfor$] ),
$endif$
$endfor$
  ),
$endif$
$if(course)$
  course: [$course$],
$endif$
$if(programme)$
  programme: [$programme$],
$endif$
$if(date)$
  date: [$date$],
$endif$
$if(lang)$
  lang: "$lang$",
$endif$
$if(region)$
  region: "$region$",
$endif$
$if(abstract)$
  abstract: [$abstract$],
  abstract-title: "$labels.abstract$",
$endif$
$if(mainfont)$
  font: ("$mainfont$",),
$elseif(brand.typography.base.family)$
  font: $brand.typography.base.family$ + ("Arial",),
$endif$
$if(fontsize)$
  fontsize: $fontsize$,
$endif$
$if(brand.typography.headings.family)$
  heading-family: $brand.typography.headings.family$ + ("Arial",),
$endif$
$if(section-numbering)$
  sectionnumbering: "$section-numbering$",
$endif$
$if(codefont)$
  codefont: ($for(codefont)$"$codefont$",$endfor$),
$elseif(brand.typography.monospace.family)$
  codefont: $brand.typography.monospace.family$,
$endif$
$if(line-spacing)$
  line-spacing: $line-spacing$,
$endif$
$if(paragraph-spacing)$
  paragraph-spacing: $paragraph-spacing$,
$endif$
$if(first-line-indent)$
  first-line-indent: $first-line-indent$,
$endif$
$if(left-aligned)$
  justify: false,
$endif$
$if(keywords)$
  keywords: ($for(keywords)$"$keywords$",$endfor$),
$endif$
$if(toc)$
  toc: $toc$,
$endif$
$if(toc-title)$
  toc_title: [$toc-title$],
$endif$
$if(toc-depth)$
  toc_depth: $toc-depth$,
$endif$
  accent: brand-color.at("primary", default: rgb("#1F3A5F")),
  accent-soft: brand-color.at("mist", default: rgb("#EEF2F7")),
  doc,
)
