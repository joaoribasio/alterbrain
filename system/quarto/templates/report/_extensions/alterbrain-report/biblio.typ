$if(citations)$
$if(csl)$

// Alterbrain: Pandoc escapes the underscore in "_extensions" inside this path. Take the backslash out again.
#set bibliography(style: "$csl$".replace("\\", ""))
$elseif(bibliographystyle)$

#set bibliography(style: "$bibliographystyle$")
$endif$
$if(bibliography)$
$if(suppress-bibliography)$
#show bibliography: none
$endif$

#bibliography(
  ($for(bibliography)$"$bibliography$"$sep$,$endfor$),
  title: [$if(reference-section-title)$$reference-section-title$$else$References$endif$],
)
$endif$
$endif$
