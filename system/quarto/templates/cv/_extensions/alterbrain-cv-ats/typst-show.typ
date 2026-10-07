#show: doc => cv-ats(
$if(title)$
  title: "$title$",
$endif$
$if(author)$
  author: (
    firstname: "$author.firstname$",
    lastname: "$author.lastname$",
    position: "$author.position$",
    address: "$author.address$",
    contacts: ($for(author.contacts)$(
      text: "$it.text$",
      url: "$it.url$",
    ),$endfor$),
  ),
$endif$
$if(mainfont)$
  font: ("$mainfont$",),
$elseif(brand.typography.base.family)$
  font: $brand.typography.base.family$ + ("Arial",),
$endif$
$if(lang)$
  lang: "$lang$",
$endif$
  doc,
)
